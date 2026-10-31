import { describe, expect, it } from 'vitest';
import type { Topic } from '../../engine';
import { computeLayout, labelBox, TITLE_SIZE } from './layout';

const topic = (id: string, parentId: string | null, weight = 0): Topic => ({
  id, title: id, summary: '', keywords: [], landedKeywords: [], parentId, weight, createdAt: 0, lastActiveAt: 0, colorIndex: 0,
});

describe('computeLayout', () => {
  const vp = { width: 16, height: 9 };
  it('places sections in the top band and sub-topics below their section', () => {
    const topics = { a: topic('a', null, 50), b: topic('b', null), a1: topic('a1', 'a', 10), a2: topic('a2', 'a', 10) };
    const l = computeLayout(topics, ['a', 'a1', 'b', 'a2'], vp);
    expect(l.get('a')!.y).toBeGreaterThan(l.get('a1')!.y);
    expect(l.get('a')!.x).toBeLessThan(l.get('b')!.x);
    const ax = l.get('a')!.x;
    expect((l.get('a1')!.x + l.get('a2')!.x) / 2).toBeCloseTo(ax);
    expect(l.get('a')!.r).toBeGreaterThan(l.get('b')!.r);
  });
  it('keeps blobs inside their column when there are many sections', () => {
    const topics = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`t${i}`, topic(`t${i}`, null, 10_000)]));
    const l = computeLayout(topics, Object.keys(topics), vp);
    const slot = (16 * 0.86) / 8;
    for (const s of l.values()) expect(s.r).toBeLessThanOrEqual(slot * 0.36 + 1e-9);
  });
  it('scatter: a new section never moves the earlier ones', () => {
    const topics = { a: topic('a', null, 50), b: topic('b', null, 20), c: topic('c', null, 5) };
    const before = computeLayout(topics, ['a', 'b'], vp, undefined, { mode: 'scatter' });
    const after = computeLayout(topics, ['a', 'b', 'c'], vp, undefined, { mode: 'scatter' });
    for (const id of ['a', 'b']) {
      expect(after.get(id)!.x).toBeCloseTo(before.get(id)!.x);
      expect(after.get(id)!.y).toBeCloseTo(before.get(id)!.y);
    }
  });
  it('organic layouts size sections by their share of the talk, and keep them on stage', () => {
    const topics = { a: topic('a', null, 400), b: topic('b', null, 10) };
    for (const mode of ['scatter', 'orbit', 'stage'] as const) {
      const l = computeLayout(topics, ['a', 'b'], vp, undefined, { mode, currentRootId: 'b' });
      if (mode !== 'stage') expect(l.get('a')!.r).toBeGreaterThan(l.get('b')!.r * 1.3);
      for (const s of l.values()) {
        expect(Math.abs(s.x) + s.r).toBeLessThan(vp.width / 2);
        expect(Math.abs(s.y) + s.r).toBeLessThan(vp.height / 2);
      }
    }
  });
  it('moons and lobes keep finished sub-topics visible, anchored to their section', () => {
    const topics = { a: topic('a', null, 50), a1: topic('a1', 'a', 10) };
    for (const absorb of ['moons', 'lobes'] as const) {
      const s = computeLayout(topics, ['a', 'a1'], vp, new Set(), { mode: 'scatter', absorb }).get('a1')!;
      expect(s.r).toBeGreaterThan(0);
      expect(s.anchor?.parentId).toBe('a');
    }
  });
  it('stage: section titles do not collide or leave the screen, even with ten sections', () => {
    const vp = { width: 14.7, height: 8.28 }; // camera z 10, fov 45, 16:9
    const titles = ['Introduction', 'Origin of the Light', "The Sun's Particles", "Earth's Magnetic Field", 'Light in the Atmosphere',
      'Folklore and Myths', 'How to See Aurora', 'Aurora on Other Planets', 'Summary', 'Questions from the Audience'];
    const topics = Object.fromEntries(titles.map((t, i) => [`s${i}`, { ...topic(`s${i}`, null, 5 + ((i * 7) % 11) * 4), title: t }]));
    const order = Object.keys(topics);
    for (const current of order) {
      const l = computeLayout(topics, order, vp, undefined, { mode: 'stage', currentRootId: current });
      const boxes = order.map((id) => {
        const { x, y, r } = l.get(id)!;
        const lb = labelBox(topics[id].title, id === current ? TITLE_SIZE.current : TITLE_SIZE.aside);
        const halfW = Math.max(r, lb.w / 2);
        return { x0: x - halfW, x1: x + halfW, y0: y - r, y1: y + r * 1.15 + 0.12 + lb.h };
      });
      for (const b of boxes) {
        expect(b.x0).toBeGreaterThanOrEqual(-vp.width / 2);
        expect(b.x1).toBeLessThanOrEqual(vp.width / 2);
        expect(b.y1).toBeLessThanOrEqual(vp.height / 2);
      }
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.05 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.05;
          expect(overlap, `${titles[i]} / ${titles[j]} with ${current} on stage`).toBe(false);
        }
    }
  });
  it('absorbs hidden sub-topics into their section', () => {
    const topics = { a: topic('a', null, 50), a1: topic('a1', 'a', 10), a2: topic('a2', 'a', 10) };
    const l = computeLayout(topics, ['a', 'a1', 'a2'], vp, new Set(['a2']));
    expect(l.get('a1')).toEqual({ x: l.get('a')!.x, y: l.get('a')!.y, r: 0 });
    expect(l.get('a2')!.x).toBeCloseTo(l.get('a')!.x);
    expect(l.get('a2')!.y).toBeLessThan(l.get('a')!.y);
  });
});
