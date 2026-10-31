import type { SectionHop, TalkView, Topic } from '../../engine';

/**
 * Where everything is written on the board, in board units. Pure, so it is tested without a DOM.
 *
 * The board is a fixed grid read like a teacher writes: three sections per row, the next row
 * running back the other way (so the arrow of the talk never has to cross the board). Nothing
 * that is written ever moves; the board only grows downward and the view follows.
 */
export const BOARD = { cols: 3, cellW: 620, cellH: 500, pad: 40 };

export const FONT = { title: 46, sub: 32, keyword: 29 };
/** Caveat is narrow: average advance per character, in em. */
const ADVANCE = 0.43;
const MAX_KEYWORD_ROWS = 5;
const MAX_SUBS = 2;

export interface Point {
  x: number;
  y: number;
}

export interface Ellipse extends Point {
  rx: number;
  ry: number;
}

export interface Written extends Point {
  text: string;
  /** Degrees; handwriting is never quite level. */
  rot: number;
}

export interface BoardSub {
  topic: Topic;
  shape: Ellipse;
  lines: string[];
  keywords: Written[];
  active: boolean;
  /** Title font size; sub-topics are written smaller when the cell is tight. */
  size: number;
  keywordSize: number;
}

/**
 * Sub-topics stacked down the right of their section's cell, each with its latest keywords under
 * it. Stacked by their real height (titles can wrap, keywords add lines), and written smaller when
 * that would not fit the space, so nothing overlaps.
 */
function layoutSubs(subs: Topic[], activeSubId: string | null, box: { x0: number; x1: number; y0: number; y1: number }): BoardSub[] {
  const gap = 18;
  // Two keywords under each sub-topic, or one when that is what keeps them readable.
  let perSub = 2;
  const measure = (t: Topic, scale: number) => {
    const size = FONT.sub * scale;
    const keywordSize = FONT.keyword * 0.85 * scale;
    const lines = wrap(t.title, 16);
    const r = ellipseAround(t.id, lines, size, 70 * scale);
    const kws = t.landedKeywords.slice(-perSub);
    const kwW = Math.max(0, ...kws.map((k, i) => textWidth('– ' + k, keywordSize) + i * 12 - r.rx * 0.6));
    return { t, size, keywordSize, lines, r, kws, w: Math.max(2 * r.rx, r.rx + kwW), h: 2 * r.ry + (kws.length ? 14 * scale + kws.length * keywordSize * 1.2 : 0) };
  };
  const fitScale = (scale: number) => {
    const m = subs.map((t) => measure(t, scale));
    const h = m.reduce((n, x) => n + x.h, 0) + gap * Math.max(0, m.length - 1);
    const w = Math.max(0, ...m.map((x) => x.w));
    return Math.min((box.y1 - box.y0) / (h || 1), (box.x1 - box.x0) / (w || 1));
  };
  // Sizes shrink roughly in proportion, so one correction gets close; a second makes sure.
  const settle = () => {
    const first = Math.min(1, fitScale(1));
    return Math.min(first, first * fitScale(first));
  };
  let scale = settle();
  if (scale < 0.8) {
    perSub = 1;
    scale = settle();
  }
  scale = Math.max(0.6, scale);
  let y = box.y0;
  return subs.map((t) => {
    const m = measure(t, scale);
    const shape = { x: box.x1 - m.w + m.r.rx + jitter(t.id + 'x', 6) - 6, y: y + m.r.ry, ...m.r };
    y += m.h + gap;
    return {
      topic: t,
      shape,
      lines: m.lines,
      size: m.size,
      keywordSize: m.keywordSize,
      keywords: m.kws.map((text, k) => ({
        text,
        x: shape.x - shape.rx * 0.6 + k * 12,
        y: shape.y + shape.ry + 14 * scale + (k + 0.85) * m.keywordSize * 1.2,
        rot: jitter(t.id + text, 2),
      })),
      active: t.id === activeSubId,
    };
  });
}

export interface BoardSection {
  topic: Topic;
  index: number;
  shape: Ellipse;
  /** Title, wrapped to at most two lines. */
  lines: string[];
  keywords: Written[];
  /** Keywords that did not fit, written as "+n more" at `morePos`. */
  more: number;
  morePos: Point;
  subs: BoardSub[];
  current: boolean;
}

export interface BoardArrow {
  id: string;
  kind: 'flow' | 'return' | 'sub';
  from: Point;
  to: Point;
  /** Bezier control point. */
  via: Point;
}

export interface Board {
  sections: BoardSection[];
  arrows: BoardArrow[];
  /** Everything written so far, arrows included. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

/** Deterministic 0..1 from a string: the same topic is always written the same way. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

const jitter = (seed: string, amount: number) => (hash01(seed) - 0.5) * 2 * amount;

export const textWidth = (text: string, size: number) => text.length * size * ADVANCE;

/** Break a title into at most two lines of about `max` characters. */
export function wrap(title: string, max: number): string[] {
  if (title.length <= max) return [title];
  const words = title.split(' ');
  let best = [title];
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const score = Math.max(a.length, b.length);
    if (score < bestScore) {
      bestScore = score;
      best = [a, b];
    }
  }
  return best;
}

function ellipseAround(id: string, lines: string[], size: number, min: number): Pick<Ellipse, 'rx' | 'ry'> {
  const w = Math.max(...lines.map((l) => textWidth(l, size)));
  return {
    rx: Math.max(min, w / 2 + size * 0.9) * (1 + jitter(id + 'rx', 0.05)),
    ry: (lines.length * size * 0.62 + size * 0.75) * (1 + jitter(id + 'ry', 0.08)),
  };
}

/** Top-left corner of a section's cell: rows run left to right, then back. */
export function cellOrigin(index: number): Point {
  const row = Math.floor(index / BOARD.cols);
  const k = index % BOARD.cols;
  const col = row % 2 === 0 ? k : BOARD.cols - 1 - k;
  return { x: col * BOARD.cellW, y: row * BOARD.cellH };
}

/** Where a ray from the ellipse centre toward `toward` leaves it, plus a small gap. */
export function edgeToward(e: Ellipse, toward: Point, gap = 10): Point {
  const a = Math.atan2(toward.y - e.y, toward.x - e.x);
  return { x: e.x + Math.cos(a) * (e.rx + gap), y: e.y + Math.sin(a) * (e.ry + gap) };
}

function arrowBetween(id: string, kind: BoardArrow['kind'], a: Ellipse, b: Ellipse, away: Point, bend: number): BoardArrow {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Bend away from `away` (the middle of the board), so arrows arc around the writing instead of through it.
  let nx = -dy / len;
  let ny = dx / len;
  if (nx * (mid.x - away.x) + ny * (mid.y - away.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  const via = { x: mid.x + nx * len * bend, y: mid.y + ny * len * bend };
  return { id, kind, from: edgeToward(a, via), to: edgeToward(b, via, 14), via };
}

export function layoutBoard(view: TalkView, hops: SectionHop[]): Board {
  const sections: BoardSection[] = view.sections.map(({ root, subtopics }, index) => {
    const o = cellOrigin(index);
    const lines = wrap(root.title, 18);
    const size = ellipseAround(root.id, lines, FONT.title, 110);
    const shape = { x: o.x + BOARD.pad + size.rx + jitter(root.id + 'x', 24), y: o.y + BOARD.pad + size.ry + jitter(root.id + 'y', 14), ...size };

    const shownSubs = subtopics.slice(-MAX_SUBS);
    // As many rows as fit under the title in this cell; one or two columns, depending on sub-topics.
    const rowH = FONT.keyword * 1.35;
    const listTop = shape.y + shape.ry + 46;
    const rows = Math.max(1, Math.min(MAX_KEYWORD_ROWS, Math.floor((o.y + BOARD.cellH - 14 - listTop) / rowH) + 1));
    const capacity = (shownSubs.length ? 1 : 2) * rows;
    const landed = root.landedKeywords;
    // Once the list is full the last slot says "+n more", so nothing written is ever wiped off again.
    const shownKeywords = landed.slice(0, capacity - 1);
    const keywords = shownKeywords.map((text, i) => ({
      text,
      x: o.x + BOARD.pad + 14 + Math.floor(i / rows) * 270 + jitter(root.id + text + 'x', 8),
      y: listTop + (i % rows) * rowH + jitter(root.id + text + 'y', 3),
      rot: jitter(root.id + text + 'r', 2.5),
    }));
    const morePos = { x: o.x + BOARD.pad + 14 + Math.floor((capacity - 1) / rows) * 270, y: listTop + ((capacity - 1) % rows) * rowH };

    const subs = layoutSubs(shownSubs, view.activeSubId, {
      // Right of the section's own keyword list, below its circle, inside the cell.
      x0: keywords.reduce((m, k) => Math.max(m, k.x + textWidth('– ' + k.text, FONT.keyword)), o.x + BOARD.cellW * 0.35) + 24,
      x1: o.x + BOARD.cellW - BOARD.pad + 10,
      y0: shape.y + shape.ry + 34,
      y1: o.y + BOARD.cellH - 8,
    });

    return { topic: root, index, shape, lines, keywords, more: landed.length - shownKeywords.length, morePos, subs, current: root.id === view.currentRootId };
  });

  const byId = new Map(sections.map((s) => [s.topic.id, s]));
  const rows = Math.max(1, Math.ceil(sections.length / BOARD.cols));
  const centre = { x: (BOARD.cols * BOARD.cellW) / 2, y: (rows * BOARD.cellH) / 2 };
  const arrows: BoardArrow[] = [];
  for (const s of sections) {
    for (const sub of s.subs) {
      arrows.push(arrowBetween(`${s.topic.id}>${sub.topic.id}`, 'sub', s.shape, sub.shape, { x: s.shape.x + 400, y: s.shape.y - 400 }, 0.18));
    }
  }
  // Each pair of sections gets one arrow per direction, however often the talk went that way.
  const drawn = new Set<string>();
  for (const h of hops) {
    const a = byId.get(h.from);
    const b = byId.get(h.to);
    const id = `${h.from}>${h.to}`;
    if (!a || !b || drawn.has(id)) continue;
    drawn.add(id);
    const far = Math.abs(a.index - b.index) > 1;
    // Dropping to the next row: swing out around the side instead of through the keyword list below.
    const down = Math.abs(b.shape.x - a.shape.x) < Math.abs(b.shape.y - a.shape.y);
    // The way back between the same two sections arcs on the other side.
    const back = drawn.has(`${h.to}>${h.from}`);
    arrows.push(arrowBetween(id, h.returning ? 'return' : 'flow', a.shape, b.shape, centre, (down ? 1.15 : h.returning || far ? 0.32 : 0.14) * (back ? -1 : 1)));
  }

  const bounds = { x0: 0, y0: 0, x1: BOARD.cols * BOARD.cellW, y1: rows * BOARD.cellH };
  for (const ar of arrows) {
    bounds.x0 = Math.min(bounds.x0, ar.via.x);
    bounds.x1 = Math.max(bounds.x1, ar.via.x);
    bounds.y0 = Math.min(bounds.y0, ar.via.y);
    bounds.y1 = Math.max(bounds.y1, ar.via.y);
  }
  return { sections, arrows, bounds };
}
