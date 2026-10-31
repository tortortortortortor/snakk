import type { Topic } from '../../engine';
import { hash01, type Look } from './look';

export interface LayoutSlot {
  x: number;
  y: number;
  r: number;
  /**
   * Follow another body instead of a fixed point: sit `dist` from it at `angle`, turning at
   * `spin` radians a second. Sub-topics use it to move with their section.
   */
  anchor?: { parentId: string; angle: number; dist: number; spin: number; tilt?: number };
}

export interface LayoutOptions {
  mode?: Look['layout'];
  absorb?: Look['absorb'];
  /** The section being talked about; the stage layout puts it in the middle. */
  currentRootId?: string | null;
}

/**
 * Sections sit in a band near the top, each in its own column. Sub-topics sit in a
 * band below their section, spread within that column. Sizes grow with how much
 * has been said under the topic, bounded so nothing overflows its column.
 * The scatter, orbit and stage modes place sections organically instead (see `organicLayout`).
 */
export function computeLayout(
  topics: Record<string, Topic>,
  order: string[],
  viewport: { width: number; height: number },
  /** Sub-topics shown as their own blob. Others are absorbed: placed at their section's centre with radius 0. Default: all. */
  visibleSubtopics?: Set<string>,
  opts: LayoutOptions = {},
): Map<string, LayoutSlot> {
  if (opts.mode && opts.mode !== 'row') return organicLayout(topics, order, viewport, visibleSubtopics, opts);
  const out = new Map<string, LayoutSlot>();
  const roots = order.filter((id) => topics[id] && !topics[id].parentId);
  if (roots.length === 0) return out;

  const usable = viewport.width * 0.86;
  const slot = usable / roots.length;
  const topY = viewport.height * 0.19;
  const childY = -viewport.height * 0.1;

  roots.forEach((rootId, i) => {
    const children = order.filter((id) => topics[id]?.parentId === rootId);
    const total = topics[rootId].weight + children.reduce((n, c) => n + topics[c].weight, 0);
    const rootX = -usable / 2 + slot * (i + 0.5);
    const maxR = Math.min(slot * 0.36, viewport.height * 0.13);
    const r = clamp(0.55 + 0.1 * Math.sqrt(total), Math.min(0.55, maxR), maxR);
    out.set(rootId, { x: rootX, y: topY, r });

    const shown = visibleSubtopics ? children.filter((c) => visibleSubtopics.has(c)) : children;
    for (const c of children) if (!shown.includes(c)) out.set(c, absorbedSlot(c, rootId, rootX, topY, r, opts.absorb));
    const m = shown.length;
    if (m === 0) return;
    const spacing = Math.min(slot / m, 1.7);
    shown.forEach((childId, j) => {
      const maxC = Math.min(spacing * 0.4, viewport.height * 0.075);
      const cr = clamp(0.3 + 0.07 * Math.sqrt(topics[childId].weight), Math.min(0.3, maxC), maxC);
      const stagger = m > 2 ? (j % 2 === 0 ? 0 : -viewport.height * 0.06) : 0;
      out.set(childId, { x: rootX + (j - (m - 1) / 2) * spacing, y: childY + stagger, r: cr });
    });
  });
  return out;
}

/**
 * Where a finished sub-topic goes. melt/ooze: into the section's centre. moons: a small blob
 * circling the section. lobes: a bump fused onto the section's surface, away from the active sub-topic.
 */
function absorbedSlot(id: string, rootId: string, x: number, y: number, rootR: number, absorb: Look['absorb'] = 'melt'): LayoutSlot {
  const h = hash01(id);
  if (absorb === 'moons') {
    return { x, y, r: rootR * 0.2, anchor: { parentId: rootId, angle: h * Math.PI * 2, dist: rootR * 1.8, spin: 0.16 + h * 0.1, tilt: 0.5 } };
  }
  if (absorb === 'lobes') {
    // Upper half and the sides, so the active sub-topic below keeps its place.
    const angle = -0.35 + h * (Math.PI + 0.7);
    return { x, y, r: rootR * 0.42, anchor: { parentId: rootId, angle, dist: rootR * 0.86, spin: 0.015 } };
  }
  return { x, y, r: 0 };
}

/**
 * Sections settle at seeded, uneven spots rather than in a row.
 * scatter: best-candidate sampling over the upper two thirds, so each section finds open space
 *   and earlier sections never move when a new one arrives.
 * orbit: a loose, jittered ring around the middle of the stage.
 * stage: the section being talked about sits in the middle, larger; the rest wait around the ring.
 * The active sub-topic hangs off its section at a seeded angle, below or beside it.
 */
function organicLayout(
  topics: Record<string, Topic>,
  order: string[],
  viewport: { width: number; height: number },
  visibleSubtopics: Set<string> | undefined,
  opts: LayoutOptions,
): Map<string, LayoutSlot> {
  const out = new Map<string, LayoutSlot>();
  const roots = order.filter((id) => topics[id] && !topics[id].parentId);
  if (roots.length === 0) return out;
  const { width: w, height: h } = viewport;
  // Leave the bottom quarter for captions.
  const box = { x0: -w * 0.42, x1: w * 0.42, y0: -h * 0.15, y1: h * 0.3 };
  const area = (box.x1 - box.x0) * (box.y1 - box.y0);
  const fitR = Math.min(Math.sqrt(area / (roots.length * Math.PI)) * 0.62, h * 0.14);

  const homes = new Map<string, { x: number; y: number }>();
  if (opts.mode === 'scatter') {
    const placed: { x: number; y: number }[] = [];
    for (const id of roots) {
      const rand = rng(id);
      let best = { x: 0, y: 0 };
      let bestScore = -Infinity;
      for (let c = 0; c < 24; c++) {
        const p = { x: box.x0 + (box.x1 - box.x0) * rand(), y: box.y0 + (box.y1 - box.y0) * rand() };
        const edge = Math.min((p.x - box.x0) * 1.4, (box.x1 - p.x) * 1.4, (p.y - box.y0) * 2, (box.y1 - p.y) * 2.4);
        const near = placed.reduce((m, q) => Math.min(m, Math.hypot((p.x - q.x) * 0.8, p.y - q.y)), Infinity);
        // Prefer open space, but not perfectly: a little noise keeps it from looking computed.
        const score = Math.min(near, edge + 1.2) + rand() * 0.6;
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      placed.push(best);
      homes.set(id, best);
    }
  } else {
    const cx = 0;
    const cy = h * 0.07;
    const ringScale = opts.mode === 'stage' ? 1.08 : 1;
    let k = 0;
    for (const id of roots) {
      if (opts.mode === 'stage' && id === opts.currentRootId) {
        homes.set(id, { x: cx, y: cy - h * 0.02 });
        continue;
      }
      const j = hash01(id);
      // Golden-angle steps: each new section lands in the widest gap of the ring, never on top of an old one.
      const angle = Math.PI / 2 + 0.5 - k * 2.39996 + (j - 0.5) * 0.3;
      const squash = 1 + (hash01(id + 'r') - 0.5) * 0.22;
      homes.set(id, { x: cx + Math.cos(angle) * w * 0.36 * squash * ringScale, y: cy + Math.sin(angle) * h * 0.21 * squash * ringScale });
      k++;
    }
  }

  // Size says how much was said: relative to the most-discussed section, so they never all max out.
  const totals = new Map(roots.map((id) => [id, order.filter((c) => c === id || topics[c]?.parentId === id).reduce((n, c) => n + topics[c].weight, 0)]));
  const most = Math.max(1, ...totals.values());
  const radii = new Map<string, number>();
  for (const rootId of roots) {
    const share = Math.sqrt(totals.get(rootId)! / most);
    let maxR = fitR;
    if (opts.mode === 'stage') maxR = rootId === opts.currentRootId ? h * 0.15 : Math.min(fitR * 0.78, h * 0.1);
    radii.set(rootId, clamp(maxR * (0.5 + 0.5 * share) * (0.92 + hash01(rootId + 's') * 0.16), Math.min(0.45, maxR), maxR));
  }
  if (opts.mode !== 'scatter') relaxFootprints(roots, topics, homes, radii, viewport, box.y0, opts.currentRootId);

  for (const rootId of roots) {
    const children = order.filter((id) => topics[id]?.parentId === rootId);
    const r = radii.get(rootId)!;
    const home = homes.get(rootId)!;
    out.set(rootId, { x: home.x, y: home.y, r });

    const shown = visibleSubtopics ? children.filter((c) => visibleSubtopics.has(c)) : children;
    for (const c of children) if (!shown.includes(c)) out.set(c, absorbedSlot(c, rootId, home.x, home.y, r, opts.absorb));
    shown.forEach((childId, j) => {
      const cr = clamp(0.3 + 0.07 * Math.sqrt(topics[childId].weight), 0.3, Math.max(0.3, r * 0.6));
      // Hang below, leaning toward the middle of the screen so it stays on stage.
      const lean = home.x > 0 ? -0.35 : 0.35;
      const angle = -Math.PI / 2 + lean + (hash01(childId) - 0.5) * 0.9 + j * 0.8;
      out.set(childId, { x: home.x, y: home.y, r: cr, anchor: { parentId: rootId, angle, dist: r + cr + 0.38, spin: 0 } });
    });
  }
  return out;
}

/** Section title size: the section on stage reads largest, the others step back. */
export const TITLE_SIZE = { current: 0.24, aside: 0.18 };

/** Rough world-space size of a section title (TopicLabel wraps at 12.5 em). */
export function labelBox(title: string, size = TITLE_SIZE.current): { w: number; h: number } {
  const full = title.length * size * 0.52;
  const lines = Math.ceil(full / (size * 12.5));
  return { w: Math.min(size * 12.5, full), h: lines * size * 1.3 };
}

/**
 * A ring slot only knows its angle, so neighbours can land close enough for their titles to
 * collide or for a title to run off the edge. Push overlapping footprints (blob plus the title
 * above it) apart along the shorter overlap and keep each footprint on screen. The section
 * being talked about holds still; the others make room around it.
 */
function relaxFootprints(
  roots: string[],
  topics: Record<string, Topic>,
  homes: Map<string, { x: number; y: number }>,
  radii: Map<string, number>,
  viewport: { width: number; height: number },
  floorY: number,
  fixedId: string | null | undefined,
) {
  const gap = 0.22;
  const fp = roots.map((id) => {
    const r = radii.get(id)!;
    const label = labelBox(topics[id].title, fixedId && id !== fixedId ? TITLE_SIZE.aside : TITLE_SIZE.current);
    // Footprint relative to the blob centre: the title sits r*1.15+0.12 above it.
    return { id, halfW: Math.max(r, label.w / 2), up: r * 1.15 + 0.12 + label.h, down: r, p: { ...homes.get(id)! } };
  });
  const xMax = viewport.width / 2 - 0.15;
  const yMax = viewport.height / 2 - 0.1;
  for (let iter = 0; iter < 150; iter++) {
    let moved = false;
    for (let i = 0; i < fp.length; i++) {
      for (let j = i + 1; j < fp.length; j++) {
        const a = fp[i];
        const b = fp[j];
        const ox = a.halfW + b.halfW + gap - Math.abs(a.p.x - b.p.x);
        // Vertical overlap depends on which one is on top: the lower one's title reaches up into the upper one.
        const [lo, hi] = a.p.y < b.p.y ? [a, b] : [b, a];
        const oy = lo.up + hi.down + gap - (hi.p.y - lo.p.y);
        if (ox <= 0 || oy <= 0) continue;
        const wa = a.id === fixedId ? 0 : b.id === fixedId ? 1 : 0.5;
        const wl = lo === a ? wa : 1 - wa;
        // Go sideways when that is the shorter way out, or when there is no room above or below.
        const roomY = lo.p.y - oy * wl >= floorY - 1e-6 && hi.p.y + oy * (1 - wl) <= yMax - hi.up + 1e-6;
        if (ox < oy * 1.4 || !roomY) {
          const s = a.p.x < b.p.x || (a.p.x === b.p.x && i < j) ? -1 : 1;
          a.p.x += s * ox * wa;
          b.p.x -= s * ox * (1 - wa);
        } else {
          lo.p.y -= oy * wl;
          hi.p.y += oy * (1 - wl);
        }
        moved = true;
      }
    }
    for (const f of fp) {
      if (f.id === fixedId) continue;
      f.p.x = clamp(f.p.x, -xMax + f.halfW, xMax - f.halfW);
      f.p.y = clamp(f.p.y, floorY, yMax - f.up);
    }
    if (!moved) break;
  }
  for (const f of fp) homes.set(f.id, f.p);
}

/** Small seeded generator (mulberry32) so placement is stable for a topic id. */
function rng(seed: string): () => number {
  let a = Math.floor(hash01(seed) * 2 ** 31);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
