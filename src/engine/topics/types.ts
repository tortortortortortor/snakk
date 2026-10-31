export interface Topic {
  id: string;
  title: string;
  summary: string;
  /** Every keyword assigned to this topic, in arrival order. */
  keywords: string[];
  /** Keywords whose bubble has reached the blob. These are drawn on its surface. */
  landedKeywords: string[];
  parentId: string | null;
  /** Words spoken while this topic was current. Drives blob size. */
  weight: number;
  createdAt: number;
  lastActiveAt: number;
  /** Index into the palette; children inherit their parent's. */
  colorIndex: number;
}

export interface Segment {
  id: string;
  text: string;
  lang: string;
  startMs: number;
  endMs: number;
  topicId?: string;
  latencyMs?: number;
}

/**
 * A keyword the categorizer assigned to a topic that has not arrived on screen yet. A visualization
 * either animates it and calls `landKeyword` when it arrives, or lets the shell land it after `delayMs`.
 */
export interface PendingKeyword {
  id: string;
  keyword: string;
  targetTopicId: string;
  spawnedAt: number;
  /** Stagger so several keywords from one response do not launch at once. */
  delayMs: number;
}

export interface TopicState {
  topics: Record<string, Topic>;
  /** Creation order. */
  order: string[];
  currentTopicId: string | null;
  /** Where the talk has been: one entry each time the current topic changes, so returns show up too. */
  trail: { topicId: string; at: number }[];
  lastNewTopicAt: number;
  seq: number;
}

export const emptyTopicState = (): TopicState => ({
  topics: {},
  order: [],
  currentTopicId: null,
  trail: [],
  lastNewTopicAt: -Infinity,
  seq: 0,
});
