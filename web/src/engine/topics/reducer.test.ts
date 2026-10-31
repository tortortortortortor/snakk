import { describe, expect, it } from 'vitest';
import { applyTopicOps, markLanded } from './reducer';
import { emptyTopicState } from './types';

const intro = {
  utterance_language: 'en',
  current_topic_id: 'a',
  ops: [{ op: 'new_topic' as const, tempId: 'a', title: 'Introduction', parentId: null, keywords: ['Tor', 'lecture'], summary: 'Tor introduces himself.' }],
};

describe('applyTopicOps', () => {
  it('creates a root topic, maps the temp id and emits staggered pending keywords', () => {
    const r = applyTopicOps(emptyTopicState(), intro, { now: 0, words: 12 });
    expect(r.state.order).toEqual(['topic1']);
    expect(r.topicId).toBe('topic1');
    expect(r.state.topics.topic1.keywords).toEqual(['Tor', 'lecture']);
    expect(r.state.topics.topic1.weight).toBe(12);
    expect(r.pending.map((b) => [b.keyword, b.targetTopicId, b.delayMs])).toEqual([
      ['Tor', 'topic1', 0],
      ['lecture', 'topic1', 380],
    ]);
  });

  it('creates sub-topics and never nests deeper than two levels', () => {
    let s = applyTopicOps(emptyTopicState(), intro, { now: 0, words: 5 }).state;
    s = applyTopicOps(
      s,
      {
        utterance_language: 'en',
        current_topic_id: 'b',
        ops: [
          { op: 'new_topic', tempId: 'b', title: 'Background', parentId: 'topic1', keywords: ['PhD', 'academia'], summary: '' },
          { op: 'new_topic', tempId: 'c', title: 'Thesis', parentId: 'b', keywords: ['physics', 'models'], summary: '' },
        ],
      },
      { now: 20_000, words: 30 },
    ).state;
    expect(s.topics.topic4.parentId).toBe('topic1');
    expect(s.topics.topic7.parentId).toBe('topic1');
    expect(s.currentTopicId).toBe('topic4');
    expect(s.topics.topic4.weight).toBe(30);
  });

  it('folds a thin new topic shortly after another into the current topic', () => {
    const s = applyTopicOps(emptyTopicState(), intro, { now: 0, words: 5 }).state;
    const r = applyTopicOps(
      s,
      { utterance_language: 'en', current_topic_id: 'x', ops: [{ op: 'new_topic', tempId: 'x', title: 'Hobbies', parentId: null, keywords: ['skiing'], summary: '' }] },
      { now: 5_000, words: 4 },
    );
    expect(r.state.order).toHaveLength(1);
    expect(r.state.topics.topic1.keywords).toContain('skiing');
    expect(r.topicId).toBe('topic1');
  });

  it('dedupes keywords case-insensitively and ignores unknown ids', () => {
    const s = applyTopicOps(emptyTopicState(), intro, { now: 0, words: 5 }).state;
    const r = applyTopicOps(
      s,
      {
        utterance_language: 'en',
        current_topic_id: null,
        ops: [
          { op: 'add_keywords', topicId: 'topic1', keywords: ['tor', 'React', 'react'] },
          { op: 'add_keywords', topicId: 'nope', keywords: ['ghost'] },
        ],
      },
      { now: 1000, words: 3 },
    );
    expect(r.state.topics.topic1.keywords).toEqual(['Tor', 'lecture', 'React']);
    expect(r.pending).toHaveLength(1);
    expect(r.topicId).toBe('topic1');
  });

  it('merges a new topic whose title duplicates an existing sibling', () => {
    const s = applyTopicOps(emptyTopicState(), intro, { now: 0, words: 5 }).state;
    const r = applyTopicOps(
      s,
      { utterance_language: 'en', current_topic_id: 'z', ops: [{ op: 'new_topic', tempId: 'z', title: 'introduction', parentId: null, keywords: ['Bergen', 'Nordlo'], summary: '' }] },
      { now: 60_000, words: 3 },
    );
    expect(r.state.order).toHaveLength(1);
    expect(r.state.topics.topic1.keywords).toEqual(['Tor', 'lecture', 'Bergen', 'Nordlo']);
  });

  it('does not mutate the previous state and lands keywords once', () => {
    const before = emptyTopicState();
    const r = applyTopicOps(before, intro, { now: 0, words: 1 });
    expect(before.order).toEqual([]);
    const landed = markLanded(markLanded(r.state, 'topic1', 'Tor'), 'topic1', 'Tor');
    expect(landed.topics.topic1.landedKeywords).toEqual(['Tor']);
    expect(r.state.topics.topic1.landedKeywords).toEqual([]);
  });

  it('records the trail of the talk, including a return to an earlier topic', () => {
    const say = (current: string, ops: Parameters<typeof applyTopicOps>[1]['ops'] = []) => ({ utterance_language: 'en', current_topic_id: current, ops });
    let s = applyTopicOps(emptyTopicState(), intro, { now: 0, words: 5 }).state;
    s = applyTopicOps(s, say('topic1'), { now: 1, words: 5 }).state;
    s = applyTopicOps(s, say('b', [{ op: 'new_topic', tempId: 'b', title: 'Sun', parentId: null, keywords: ['plasma', 'flares'], summary: '' }]), { now: 2, words: 5 }).state;
    s = applyTopicOps(s, say('topic1'), { now: 3, words: 5 }).state;
    expect(s.trail).toEqual([
      { topicId: 'topic1', at: 0 },
      { topicId: s.order[1], at: 2 },
      { topicId: 'topic1', at: 3 },
    ]);
  });
});
