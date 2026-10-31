import { Billboard, MeshDistortMaterial, Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useSnakk } from '../../engine';
import type { PendingKeyword } from '../../engine';
import { hash01, look } from './look';
import { paletteFor } from './palette';
import { bodies, kick } from './simulation';

const FLIGHT_MS = 2600;
/** 'linger': how long a keyword circles its topic, readable, before it sinks in. */
const LINGER_MS = 5200;
const geometry = new THREE.SphereGeometry(1, 48, 32);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A keyword that rises from the bottom of the screen and merges into its topic blob. */
export function KeywordBubble({ bubble, colorIndex }: { bubble: PendingKeyword; colorIndex: number }) {
  const viewport = useThree((s) => s.viewport);
  const group = useRef<THREE.Group>(null);
  const sphere = useRef<THREE.Mesh>(null);
  const text = useRef<THREE.Mesh & { fillOpacity: number; outlineOpacity: number }>(null);
  const born = useRef<number | null>(null);
  const landed = useRef(false);
  const color = paletteFor(colorIndex)[1];

  const path = useMemo(() => {
    const seed = hash01(bubble.id + bubble.keyword);
    const r1 = Math.random();
    const r2 = Math.random();
    const { width: w, height: h } = viewport;
    let start = new THREE.Vector3((r1 - 0.5) * w * 0.7, -h / 2 + 1.0, 0.6);
    if (look.birth === 'captions') start = new THREE.Vector3((r1 - 0.5) * w * 0.5, -h / 2 + 2.05 + r2 * 0.25, 0.6);
    if (look.birth === 'wind') start = new THREE.Vector3((r1 < 0.5 ? -1 : 1) * (w / 2 + 0.4), -h * 0.25 + r2 * h * 0.5, 0.6);
    const sway = (Math.random() - 0.5) * 2.4;
    // Everything but the original arc gets its own pace and size, so words do not move in lockstep.
    const varied = look.flight !== 'arc' || look.birth !== 'bottom';
    const flight = varied ? FLIGHT_MS * (0.85 + seed * 0.65) : FLIGHT_MS;
    const size = varied ? 0.12 + seed * 0.08 : 0.17;
    return { start, sway, seed, flight, size, etherAngle: r1 * Math.PI * 2, etherDist: 1.3 + r2 * 0.9 };
    // The flight path is fixed when the bubble is born.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const ctrl = useMemo(() => new THREE.Vector3(), []);
  const prev = useMemo(() => new THREE.Vector3(), []);
  const linger = look.arrival === 'linger';

  useFrame(() => {
    if (!group.current || !sphere.current) return;
    const now = performance.now();
    if (born.current === null) born.current = now + bubble.delayMs;
    const target = bodies.get(bubble.targetTopicId);
    const elapsed = now - born.current;
    const raw = elapsed / path.flight;
    if (raw < 0 || !target) {
      group.current.visible = false;
      return;
    }
    group.current.visible = true;
    prev.copy(group.current.position);
    const t = Math.min(1, raw);
    const e = easeInOut(t);
    const tr = target.r;

    // Where the flight ends: the blob's centre, or a point on its orbit for 'linger' and 'spiral'.
    const a0 = Math.atan2(path.start.y - target.pos.y, path.start.x - target.pos.x);
    const orbitR = tr + 0.4;
    const endX = linger ? target.pos.x + Math.cos(a0) * orbitR : target.pos.x;
    const endY = linger ? target.pos.y + Math.sin(a0) * orbitR : target.pos.y;

    let start = path.start;
    if (look.birth === 'ether') {
      // Condenses out of the air somewhere near its topic.
      start = ctrl.set(target.pos.x + Math.cos(path.etherAngle) * (tr + path.etherDist), target.pos.y + Math.sin(path.etherAngle) * (tr + path.etherDist) * 0.7, 0.6);
      start = start.clone();
    }

    if (look.flight === 'buoyant') {
      // Rises like an air bubble in water, wobbling, and only late on gets pulled to its topic.
      const free = new THREE.Vector3(
        start.x + Math.sin(elapsed * 0.0042 + path.seed * 20) * 0.28 * (1 - t),
        start.y + 2.2 * t * t + 0.6 * t,
        start.z,
      );
      const pull = Math.pow(smooth(0.15, 1, t), 1.6);
      p.set(free.x + (endX - free.x) * pull, free.y + (endY - free.y) * pull, start.z + (target.pos.z + 0.2 - start.z) * pull);
    } else if (look.flight === 'spiral') {
      // Approaches, then circles in, the way water swirls into a drain.
      const approach = Math.min(1, t / 0.55);
      const ea = easeInOut(approach);
      const aIn = a0;
      const entry = new THREE.Vector3(target.pos.x + Math.cos(aIn) * (tr + 0.7), target.pos.y + Math.sin(aIn) * (tr + 0.7), 0.5);
      if (t < 0.55) {
        ctrl.set((start.x + entry.x) / 2 + path.sway * 0.6, (start.y + entry.y) / 2, 0.8);
        p.set(
          (1 - ea) ** 2 * start.x + 2 * (1 - ea) * ea * ctrl.x + ea * ea * entry.x,
          (1 - ea) ** 2 * start.y + 2 * (1 - ea) * ea * ctrl.y + ea * ea * entry.y,
          0.5,
        );
      } else {
        const s = (t - 0.55) / 0.45;
        const ang = aIn + (path.sway > 0 ? 1 : -1) * s * Math.PI * 2.2;
        const rad = (tr + 0.7) * (1 - s * 0.85);
        p.set(target.pos.x + Math.cos(ang) * rad, target.pos.y + Math.sin(ang) * rad * 0.8, 0.5 + Math.sin(ang) * 0.3 * (1 - s));
      }
    } else {
      // Quadratic Bezier toward the blob's current position, with a sideways sway.
      ctrl.set((start.x + target.pos.x) / 2 + path.sway, (start.y + target.pos.y) / 2, 0.8);
      const a = (1 - e) * (1 - e);
      const b = 2 * (1 - e) * e;
      const c = e * e;
      p.set(a * start.x + b * ctrl.x + c * endX, a * start.y + b * ctrl.y + c * endY, a * start.z + b * ctrl.z + c * (target.pos.z + 0.2));
      if (look.flight === 'meander') {
        // Lazy drift: a sideways wander that dies out as it arrives.
        const amp = Math.sin(t * Math.PI) * 0.55;
        p.x += amp * (Math.sin(t * 6.3 + path.seed * 30) * 0.6 + Math.sin(t * 2.7 + path.seed * 11) * 0.4);
        p.y += amp * 0.5 * Math.sin(t * 4.1 + path.seed * 17);
      }
    }

    let grow = Math.min(1, t / 0.12);
    if (look.birth === 'ether') grow = smooth(0, 0.35, t);
    let shrink = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
    let textAlpha = Math.min(grow, shrink);

    if (linger) {
      shrink = 1;
      textAlpha = grow;
      if (raw >= 1) {
        // Circle the topic, readable, then sink in.
        const lt = (elapsed - path.flight) / LINGER_MS;
        const ang = a0 + lt * 2.4 * (path.sway > 0 ? 1 : -1);
        const sink = smooth(0.78, 1, lt);
        const rad = orbitR * (1 - sink) + Math.sin(lt * 9 + path.seed * 7) * 0.04;
        p.set(target.pos.x + Math.cos(ang) * rad, target.pos.y + Math.sin(ang) * rad, target.pos.z + 0.25 + Math.sin(ang) * 0.2);
        textAlpha = 1 - smooth(0.55, 0.9, lt);
        shrink = 1 - sink * 0.85;
      }
    }

    group.current.position.copy(p);
    sphere.current.scale.setScalar(path.size * grow * Math.max(0.15, shrink));
    if (text.current) {
      text.current.fillOpacity = textAlpha;
      text.current.outlineOpacity = textAlpha;
    }

    const done = linger ? elapsed >= path.flight + LINGER_MS : t >= 1;
    if (done && !landed.current) {
      landed.current = true;
      if (look.arrival === 'nudge') {
        const dir = new THREE.Vector3().subVectors(p, prev);
        if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0);
        kick(bubble.targetTopicId, dir.normalize(), 0.55);
      }
      useSnakk.getState().landKeyword(bubble.id);
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={sphere} geometry={geometry}>
        <MeshDistortMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.25} distort={0.35} speed={3} />
      </mesh>
      <Billboard position={[0, 0.3, 0]}>
        <Text ref={text} fontSize={0.2} color="#ffffff" anchorX="center" anchorY="bottom" outlineWidth={0.01} outlineColor="#141416">
          {bubble.keyword}
        </Text>
      </Billboard>
    </group>
  );
}
