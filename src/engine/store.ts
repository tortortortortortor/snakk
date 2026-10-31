import { create } from 'zustand';
import type { CategorizeResponse, HealthResponse, TopicOp } from '../../shared/topics';
import { applyTopicOps, markLanded } from './topics/reducer';
import { emptyTopicState, type PendingKeyword, type Segment, type TopicState } from './topics/types';

export interface OpsLogEntry {
  at: number;
  utterance: string;
  applied: TopicOp[];
  provider: string;
  latencyMs: number;
  error?: string;
}

export type Mode = 'idle' | 'live' | 'replay';

interface SnakkState {
  mode: Mode;
  micStatus: 'idle' | 'loading' | 'listening' | 'error';
  micDetail?: string;
  health: HealthResponse | null;
  speaking: boolean;
  level: number;
  interim: string;
  language: string;
  segments: Segment[];
  topicState: TopicState;
  /** Keywords on their way to a topic; see `PendingKeyword`. */
  pendingKeywords: PendingKeyword[];
  /** Topic id -> performance.now() of the last keyword landing on it. */
  landedAt: Record<string, number>;
  categorizing: boolean;
  bufferedWords: number;
  opsLog: OpsLogEntry[];
  notice: string | null;
  presenter: boolean;
  drawerOpen: boolean;
  providerOverride: 'server' | 'offline';
  vocabulary: string;

  set: (patch: Partial<SnakkState>) => void;
  addSegment: (s: Segment) => void;
  applyResponse: (res: CategorizeResponse, segments: Segment[], words: number) => void;
  logError: (utterance: string, error: string) => void;
  /** A pending keyword has arrived at its topic. */
  landKeyword: (id: string) => void;
  resetSession: () => void;
}

export const useSnakk = create<SnakkState>((set, get) => ({
  mode: 'idle',
  micStatus: 'idle',
  health: null,
  speaking: false,
  level: 0,
  interim: '',
  language: '',
  segments: [],
  topicState: emptyTopicState(),
  pendingKeywords: [],
  landedAt: {},
  categorizing: false,
  bufferedWords: 0,
  opsLog: [],
  notice: null,
  presenter: false,
  drawerOpen: false,
  providerOverride: 'server',
  vocabulary: readVocabulary(),

  set: (patch) => {
    if (patch.vocabulary !== undefined) writeVocabulary(patch.vocabulary);
    set(patch);
  },

  addSegment: (s) => set((st) => ({ segments: [...st.segments, s], interim: '', language: s.lang || st.language })),

  applyResponse: (res, segments, words) => {
    const { state, pending, applied, topicId } = applyTopicOps(get().topicState, res, { now: Date.now(), words });
    const ids = new Set(segments.map((s) => s.id));
    set((st) => ({
      topicState: state,
      pendingKeywords: [...st.pendingKeywords, ...pending],
      segments: st.segments.map((s) => (ids.has(s.id) ? { ...s, topicId: topicId ?? undefined } : s)),
      opsLog: [
        ...st.opsLog.slice(-99),
        {
          at: Date.now(),
          utterance: segments.map((s) => s.text).join(' '),
          applied,
          provider: `${res.provider}/${res.model}`,
          latencyMs: res.latencyMs,
        },
      ],
    }));
  },

  logError: (utterance, error) =>
    set((st) => ({
      opsLog: [...st.opsLog.slice(-99), { at: Date.now(), utterance, applied: [], provider: '-', latencyMs: 0, error }],
    })),

  landKeyword: (id) => {
    const b = get().pendingKeywords.find((x) => x.id === id);
    if (!b) return;
    set((st) => ({
      pendingKeywords: st.pendingKeywords.filter((x) => x.id !== id),
      topicState: markLanded(st.topicState, b.targetTopicId, b.keyword),
      landedAt: { ...st.landedAt, [b.targetTopicId]: performance.now() },
    }));
  },

  resetSession: () =>
    set({
      segments: [],
      topicState: emptyTopicState(),
      pendingKeywords: [],
      landedAt: {},
      opsLog: [],
      interim: '',
      bufferedWords: 0,
    }),
}));

// The vocabulary is a per-browser convenience; storage may be unavailable (private mode).
function readVocabulary(): string {
  try {
    return localStorage.getItem('snakk.vocabulary') ?? '';
  } catch {
    return '';
  }
}
function writeVocabulary(v: string) {
  try {
    localStorage.setItem('snakk.vocabulary', v);
  } catch {
    /* ignore */
  }
}
