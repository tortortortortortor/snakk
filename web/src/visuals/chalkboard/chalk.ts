import { hash01, type BoardArrow, type Ellipse } from './board';

const f = (n: number) => n.toFixed(1);

/**
 * A hand-drawn ellipse: the radius wanders a little and the stroke overshoots its start, the way
 * a circle drawn in one movement never quite closes.
 */
export function chalkEllipse(e: Ellipse, seed: string): string {
  const start = hash01(seed + 'a') * Math.PI * 2;
  const sweep = Math.PI * 2 + 0.25 + hash01(seed + 'o') * 0.3;
  const steps = 48;
  const w1 = hash01(seed + 'w1') * 6;
  const w2 = hash01(seed + 'w2') * 6;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + sweep * t;
    // Slightly wider at the end of the stroke, so the overshoot sits outside the start.
    const k = 1 + 0.035 * Math.sin(a * 2 + w1) + 0.02 * Math.sin(a * 3 + w2) + t * 0.03;
    pts.push(`${f(e.x + Math.cos(a) * e.rx * k)} ${f(e.y + Math.sin(a) * e.ry * k)}`);
  }
  return `M${pts.join(' L')}`;
}

/** A gently wavy line under a title. */
export function chalkUnderline(x0: number, x1: number, y: number, seed: string): string {
  const pts: string[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push(`${f(x)} ${f(y + Math.sin(i * 1.3 + hash01(seed) * 6) * 2.5)}`);
  }
  return `M${pts.join(' L')}`;
}

/** The shaft of an arrow (a quadratic curve) and its head (two short strokes). */
export function chalkArrow(a: BoardArrow): { shaft: string; head: string } {
  const { from, via, to } = a;
  const shaft = `M${f(from.x)} ${f(from.y)} Q${f(via.x)} ${f(via.y)} ${f(to.x)} ${f(to.y)}`;
  const ang = Math.atan2(to.y - via.y, to.x - via.x);
  const len = a.kind === 'sub' ? 14 : 20;
  const spread = 0.45 + (hash01(a.id) - 0.5) * 0.1;
  const p = (s: number) => `${f(to.x - Math.cos(ang + s) * len)} ${f(to.y - Math.sin(ang + s) * len)}`;
  return { shaft, head: `M${p(spread)} L${f(to.x)} ${f(to.y)} L${p(-spread)}` };
}
