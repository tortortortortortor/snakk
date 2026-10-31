import { useEffect, useRef, useState } from 'react';
import { useSnakk } from '../engine/store';
import {
  recorder,
  refreshHealth,
  resetSession,

  startLive,
  startReplay,
  stopLive,
  stopReplay,
  submitText,
} from '../engine/session/controller';
import { DEMO_SESSION } from '../engine/session/demo';
import { parseSessionFile } from '../engine/session/recorder';
import { VISUALIZATIONS } from '../visuals/registry';
import { DebugDrawer } from './DebugDrawer';
import { useShell } from './shell';

export function Overlay() {
  const presenter = useSnakk((s) => s.presenter);
  const set = useSnakk((s) => s.set);

  useEffect(() => {
    void refreshHealth();
    const id = setInterval(refreshHealth, 15_000);
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'p') set({ presenter: !useSnakk.getState().presenter });
      if (e.key === 'Escape') set({ presenter: false });
      if (e.key === 'd') set({ drawerOpen: !useSnakk.getState().drawerOpen });
      if (e.key === 'v') {
        const { viz, setViz } = useShell.getState();
        setViz(VISUALIZATIONS[(VISUALIZATIONS.indexOf(viz) + 1) % VISUALIZATIONS.length]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [set]);

  return (
    <div className={`overlay${presenter ? ' presenter' : ''}`}>
      {!presenter && <TopBar />}
      <Notice />
      <EmptyState />
      <Captions />
      {!presenter && <Controls />}
      {!presenter && <DebugDrawer />}
    </div>
  );
}

function TopBar() {
  const health = useSnakk((s) => s.health);
  const micStatus = useSnakk((s) => s.micStatus);
  const categorizing = useSnakk((s) => s.categorizing);
  const buffered = useSnakk((s) => s.bufferedWords);
  const override = useSnakk((s) => s.providerOverride);
  return (
    <header className="topbar">
      <span className="wordmark">snakk</span>
      <ViewPicker />
      <Chip ok={health?.stt.ok} label={health ? `${health.stt.engine} · ${health.stt.model.replace(/^ggml-|\.bin$/g, '')}` : 'speech: …'} title={health?.stt.detail} />
      <Chip
        ok={override === 'offline' ? true : health?.topics.ok}
        label={override === 'offline' ? 'topics: offline heuristic' : health ? `topics: ${health.topics.provider} · ${health.topics.model}` : 'topics: …'}
        title={health?.topics.detail}
      />
      <Chip ok={micStatus === 'error' ? false : micStatus === 'listening' ? true : undefined} label={`mic: ${micStatus}`} />
      {(categorizing || buffered > 0) && (
        <span className="chip busy">{categorizing ? 'thinking…' : `${buffered} words waiting`}</span>
      )}
    </header>
  );
}

function Chip({ ok, label, title }: { ok?: boolean; label: string; title?: string }) {
  return (
    <span className={`chip ${ok === undefined ? '' : ok ? 'ok' : 'bad'}`} title={title}>
      <i />
      {label}
    </span>
  );
}

function Notice() {
  const notice = useSnakk((s) => s.notice);
  const set = useSnakk((s) => s.set);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => set({ notice: null }), 8000);
    return () => clearTimeout(id);
  }, [notice, set]);
  if (!notice) return null;
  return (
    <button className="notice" onClick={() => set({ notice: null })}>
      {notice}
    </button>
  );
}

function EmptyState() {
  const empty = useSnakk((s) => s.topicState.order.length === 0 && s.segments.length === 0);
  const mode = useSnakk((s) => s.mode);
  if (!empty || mode !== 'idle') return null;
  return (
    <div className="empty">
      <h1>Talk, and watch the topics form.</h1>
      <p>
        Press <b>Record</b> and start your lecture. Speech is transcribed on this Mac. At each pause, Claude sorts what
        you said into topics. Or press <b>Demo</b> to watch a scripted talk.
      </p>
    </div>
  );
}

/** Switch between visualizations of the same talk (V cycles). */
function ViewPicker() {
  const viz = useShell((s) => s.viz);
  const setViz = useShell((s) => s.setViz);
  return (
    <div className="viewpicker" role="radiogroup" aria-label="Visualization">
      {VISUALIZATIONS.map((v) => (
        <button key={v.id} role="radio" aria-checked={v === viz} className={v === viz ? 'active' : ''} title={`${v.description} (V cycles)`} onClick={() => setViz(v)}>
          {v.name}
        </button>
      ))}
    </div>
  );
}

function Captions() {
  const segments = useSnakk((s) => s.segments);
  const interim = useSnakk((s) => s.interim);
  const speaking = useSnakk((s) => s.speaking);
  const level = useSnakk((s) => s.level);
  const language = useSnakk((s) => s.language);
  const mode = useSnakk((s) => s.mode);
  // Keep roughly three lines: the newest words stay, older text is trimmed from the front.
  const BUDGET = 240;
  const last = segments.at(-1)?.text ?? '';
  const room = Math.max(0, BUDGET - interim.length - (interim ? 0 : last.length));
  let past = (interim ? segments.slice(-2) : segments.slice(-3, -1)).map((s) => s.text).join(' ');
  if (past.length > room) past = room > 20 ? '… ' + past.slice(past.length - room).replace(/^\S*\s/, '') : '';
  const current = interim ? '' : last;
  if (mode === 'idle' && segments.length === 0) return null;
  return (
    <div className="captions">
      <div className="caption-meta">
        <span className={`speaking-dot${speaking ? ' on' : ''}`} style={{ transform: `scale(${1 + Math.min(level * 12, 1.2)})` }} />
        {language && <span className="lang">{language.toUpperCase()}</span>}
      </div>
      <p>
        {past && <span className="past">{past} </span>}
        {current && <span className="last">{current} </span>}
        {interim && <span className="interim">{interim}</span>}
      </p>
    </div>
  );
}

function Controls() {
  const mode = useSnakk((s) => s.mode);
  const micStatus = useSnakk((s) => s.micStatus);
  const drawerOpen = useSnakk((s) => s.drawerOpen);
  const set = useSnakk((s) => s.set);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const session = parseSessionFile(await file.text());
      const recategorize = window.confirm(
        'Replay this session.\n\nOK: send the transcript to the categorizer again (tests the prompt).\nCancel: re-use the recorded topics (no API calls).',
      );
      startReplay(session, { speed: 2, mode: recategorize ? 'recategorize' : 'recorded' });
    } catch (err) {
      set({ notice: (err as Error).message });
    }
  };

  return (
    <div className="controls">
      {typing && (
        <form
          className="typebox"
          onSubmit={(e) => {
            e.preventDefault();
            submitText(text);
            setText('');
          }}
        >
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a sentence as if you said it, then Enter" />
        </form>
      )}
      <div className="buttons">
        {mode === 'live' ? (
          <button className="primary rec on" onClick={() => void stopLive()}>
            <span className="rec-dot" /> Stop
          </button>
        ) : (
          <button className="primary rec" onClick={() => void startLive()} disabled={micStatus === 'loading'}>
            <span className="rec-dot" /> {micStatus === 'loading' ? 'Loading…' : 'Record'}
          </button>
        )}
        {mode === 'replay' ? (
          <button onClick={stopReplay}>Stop replay</button>
        ) : (
          <button onClick={() => startReplay(DEMO_SESSION, { speed: 1, mode: 'recategorize' })} disabled={mode === 'live'}>
            Demo
          </button>
        )}
        <button onClick={() => setTyping(!typing)} className={typing ? 'active' : ''}>
          Type
        </button>
        <button onClick={() => fileInput.current?.click()} disabled={mode === 'live'}>
          Replay…
        </button>
        <button onClick={() => (recorder.size ? recorder.download() : set({ notice: 'Nothing recorded yet.' }))}>Save</button>
        <button
          onClick={() => {
            if (window.confirm('Clear all topics and the transcript?')) resetSession();
          }}
        >
          Reset
        </button>
        <button onClick={() => set({ drawerOpen: !drawerOpen })} className={drawerOpen ? 'active' : ''}>
          Debug
        </button>
        <button onClick={() => set({ presenter: true })} title="Presenter mode (P, Esc to leave)">
          Present
        </button>
        <input ref={fileInput} type="file" accept="application/json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}

