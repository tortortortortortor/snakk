import type { TopicOp, TopicOpsResponse } from '@shared/topics';
import type { PendingKeyword, Topic, TopicState } from './types';

export const ANTI_FLICKER_MS = 15_000;
export const KEYWORD_STAGGER_MS = 380;

export interface ApplyResult {
  state: TopicState;
  pending: PendingKeyword[];
  /** Ops after guardrails, with ids resolved. Useful for the debug drawer. */
  applied: TopicOp[];
  /** Topic the utterance was attributed to. */
  topicId: string | null;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Applies a categorizer response to the topic tree. Pure: returns a new state.
 * Guardrails: depth <= 2, case-insensitive keyword dedupe, duplicate-title merge,
 * and a thin new topic shortly after another one is folded into the current topic.
 */
export function applyTopicOps(
  prev: TopicState,
  response: TopicOpsResponse,
  opts: { now: number; words: number },
): ApplyResult {
  const state: TopicState = {
    ...prev,
    topics: Object.fromEntries(Object.entries(prev.topics).map(([k, t]) => [k, { ...t, keywords: [...t.keywords] }])),
    order: [...prev.order],
  };
  const idMap = new Map<string, string>();
  const pending: PendingKeyword[] = [];
  const applied: TopicOp[] = [];
  const resolve = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const mapped = idMap.get(id);
    if (mapped) return mapped;
    return state.topics[id] ? id : null;
  };

  const addKeywords = (topic: Topic, keywords: string[]) => {
    const have = new Set(topic.keywords.map(norm));
    const fresh: string[] = [];
    for (const raw of keywords) {
      const k = raw.trim();
      if (!k || k.length > 40 || have.has(norm(k))) continue;
      have.add(norm(k));
      fresh.push(k);
    }
    for (const k of fresh) {
      topic.keywords.push(k);
      state.seq += 1;
      pending.push({
        id: `b${state.seq}`,
        keyword: k,
        targetTopicId: topic.id,
        spawnedAt: opts.now,
        delayMs: pending.length * KEYWORD_STAGGER_MS,
      });
    }
    if (fresh.length) topic.lastActiveAt = opts.now;
    return fresh;
  };

  for (const op of response.ops) {
    switch (op.op) {
      case 'new_topic': {
        let parentId = resolve(op.parentId);
        if (parentId && state.topics[parentId].parentId) parentId = state.topics[parentId].parentId;

        const current = resolve(state.currentTopicId);
        const thin = op.keywords.filter((k) => k.trim()).length < 2;
        if (current && thin && opts.now - state.lastNewTopicAt < ANTI_FLICKER_MS) {
          idMap.set(op.tempId, current);
          const fresh = addKeywords(state.topics[current], op.keywords);
          applied.push({ op: 'add_keywords', topicId: current, keywords: fresh });
          break;
        }
        const twin = Object.values(state.topics).find(
          (t) => norm(t.title) === norm(op.title) && t.parentId === parentId,
        );
        if (twin) {
          idMap.set(op.tempId, twin.id);
          const fresh = addKeywords(twin, op.keywords);
          applied.push({ op: 'add_keywords', topicId: twin.id, keywords: fresh });
          break;
        }
        state.seq += 1;
        const id = `topic${state.seq}`;
        const rootCount = state.order.filter((tid) => !state.topics[tid].parentId).length;
        const topic: Topic = {
          id,
          title: op.title.trim() || 'Untitled',
          summary: op.summary,
          keywords: [],
          landedKeywords: [],
          parentId,
          weight: 0,
          createdAt: opts.now,
          lastActiveAt: opts.now,
          colorIndex: parentId ? state.topics[parentId].colorIndex : rootCount,
        };
        state.topics[id] = topic;
        state.order.push(id);
        state.lastNewTopicAt = opts.now;
        idMap.set(op.tempId, id);
        addKeywords(topic, op.keywords);
        applied.push({ ...op, tempId: id, parentId });
        break;
      }
      case 'add_keywords': {
        const id = resolve(op.topicId);
        if (!id) break;
        const fresh = addKeywords(state.topics[id], op.keywords);
        if (fresh.length) applied.push({ op: 'add_keywords', topicId: id, keywords: fresh });
        break;
      }
      case 'update_summary': {
        const id = resolve(op.topicId);
        if (!id) break;
        state.topics[id] = { ...state.topics[id], summary: op.summary };
        applied.push({ ...op, topicId: id });
        break;
      }
      case 'rename': {
        const id = resolve(op.topicId);
        if (!id || !op.title.trim()) break;
        state.topics[id] = { ...state.topics[id], title: op.title.trim() };
        applied.push({ ...op, topicId: id });
        break;
      }
    }
  }

  const topicId = resolve(response.current_topic_id) ?? resolve(state.currentTopicId);
  if (topicId && topicId !== prev.currentTopicId) state.trail = [...prev.trail, { topicId, at: opts.now }];
  state.currentTopicId = topicId;
  if (topicId) {
    const t = state.topics[topicId];
    state.topics[topicId] = { ...t, weight: t.weight + opts.words, lastActiveAt: opts.now };
  }
  return { state, pending, applied, topicId };
}

/** Marks a pending keyword as landed on its topic. */
export function markLanded(prev: TopicState, topicId: string, keyword: string): TopicState {
  const t = prev.topics[topicId];
  if (!t || t.landedKeywords.includes(keyword)) return prev;
  return { ...prev, topics: { ...prev.topics, [topicId]: { ...t, landedKeywords: [...t.landedKeywords, keyword] } } };
}
