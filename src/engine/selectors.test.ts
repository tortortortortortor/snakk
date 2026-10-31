import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sectionHops, talkView } from './selectors';
import type { SessionFile } from './session/recorder';
import { applyTopicOps } from './topics/reducer';
import { emptyTopicState } from './topics/types';

const lecture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/sessions/lecture-northern-lights-claude-sonnet-5-5.json'), 'utf8'),
) as SessionFile;
let state = emptyTopicState();
for (const ev of lecture.events) if (ev.type === 'categorized') state = applyTopicOps(state, ev.response, { now: ev.t, words: ev.words }).state;

describe('selectors on the recorded lecture', () => {
  it('talkView groups sub-topics under their section', () => {
    const v = talkView(state);
    expect(v.sections.length).toBe(state.order.filter((id) => !state.topics[id].parentId).length);
    for (const s of v.sections) for (const c of s.subtopics) expect(c.parentId).toBe(s.root.id);
    expect(v.currentRootId).toBe(v.current!.parentId ?? v.current!.id);
  });

  it('sectionHops follows the talk between sections and marks the return to magnetism', () => {
    const hops = sectionHops(state);
    for (const h of hops) expect(h.from).not.toBe(h.to);
    const returns = hops.filter((h) => h.returning).map((h) => state.topics[h.to].title.toLowerCase());
    expect(returns.some((t) => t.includes('magnet'))).toBe(true);
    // Every section after the first is reached by some hop.
    const reached = new Set(hops.map((h) => h.to));
    for (const s of talkView(state).sections.slice(1)) expect(reached.has(s.root.id)).toBe(true);
  });
});
