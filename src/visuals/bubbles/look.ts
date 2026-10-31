/**
 * Aesthetic variants, one choice per moment of the experience, so options can be compared on the
 * same lecture. Picked with the URL, e.g. `?look=layout:scatter,flight:buoyant`. The first value of
 * each dimension is the original behaviour; `DEFAULT_LOOK` is the merged experience.
 */
export const LOOK_DIMENSIONS = {
  /** Where sections settle as the lecture grows. */
  layout: ['row', 'scatter', 'orbit', 'stage'],
  /** How the scene moves when nothing new is happening. */
  idle: ['bob', 'breathe', 'wander', 'current'],
  /** Where a keyword first appears. */
  birth: ['bottom', 'captions', 'ether', 'wind'],
  /** The path a keyword takes to its topic. */
  flight: ['arc', 'buoyant', 'meander', 'spiral'],
  /** What happens when a keyword reaches its topic. */
  arrival: ['pulse', 'ripple', 'linger', 'nudge'],
  /** How a new topic enters the scene. */
  emerge: ['grow', 'bloom', 'bud', 'rise'],
  /** What happens to a sub-topic once the speaker moves on. */
  absorb: ['melt', 'ooze', 'moons', 'lobes'],
  /** How the scene reacts to the voice. */
  voice: ['amp', 'murmur', 'lean', 'tempo'],
  /** How the topic being talked about now stands out. */
  focus: ['glow', 'spotlight', 'recede', 'camera'],
  /** How topic titles are written. */
  labels: ['outline', 'quiet', 'tag', 'typewriter'],
} as const;

export type LookDimension = keyof typeof LOOK_DIMENSIONS;
export type Look = { [D in LookDimension]: (typeof LOOK_DIMENSIONS)[D][number] };

/** Tor's picks from the motion studies (2026-10-31), merged into one experience. */
export const DEFAULT_LOOK: Look = {
  layout: 'stage',
  idle: 'wander',
  birth: 'ether',
  flight: 'spiral',
  arrival: 'nudge',
  emerge: 'bud',
  absorb: 'lobes',
  voice: 'tempo',
  focus: 'recede',
  labels: 'typewriter',
};

export function parseLook(query: string): Look {
  const look = { ...DEFAULT_LOOK };
  const raw = new URLSearchParams(query).get('look') ?? '';
  for (const pair of raw.split(',')) {
    const [d, v] = pair.split(':') as [LookDimension, string];
    if (d in LOOK_DIMENSIONS && (LOOK_DIMENSIONS[d] as readonly string[]).includes(v)) (look as Record<string, string>)[d] = v;
  }
  return look;
}

export const look: Look = parseLook(typeof location === 'undefined' ? '' : location.search);

/** Deterministic 0..1 from a string, so a topic or keyword always gets the same randomness. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** Smooth, non-repeating wobble from a few incommensurate sines. Returns roughly -1..1. */
export function wobble(t: number, seed: number): number {
  return (Math.sin(t * 0.61 + seed * 6.1) + Math.sin(t * 0.37 + seed * 3.7) * 0.7 + Math.sin(t * 1.13 + seed * 9.3) * 0.3) / 2;
}
