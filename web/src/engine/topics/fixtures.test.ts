import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SessionFile } from '../session/recorder';
import { applyTopicOps } from './reducer';
import { emptyTopicState } from './types';

const dir = join(__dirname, '../../../../fixtures/sessions');
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.endsWith('.local.json'));

/** Replays recorded categorizer responses through the reducer: real model output must always apply cleanly. */
describe.each(files)('fixture %s', (file) => {
  const session = JSON.parse(readFileSync(join(dir, file), 'utf8')) as SessionFile;
  it('builds a valid two-level topic tree', () => {
    let state = emptyTopicState();
    let now = 0;
    for (const ev of session.events) {
      if (ev.type !== 'categorized') continue;
      now = ev.t;
      state = applyTopicOps(state, ev.response, { now, words: ev.words }).state;
    }
    const topics = Object.values(state.topics);
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      if (t.parentId) expect(state.topics[t.parentId].parentId).toBeNull();
      expect(new Set(t.keywords.map((k) => k.toLowerCase())).size).toBe(t.keywords.length);
    }
    expect(state.currentTopicId).not.toBeNull();
  });
});

describe('demo fixture', () => {
  it('matches the shape of the sketch: an introduction with sub-topics, then big topics', () => {
    const session = JSON.parse(readFileSync(join(dir, 'demo-claude-sonnet-5-5.json'), 'utf8')) as SessionFile;
    let state = emptyTopicState();
    for (const ev of session.events) if (ev.type === 'categorized') state = applyTopicOps(state, ev.response, { now: ev.t, words: ev.words }).state;
    const roots = state.order.filter((id) => !state.topics[id].parentId);
    const intro = state.topics[roots[0]];
    expect(intro.title.toLowerCase()).toContain('intro');
    expect(state.order.filter((id) => state.topics[id].parentId === intro.id).length).toBeGreaterThanOrEqual(1);
    expect(roots.length).toBeGreaterThanOrEqual(2);
  });
});
