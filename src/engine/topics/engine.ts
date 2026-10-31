import type { CategorizeRequest, CategorizeResponse } from '../../../shared/topics';
import type { Segment, TopicState } from './types';

export interface TopicEngineConfig {
  /** Flush right after a pause once this many words are buffered. */
  minWords: number;
  /** Flush even mid-flow when the buffer gets this long. */
  maxWords: number;
  /** A short buffer is flushed after this much silence. */
  quietFlushMs: number;
  contextSegments: number;
}

export const DEFAULT_ENGINE_CONFIG: TopicEngineConfig = {
  minWords: 8,
  maxWords: 40,
  quietFlushMs: 2500,
  contextSegments: 3,
};

export interface TopicEngineDeps {
  categorize(req: CategorizeRequest): Promise<CategorizeResponse>;
  getState(): TopicState;
  /** Called with the response and the segments it covers. */
  onResponse(res: CategorizeResponse, segments: Segment[], words: number): void;
  onError(err: Error, segments: Segment[]): void;
  onStatus?(status: { inFlight: boolean; buffered: number }): void;
  getVocabulary?(): string;
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
}

export const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Buffers final transcript segments and decides when to ask the categorizer.
 * Every final segment arrives right after a pause (that is how the VAD cuts audio),
 * so "after a pause" means "when a final arrives". One request is in flight at a time;
 * text that arrives meanwhile is sent with the next request.
 */
export class TopicEngine {
  private buffer: Segment[] = [];
  private history: Segment[] = [];
  private inFlight = false;
  private speaking = false;
  private quietTimer: unknown = null;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;

  constructor(
    private readonly deps: TopicEngineDeps,
    private readonly config: TopicEngineConfig = DEFAULT_ENGINE_CONFIG,
  ) {
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  get bufferedWords(): number {
    return this.buffer.reduce((n, s) => n + countWords(s.text), 0);
  }

  speechStart(): void {
    this.speaking = true;
    this.cancelQuietTimer();
  }

  speechEnd(): void {
    this.speaking = false;
  }

  /** Add a final segment. `force` flushes immediately (typed input, end of session). */
  addFinal(segment: Segment, force = false): void {
    if (!segment.text.trim()) return;
    this.buffer.push(segment);
    this.cancelQuietTimer();
    const words = this.bufferedWords;
    if (force || words >= this.config.minWords || words >= this.config.maxWords) {
      void this.flush();
    } else {
      this.quietTimer = this.setTimer(() => {
        this.quietTimer = null;
        if (!this.speaking) void this.flush();
      }, this.config.quietFlushMs);
    }
    this.emitStatus();
  }

  async flush(): Promise<void> {
    if (this.inFlight || this.buffer.length === 0) return;
    this.cancelQuietTimer();
    const segments = this.buffer;
    this.buffer = [];
    this.inFlight = true;
    this.emitStatus();

    const state = this.deps.getState();
    const utterance = segments.map((s) => s.text).join(' ');
    const words = countWords(utterance);
    const req: CategorizeRequest = {
      topics: state.order.map((id) => {
        const t = state.topics[id];
        return { id: t.id, title: t.title, parentId: t.parentId, keywords: t.keywords.slice(-12), summary: t.summary };
      }),
      currentTopicId: state.currentTopicId,
      context: this.history.slice(-this.config.contextSegments).map((s) => s.text),
      utterance,
      language: segments[segments.length - 1]?.lang,
      vocabulary: this.deps.getVocabulary?.() || undefined,
    };

    try {
      const res = await this.deps.categorize(req);
      this.deps.onResponse(res, segments, words);
      this.history.push(...segments);
    } catch (err) {
      this.deps.onError(err as Error, segments);
      this.history.push(...segments);
    } finally {
      this.inFlight = false;
      this.emitStatus();
      const pending = this.bufferedWords;
      if (pending >= this.config.minWords) void this.flush();
      else if (pending > 0 && !this.speaking) {
        this.quietTimer = this.setTimer(() => {
          this.quietTimer = null;
          void this.flush();
        }, this.config.quietFlushMs);
      }
    }
  }

  reset(): void {
    this.cancelQuietTimer();
    this.buffer = [];
    this.history = [];
    this.emitStatus();
  }

  private cancelQuietTimer() {
    if (this.quietTimer !== null) this.clearTimer(this.quietTimer);
    this.quietTimer = null;
  }

  private emitStatus() {
    this.deps.onStatus?.({ inFlight: this.inFlight, buffered: this.bufferedWords });
  }
}
