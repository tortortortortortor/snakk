import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sectionHops, talkView } from '../../engine/selectors';
import type { SessionFile } from '../../engine/session/recorder';
import { applyTopicOps, markLanded } from '../../engine/topics/reducer';
import { emptyTopicState, type TopicState } from '../../engine/topics/types';
import { BOARD, cellOrigin, FONT, layoutBoard, textWidth, wrap, type BoardSection } from './board';

function lectureAt(untilMs: number): TopicState {
  const file = JSON.parse(
    readFileSync(join(__dirname, '../../../../fixtures/sessions/lecture-northern-lights-claude-sonnet-5-5.json'), 'utf8'),
  ) as SessionFile;
  let s = emptyTopicState();
  for (const ev of file.events) {
    if (ev.type !== 'categorized' || ev.t > untilMs) continue;
    const r = applyTopicOps(s, ev.response, { now: ev.t, words: ev.words });
    s = r.pending.reduce((st, k) => markLanded(st, k.targetTopicId, k.keyword), r.state);
  }
  return s;
}

describe('layoutBoard', () => {
  it('rows run left to right, then back, so the next section is always beside the last', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => cellOrigin(i).x / BOARD.cellW)).toEqual([0, 1, 2, 2, 1, 0]);
  });

  it('wraps long titles onto two balanced lines', () => {
    expect(wrap('Aurora on Other Planets', 18)).toEqual(['Aurora on', 'Other Planets']);
    expect(wrap('Summary', 18)).toEqual(['Summary']);
  });

  it('never moves what is already written as the talk goes on', () => {
    const early = layoutBoard(talkView(lectureAt(150_000)), []);
    const late = layoutBoard(talkView(lectureAt(340_000)), []);
    for (const s of early.sections) {
      const same = late.sections.find((t) => t.topic.id === s.topic.id)!;
      expect(same.shape).toEqual(s.shape);
      for (const k of s.keywords) expect(same.keywords.find((x) => x.text === k.text)).toEqual(k);
    }
  });

  it('keeps every section and its writing inside its own cell', () => {
    const board = layoutBoard(talkView(lectureAt(340_000)), []);
    for (const s of board.sections) {
      const o = cellOrigin(s.index);
      const inCell = (x: number, y: number) => x >= o.x && x <= o.x + BOARD.cellW && y >= o.y && y <= o.y + BOARD.cellH;
      expect(inCell(s.shape.x - s.shape.rx, s.shape.y - s.shape.ry) && inCell(s.shape.x + s.shape.rx, s.shape.y + s.shape.ry)).toBe(true);
      for (const k of s.keywords) expect(inCell(k.x, k.y), `${s.topic.title}: ${k.text}`).toBe(true);
      for (const sub of s.subs) expect(inCell(sub.shape.x + sub.shape.rx, sub.shape.y + sub.shape.ry), sub.topic.title).toBe(true);
    }
  });

  it('draws one arrow per direction between sections, and the return to magnetism as a return', () => {
    const state = lectureAt(340_000);
    const board = layoutBoard(talkView(state), sectionHops(state));
    const flows = board.arrows.filter((a) => a.kind !== 'sub');
    expect(new Set(flows.map((a) => a.id)).size).toBe(flows.length);
    const back = flows.filter((a) => a.kind === 'return').map((a) => state.topics[a.id.split('>')[1]].title);
    expect(back.some((t) => /magnet/i.test(t))).toBe(true);
  });

  it('stacks sub-topics without overlap, even with wrapped titles and keywords', () => {
    // The case from Tor's screenshot: two sub-topics with two-line titles, each with two keywords.
    const topic = (id: string, title: string, parentId: string | null, landed: string[]) => ({
      id, title, summary: '', keywords: landed, landedKeywords: landed, parentId, weight: 10, createdAt: 0, lastActiveAt: 0, colorIndex: 0,
    });
    const root = topic('r', 'About the Speaker', null, ['Bergen', 'oceanography', 'coronal mass ejection', 'teaching', 'Python']);
    const subtopics = [
      topic('a', 'Academic Background', 'r', ['ocean currents', 'climate models']),
      topic('b', 'Current Job at Nordlo', 'r', ['React', 'Next.js']),
    ];
    const board = layoutBoard({ sections: [{ root, subtopics }], current: root, currentRootId: 'r', activeSubId: null }, []);
    const s: BoardSection = board.sections[0];
    type Box = { x0: number; x1: number; y0: number; y1: number; what: string };
    const kwBox = (k: { x: number; y: number; text: string }, size: number): Box => ({ x0: k.x, x1: k.x + textWidth('– ' + k.text, size), y0: k.y - size * 0.8, y1: k.y + size * 0.25, what: k.text });
    const boxes: Box[] = [
      { x0: s.shape.x - s.shape.rx, x1: s.shape.x + s.shape.rx, y0: s.shape.y - s.shape.ry, y1: s.shape.y + s.shape.ry, what: root.title },
      ...s.keywords.map((k) => kwBox(k, FONT.keyword)),
      ...s.subs.flatMap((sub) => [
        { x0: sub.shape.x - sub.shape.rx, x1: sub.shape.x + sub.shape.rx, y0: sub.shape.y - sub.shape.ry, y1: sub.shape.y + sub.shape.ry, what: sub.topic.title },
        ...sub.keywords.map((k) => kwBox(k, sub.keywordSize)),
      ]),
    ];
    const o = cellOrigin(0);
    for (const b of boxes) {
      expect(b.x0 >= o.x && b.x1 <= o.x + BOARD.cellW && b.y0 >= o.y && b.y1 <= o.y + BOARD.cellH, `${b.what} inside its cell`).toBe(true);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const overlap = Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
        expect(overlap, `${a.what} / ${b.what}`).toBe(false);
      }
  });
});
