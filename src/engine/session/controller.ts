import type { CategorizeRequest, CategorizeResponse, HealthResponse } from '../../../shared/topics';
import { useSnakk } from '../store';
import { TopicEngine } from '../topics/engine';
import type { Segment } from '../topics/types';
import { LocalVadWhisperSource } from '../transcript/local-vad-whisper';
import type { FinalTranscript } from '../transcript/source';
import { SessionRecorder, type SessionEvent, type SessionFile } from './recorder';

const store = useSnakk;
export const recorder = new SessionRecorder();
let source: LocalVadWhisperSource | null = null;
let replayTimers: ReturnType<typeof setTimeout>[] = [];
let replayUsesRecorded = false;

async function postTopics(req: CategorizeRequest, provider?: 'offline'): Promise<CategorizeResponse> {
  const res = await fetch(`/api/topics${provider ? '?provider=offline' : ''}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `categorize failed (${res.status})`);
  return json as CategorizeResponse;
}

/** Server provider first; if it fails, the offline heuristic keeps the show going. */
async function categorize(req: CategorizeRequest): Promise<CategorizeResponse> {
  if (store.getState().providerOverride === 'offline') return postTopics(req, 'offline');
  try {
    return await postTopics(req);
  } catch (err) {
    store.getState().set({ notice: `Categorizer failed, used offline fallback: ${(err as Error).message}` });
    return postTopics(req, 'offline');
  }
}

export const engine = new TopicEngine({
  categorize,
  getState: () => store.getState().topicState,
  onResponse: (res, segments, words) => {
    if (!replayUsesRecorded) {
      recorder.record({ type: 'categorized', segmentIds: segments.map((s) => s.id), words, response: res });
    }
    store.getState().applyResponse(res, segments, words);
  },
  onError: (err, segments) => {
    store.getState().logError(segments.map((s) => s.text).join(' '), err.message);
    store.getState().set({ notice: err.message });
  },
  onStatus: ({ inFlight, buffered }) => store.getState().set({ categorizing: inFlight, bufferedWords: buffered }),
  getVocabulary: () => store.getState().vocabulary,
});

function toSegment(f: FinalTranscript): Segment {
  return { id: f.id, text: f.text, lang: f.lang, startMs: f.startMs, endMs: f.endMs, latencyMs: f.latencyMs };
}

// ---- pipeline entry points (live, typed text and replay all go through these) ----

export function handleSpeechStart() {
  recorder.record({ type: 'speechStart' });
  store.getState().set({ speaking: true });
  engine.speechStart();
}

export function handleSpeechEnd() {
  recorder.record({ type: 'speechEnd' });
  store.getState().set({ speaking: false });
  engine.speechEnd();
}

export function handleInterim(text: string, lang: string) {
  recorder.record({ type: 'interim', text, lang });
  store.getState().set({ interim: text, language: lang || store.getState().language });
}

export function handleFinal(f: FinalTranscript, force = false) {
  recorder.record({ type: 'final', segment: f, forced: force });
  const seg = toSegment(f);
  store.getState().addSegment(seg);
  if (!replayUsesRecorded) engine.addFinal(seg, force);
}

// ---- live microphone ----

export async function startLive() {
  stopReplay();
  if (!source) {
    source = new LocalVadWhisperSource();
    source.setOptions({ vocabulary: store.getState().vocabulary });
    store.subscribe((s, prev) => {
      if (s.vocabulary !== prev.vocabulary) source?.setOptions({ vocabulary: s.vocabulary });
    });
    source.on('speechStart', handleSpeechStart);
    source.on('speechEnd', handleSpeechEnd);
    source.on('interim', ({ text, lang }) => handleInterim(text, lang));
    source.on('final', (f) => handleFinal(f));
    source.on('level', ({ rms }) => store.getState().set({ level: rms }));
    source.on('status', ({ state, detail }) => store.getState().set({ micStatus: state, micDetail: detail }));
    source.on('error', ({ message }) => store.getState().set({ notice: message }));
  }
  store.getState().set({ mode: 'live' });
  try {
    await source.start();
  } catch {
    store.getState().set({ mode: 'idle' });
  }
}

export async function stopLive() {
  await source?.stop();
  store.getState().set({ mode: 'idle', speaking: false, level: 0 });
  void engine.flush();
}

export function setVadOptions(opts: Parameters<LocalVadWhisperSource['setOptions']>[0]) {
  source?.setOptions(opts);
}

// ---- typed input ----

let typedSeq = 0;
export function submitText(text: string) {
  const clean = text.trim();
  if (!clean) return;
  const now = Math.round(performance.now());
  handleFinal({ id: `typed${++typedSeq}`, text: clean, lang: store.getState().language || 'en', startMs: now, endMs: now, latencyMs: 0 }, true);
}

// ---- replay ----

/**
 * recorded: re-applies the categorizer responses stored in the file (no API calls).
 * recategorize: feeds the recorded transcript through the engine again, for prompt work.
 * fromMs: everything before this point is applied at once (keywords already landed), and the
 * replay plays on from there. Used to look at one moment of a long lecture.
 */
export function startReplay(file: SessionFile, opts: { speed: number; mode: 'recorded' | 'recategorize'; fromMs?: number }) {
  stopReplay();
  void source?.stop();
  resetSession();
  replayUsesRecorded = opts.mode === 'recorded';
  store.getState().set({ mode: 'replay' });
  const finals = new Map<string, Segment>();
  const from = opts.fromMs ?? 0;
  const lastT = Math.max(0, (file.events.at(-1)?.t ?? 0) - from);
  const play = (ev: SessionEvent) => {
    switch (ev.type) {
      case 'speechStart':
        return handleSpeechStart();
      case 'speechEnd':
        return handleSpeechEnd();
      case 'interim':
        return handleInterim(ev.text, ev.lang);
      case 'final':
        finals.set(ev.segment.id, toSegment(ev.segment));
        return handleFinal(ev.segment, ev.forced);
      case 'categorized':
        if (replayUsesRecorded) {
          const segs = ev.segmentIds.map((id) => finals.get(id)).filter((s): s is Segment => !!s);
          store.getState().applyResponse(ev.response, segs, ev.words);
        }
    }
  };
  for (const ev of file.events) {
    if (ev.t < from) {
      play(ev);
      continue;
    }
    const delay = opts.speed === Infinity ? 0 : (ev.t - from) / opts.speed;
    replayTimers.push(setTimeout(() => play(ev), delay));
  }
  if (from > 0) for (const b of store.getState().pendingKeywords) store.getState().landKeyword(b.id);
  replayTimers.push(
    setTimeout(() => {
      void engine.flush();
      replayUsesRecorded = false;
      store.getState().set({ mode: 'idle' });
    }, (opts.speed === Infinity ? 0 : lastT / opts.speed) + 50),
  );
}

export function stopReplay() {
  replayTimers.forEach(clearTimeout);
  replayTimers = [];
  replayUsesRecorded = false;
  if (store.getState().mode === 'replay') store.getState().set({ mode: 'idle' });
}

// ---- session ----

export function resetSession() {
  engine.reset();
  recorder.clear();
  store.getState().resetSession();
}

export async function refreshHealth() {
  try {
    const res = await fetch('/api/health');
    store.getState().set({ health: (await res.json()) as HealthResponse });
  } catch {
    store.getState().set({ health: null, notice: 'API server not reachable. Is `npm run dev` running?' });
  }
}
