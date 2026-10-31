import * as THREE from 'three';
import type { LayoutSlot } from './layout';
import { hash01, look, wobble } from './look';

export interface BlobBody {
  pos: THREE.Vector3;
  r: number;
  /** Radius velocity, for the springy 'bloom' entrance. */
  vr: number;
  /** Momentum from arriving keywords ('nudge'); decays back to rest. */
  vel: THREE.Vector3;
  born: number;
  seed: number;
}

/**
 * Shared, mutable scene positions. Blobs, bubbles and links read from here every frame,
 * so a bubble can chase a blob that is still moving into place.
 */
export const bodies = new Map<string, BlobBody>();

/**
 * Scene time. `t` advances slower during pauses when the voice look is 'tempo'.
 * `speech` eases between 0 (pause) and 1 (talking).
 */
export const sceneClock = { t: 0, tempo: 1, speech: 0 };

export interface SimContext {
  /** Real seconds since start. */
  time: number;
  speaking: boolean;
  /** The current topic and its section. */
  focusIds: Set<string>;
  viewport: { width: number; height: number };
}

const tmp = new THREE.Vector3();
const target = new THREE.Vector3();
const lastFocus = new THREE.Vector3();
let hasFocus = false;

export function stepSimulation(targets: Map<string, LayoutSlot>, dt: number, ctx?: SimContext): void {
  const now = ctx?.time ?? 0;
  const speaking = ctx?.speaking ?? false;
  const tempoTarget = look.voice === 'tempo' ? (speaking ? 1 : 0.28) : 1;
  sceneClock.tempo += (tempoTarget - sceneClock.tempo) * Math.min(1, dt * 1.1);
  sceneClock.t += dt * sceneClock.tempo;
  sceneClock.speech += ((speaking ? 1 : 0) - sceneClock.speech) * Math.min(1, dt * 2.5);
  const t = sceneClock.t;

  for (const [id, slot] of targets) {
    const absorbed = slot.r < 1e-3;
    const focused = ctx?.focusIds.has(id) ?? false;
    let rT = slot.r;

    if (slot.anchor) {
      const parent = bodies.get(slot.anchor.parentId);
      const a = slot.anchor.angle + slot.anchor.spin * t;
      const tilt = slot.anchor.tilt ?? 0;
      target.set(slot.x, slot.y, 0);
      if (parent) target.copy(parent.pos);
      target.x += Math.cos(a) * slot.anchor.dist;
      target.y += Math.sin(a) * slot.anchor.dist * (1 - tilt * 0.6);
      target.z += Math.sin(a) * slot.anchor.dist * tilt;
    } else {
      target.set(slot.x, slot.y, 0);
      const s = hash01(id) * 10;
      if (look.idle === 'breathe') {
        target.y += Math.sin(t * 0.45 + s) * 0.07;
        rT *= 1 + 0.035 * Math.sin(t * 0.7 + s * 1.7);
      } else if (look.idle === 'wander') {
        target.x += wobble(t * 0.32, s) * 0.42;
        target.y += wobble(t * 0.27, s + 4.2) * 0.28;
      } else if (look.idle === 'current') {
        // One slow flow field, so neighbours drift together like things in the same water.
        target.x += Math.sin(t * 0.21 + slot.y * 0.45) * 0.32 + Math.sin(t * 0.09) * 0.18;
        target.y += Math.sin(t * 0.17 + slot.x * 0.28) * 0.2;
      }
    }

    if (focused && !absorbed && look.voice === 'lean') {
      // Talking draws the topic down toward the speaker; in pauses it floats back up.
      target.y -= 0.3 * sceneClock.speech;
      rT *= 1 + 0.05 * sceneClock.speech;
    }
    if (look.focus === 'recede' && !slot.anchor) target.z = focused ? 0.35 : -1.4;

    let body = bodies.get(id);
    if (!body) {
      body = { pos: new THREE.Vector3(target.x, target.y - 0.6, target.z), r: 0.001, vr: 0, vel: new THREE.Vector3(), born: now, seed: hash01(id) };
      if (look.emerge === 'bloom') body.pos.copy(target);
      if (look.emerge === 'bud' && hasFocus) body.pos.copy(lastFocus);
      if (look.emerge === 'rise' && !absorbed) {
        body.pos.set(target.x + (body.seed - 0.5) * 2.5, -(ctx?.viewport.height ?? 8) / 2 - 1, target.z);
        body.r = slot.r * 0.5;
      }
      bodies.set(id, body);
    }

    const age = now - body.born;
    let rate = 3.2;
    if (look.emerge === 'rise' && age < 6) {
      rate = 0.75;
      // A large bubble rising: it sways more the further it still has to go.
      target.x += Math.sin(age * 1.6 + body.seed * 9) * 0.35 * Math.max(0, 1 - age / 6);
    }
    if (look.emerge === 'bud' && age < 4) rate = 1.2;
    if (look.absorb === 'ooze' && absorbed) rate = 0.4;
    const k = 1 - Math.exp(-dt * rate);
    body.pos.x += (target.x - body.pos.x) * k;
    body.pos.y += (target.y - body.pos.y) * k;
    body.pos.z += (target.z - body.pos.z) * (1 - Math.exp(-dt * 1.6));
    body.pos.addScaledVector(body.vel, dt);
    body.vel.multiplyScalar(Math.exp(-dt * 3));

    if (look.emerge === 'bloom') {
      // Under-damped spring: overshoots a little, then settles.
      const w = 5.5;
      body.vr += (w * w * (rT - body.r) - 2 * 0.3 * w * body.vr) * dt;
      body.r = Math.max(0.001, body.r + body.vr * dt);
    } else {
      const kr = look.absorb === 'ooze' && absorbed ? 1 - Math.exp(-dt * 0.55) : k;
      body.r += (rT - body.r) * kr;
    }
  }
  for (const id of [...bodies.keys()]) if (!targets.has(id)) bodies.delete(id);

  // Remember where the focus was, so a 'bud' can split off from it next frame.
  hasFocus = false;
  for (const id of ctx?.focusIds ?? []) {
    const b = bodies.get(id);
    if (b && b.born < now && b.r > 0.2) {
      lastFocus.copy(b.pos);
      hasFocus = true;
    }
  }

  // Soft repulsion so blobs that grow into each other slide apart.
  // Bodies heading to radius 0 are being absorbed into their section; they must not push it away.
  // Neither do bodies anchored to each other (lobes sit inside their section on purpose).
  const list = [...bodies.entries()].filter(([id]) => (targets.get(id)?.r ?? 0) > 1e-3);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [ia, a] = list[i];
      const [ib, b] = list[j];
      if (targets.get(ia)?.anchor?.parentId === ib || targets.get(ib)?.anchor?.parentId === ia) continue;
      tmp.subVectors(b.pos, a.pos);
      tmp.z = 0;
      const dist = tmp.length() || 0.0001;
      // Organic layouts leave room for the titles too.
      const min = (a.r + b.r) * 1.12 + (look.layout === 'row' ? 0 : 0.45);
      if (dist < min) {
        tmp.multiplyScalar(((min - dist) / dist) * 0.5 * Math.min(1, dt * 6));
        a.pos.sub(tmp);
        b.pos.add(tmp);
      }
    }
  }
}

/** An arriving keyword's momentum shoves its topic a little ('nudge'). */
export function kick(id: string, dir: THREE.Vector3, strength: number): void {
  const b = bodies.get(id);
  if (b) b.vel.addScaledVector(dir, strength);
}
