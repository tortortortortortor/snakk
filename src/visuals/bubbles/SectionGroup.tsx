import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useSnakk, type Topic } from '../../engine';
import { ATLAS_SLOTS, KeywordAtlas } from './keywordAtlas';
import { TITLE_SIZE } from './layout';
import { look } from './look';
import { paletteFor } from './palette';
import { MAX_BANDS, MAX_BLOBS, MAX_DROPS, sectionFragment, sectionVertex } from './sectionShader';
import { bodies, sceneClock } from './simulation';

const Z = new THREE.Vector3(0, 0, 1);
const plane = new THREE.PlaneGeometry(1, 1);
/** Where absorbed sub-topics leave their band on the section, alternating around the equator. */
const BAND_V = [0.35, 0.65, 0.27, 0.73, 0.43, 0.57, 0.2];
const WHITE = new THREE.Color('#ffffff');
/** Only melting sub-topics leave a band; moons and lobes stay visible as themselves. */
const BANDS = look.absorb === 'melt' || look.absorb === 'ooze';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

interface Props {
  root: Topic;
  subtopics: Topic[];
  currentId: string | null;
  /** The sub-topic being talked about, shown as its own blob. Other sub-topics are absorbed. */
  activeSubId: string | null;
}

/**
 * One section drawn as a single ray-marched surface. The active sub-topic floats below it,
 * and droplets bud off the sub-topic and rise into the section. Finished sub-topics melt
 * into the section, leaving a coloured band and their keywords on its surface.
 */
export function SectionGroup({ root, subtopics, currentId, activeSubId }: Props) {
  // Slot 0 is the section; slots 1..7 its sub-topics. Beyond 7, older ones are only bands.
  const members = useMemo(() => [root, ...subtopics.slice(-(MAX_BLOBS - 1))], [root, subtopics]);
  const atlas = useMemo(() => new KeywordAtlas(), []);
  const mesh = useRef<THREE.Mesh>(null);
  const angles = useRef<number[]>(new Array(MAX_BLOBS).fill(0));
  const focused = root.id === currentId || subtopics.some((t) => t.id === currentId);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uCount: { value: 1 },
      uC: { value: Array.from({ length: MAX_BLOBS }, () => new THREE.Vector3()) },
      uR: { value: new Array(MAX_BLOBS).fill(0) },
      uSeed: { value: new Array(MAX_BLOBS).fill(0) },
      uAng: { value: new Array(MAX_BLOBS).fill(0) },
      uAmp: { value: new Array(MAX_BLOBS).fill(0.07) },
      uPulse: { value: new Array(MAX_BLOBS).fill(0) },
      uGlow: { value: new Array(MAX_BLOBS).fill(0) },
      uColA: { value: Array.from({ length: MAX_BLOBS }, () => new THREE.Color()) },
      uColB: { value: Array.from({ length: MAX_BLOBS }, () => new THREE.Color()) },
      uBandCount: { value: 0 },
      uBandV: { value: new Array(MAX_BANDS).fill(0.5) },
      uBandCol: { value: Array.from({ length: MAX_BANDS }, () => new THREE.Color()) },
      uBandAlpha: { value: new Array(MAX_BANDS).fill(0) },
      uDropCount: { value: 0 },
      uDrop: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector4()) },
      uDropT: { value: new Array(MAX_DROPS).fill(0) },
      uDropFrom: { value: new THREE.Color() },
      uDropK: { value: 0.08 },
      uK: { value: 0.2 },
      uPulseStyle: { value: look.arrival === 'ripple' ? 1 : 0 },
      uDim: { value: 0 },
      uDepth: { value: 4 },
      uLight: { value: new THREE.Vector3(3, 5, 6) },
      uAtlas: { value: atlas.texture },
    }),
    [atlas],
  );
  // Built here rather than as JSX so the material keeps this exact uniforms object (JSX props get copied).
  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: sectionVertex, fragmentShader: sectionFragment, uniforms }),
    [uniforms],
  );
  useEffect(() => () => material.dispose(), [material]);

  // Colours and noise seeds; sub-topics are a lighter version of their section.
  useEffect(() => {
    members.forEach((t, i) => {
      const [a, b] = paletteFor(t.colorIndex);
      uniforms.uColA.value[i].set(a);
      uniforms.uColB.value[i].set(b);
      if (i > 0) {
        uniforms.uColA.value[i].lerp(WHITE, 0.18);
        uniforms.uColB.value[i].lerp(WHITE, 0.18);
      }
      uniforms.uSeed.value[i] = hash(t.id) * 10;
    });
  }, [members, uniforms]);

  // Keywords: absorbed sub-topics' words join the section's surface.
  const absorbed = subtopics.filter((t) => t.id !== activeSubId);
  const sectionWords = [...root.landedKeywords, ...absorbed.flatMap((t) => t.landedKeywords)];
  const keywordKey = [sectionWords, ...members.slice(1).map((t) => t.landedKeywords)].map((k) => k.join('\u0001')).join('\u0002');
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (cancelled) return;
      atlas.drawSlot(0, sectionWords, true);
      members.slice(1).forEach((t, i) => atlas.drawSlot(i + 1, t.landedKeywords, false));
      atlas.clearFrom(Math.min(members.length, ATLAS_SLOTS));
    });
    return () => {
      cancelled = true;
    };
    // keywordKey captures everything this effect draws.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywordKey, atlas]);
  useEffect(() => () => atlas.dispose(), [atlas]);

  const tmp = useMemo(
    () => ({ w: new THREE.Vector3(), dir: new THREE.Vector3(), perp: new THREE.Vector3(), s: new THREE.Vector3(), e: new THREE.Vector3(), min: new THREE.Vector3(), max: new THREE.Vector3() }),
    [],
  );

  useFrame((state, dt) => {
    const m = mesh.current;
    if (!m || !m.parent) return;
    const time = sceneClock.t;
    const { landedAt, speaking, level } = useSnakk.getState();
    const toWorld = m.parent.matrixWorld;
    uniforms.uTime.value = time;
    uniforms.uCount.value = members.length;
    uniforms.uDim.value += ((look.focus === 'spotlight' && !focused ? 0.62 : 0) - uniforms.uDim.value) * Math.min(1, dt * 1.5);
    const pulseLife = look.arrival === 'ripple' ? 1.8 : 0.9;
    // 'murmur': the surface follows the voice. Replays have no level, so a syllable-paced envelope stands in.
    const voice = level > 0.002 ? Math.min(1, level * 14) : sceneClock.speech * (0.55 + 0.45 * Math.sin(time * 8.5 + Math.sin(time * 2.1) * 2.5));

    tmp.min.set(Infinity, Infinity, Infinity);
    tmp.max.set(-Infinity, -Infinity, -Infinity);
    let ready = 0;
    let maxR = 0;
    members.forEach((t, i) => {
      const body = bodies.get(t.id);
      if (!body) return;
      ready++;
      const seed = uniforms.uSeed.value[i];
      const bob = look.idle === 'bob' ? Math.sin(time * 0.6 + seed) * 0.05 : 0;
      tmp.w.set(body.pos.x, body.pos.y + bob, body.pos.z);
      if (body.r > 0.01) {
        tmp.min.min(tmp.w.clone().subScalar(body.r * 1.35));
        tmp.max.max(tmp.w.clone().addScalar(body.r * 1.35));
      }
      uniforms.uC.value[i].copy(tmp.w).applyMatrix4(toWorld);
      uniforms.uR.value[i] = body.r;
      maxR = Math.max(maxR, body.r);

      angles.current[i] += dt * sceneClock.tempo * (i === 0 ? 0.12 : 0.18);
      uniforms.uAng.value[i] = angles.current[i];
      const isCurrent = t.id === currentId;
      let targetAmp = isCurrent ? (speaking ? 0.17 : 0.12) : 0.07;
      if (look.voice === 'murmur') targetAmp = isCurrent ? 0.1 + 0.13 * voice : 0.07;
      if (look.voice === 'tempo') targetAmp = isCurrent ? 0.12 + 0.05 * sceneClock.speech : 0.07 * (0.6 + 0.4 * sceneClock.tempo);
      const ampRate = look.voice === 'murmur' ? 10 : 2;
      uniforms.uAmp.value[i] += (targetAmp - uniforms.uAmp.value[i]) * Math.min(1, dt * ampRate);
      uniforms.uGlow.value[i] += ((isCurrent ? 1 : 0) - uniforms.uGlow.value[i]) * Math.min(1, dt * 2);
      const since = (performance.now() - (landedAt[t.id] ?? -1e9)) / 1000;
      uniforms.uPulse.value[i] = Math.max(0, 1 - since / pulseLife);
    });
    if (ready < members.length || !Number.isFinite(tmp.min.x)) {
      m.visible = false;
      return;
    }
    m.visible = true;

    // Bands: one per absorbed sub-topic, fading in as it shrinks into the section.
    let b = 0;
    for (const t of BANDS ? absorbed : []) {
      if (b >= MAX_BANDS) break;
      const r = bodies.get(t.id)?.r ?? 0;
      uniforms.uBandV.value[b] = BAND_V[b];
      uniforms.uBandCol.value[b].set(paletteFor(t.colorIndex)[1]).lerp(WHITE, 0.35);
      uniforms.uBandAlpha.value[b] = THREE.MathUtils.clamp(1 - r / 0.3, 0, 1) * 0.85;
      b++;
    }
    uniforms.uBandCount.value = b;

    // Droplets bud off the active sub-topic and rise into the section.
    const ai = activeSubId ? members.findIndex((t) => t.id === activeSubId) : -1;
    const childR = ai > 0 ? uniforms.uR.value[ai] : 0;
    if (ai > 0 && childR > 0.15) {
      const parentC = uniforms.uC.value[0];
      const childC = uniforms.uC.value[ai];
      const parentR = uniforms.uR.value[0];
      tmp.dir.subVectors(parentC, childC);
      const len = tmp.dir.length();
      tmp.dir.divideScalar(Math.max(len, 1e-4));
      tmp.perp.crossVectors(tmp.dir, Z).normalize();
      tmp.s.copy(childC).addScaledVector(tmp.dir, childR * 0.75);
      tmp.e.copy(parentC).addScaledVector(tmp.dir, -parentR * 0.75);
      const span = tmp.s.distanceTo(tmp.e);
      const dropR = Math.min(childR, parentR) * 0.2;
      const drops = 4;
      // Small blend radius: drops stay separate from each other but still bud off and melt in at the ends.
      uniforms.uDropK.value = dropR * 1.1;
      uniforms.uDropFrom.value.copy(uniforms.uColA.value[ai]).lerp(uniforms.uColB.value[ai], 0.5);
      for (let j = 0; j < drops; j++) {
        const t = (time * 0.22 + j / drops) % 1;
        const swell = Math.sin(t * Math.PI);
        uniforms.uDrop.value[j]
          .set(0, 0, 0, 0)
          .copy(new THREE.Vector4(tmp.s.x, tmp.s.y, tmp.s.z, 0).lerp(new THREE.Vector4(tmp.e.x, tmp.e.y, tmp.e.z, 0), t));
        const sway = Math.sin(t * Math.PI * 2 + j) * span * 0.06;
        uniforms.uDrop.value[j].x += tmp.perp.x * sway;
        uniforms.uDrop.value[j].y += tmp.perp.y * sway;
        uniforms.uDrop.value[j].w = dropR * (0.55 + 0.45 * ((j * 0.37) % 1)) * Math.pow(swell, 0.6);
        uniforms.uDropT.value[j] = t;
      }
      uniforms.uDropCount.value = drops;
      tmp.min.min(tmp.e);
      tmp.max.max(tmp.e);
    } else {
      uniforms.uDropCount.value = 0;
    }
    uniforms.uK.value = Math.max(0.15, Math.min(maxR, childR > 0.15 ? childR : maxR) * 0.45);

    // Seen from the camera, the group's outline lands closer to the camera's axis on the card,
    // so the card spans both the group's own bounds and that projected outline.
    const front = Math.max(maxR * 1.5 + 0.3, tmp.max.z + 0.3);
    const cam = state.camera.position;
    const k = Math.max(0.1, (cam.z - front) / (cam.z - tmp.min.z));
    const px = (v: number) => cam.x + (v - cam.x) * k;
    const py = (v: number) => cam.y + (v - cam.y) * k;
    const x0 = Math.min(tmp.min.x, px(tmp.min.x)) - 0.3;
    const x1 = Math.max(tmp.max.x, px(tmp.max.x)) + 0.3;
    const y0 = Math.min(tmp.min.y, py(tmp.min.y)) - 0.3;
    const y1 = Math.max(tmp.max.y, py(tmp.max.y)) + 0.3;
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, front);
    m.scale.set(x1 - x0, y1 - y0, 1);
    uniforms.uDepth.value = front - tmp.min.z + maxR * 1.5 + 1;
  });

  return (
    <>
      <mesh ref={mesh} geometry={plane} material={material} frustumCulled={false} visible={false} />
      <TopicLabel topic={root} isRoot focused={focused} />
      {activeSubId && members.some((t) => t.id === activeSubId) && (
        <TopicLabel key={activeSubId} topic={members.find((t) => t.id === activeSubId)!} isRoot={false} focused={focused} />
      )}
    </>
  );
}

const lineGeometry = new THREE.PlaneGeometry(1, 1);
lineGeometry.translate(0.5, 0, 0);

function TopicLabel({ topic, isRoot, focused }: { topic: Topic; isRoot: boolean; focused: boolean }) {
  const group = useRef<THREE.Group>(null);
  const text = useRef<THREE.Mesh & { fillOpacity: number; outlineOpacity: number }>(null);
  const leader = useRef<THREE.Mesh>(null);
  const seed = useMemo(() => hash(topic.id) * 10, [topic.id]);
  const mounted = useMemo(() => performance.now(), []);
  const [typedCount, setTypedCount] = useState(look.labels === 'typewriter' ? 0 : Infinity);
  const [side, setSide] = useState(1);
  const opacity = useRef(1);

  useFrame((_, dt) => {
    const body = bodies.get(topic.id);
    if (!body || !group.current) return;
    const bob = look.idle === 'bob' ? Math.sin(sceneClock.t * 0.6 + seed) * 0.05 : 0;
    group.current.visible = body.r > 0.15;
    const r = body.r;

    if (look.labels === 'tag') {
      // Editorial callout: a thin leader line from the blob's shoulder to a small caps label.
      // Point outward, toward the free space at the edges, so callouts do not cross the middle.
      const s = body.pos.x < 0 ? -1 : 1;
      if (s !== side) setSide(s);
      const up = isRoot ? 1 : -1;
      const ax = body.pos.x + s * r * 0.74;
      const ay = body.pos.y + bob + up * r * 0.7;
      const lx = ax + s * 0.5;
      const ly = ay + up * 0.32;
      group.current.position.set(lx, ly, 0.25);
      if (leader.current) {
        leader.current.scale.set(Math.hypot(ax - lx, ay - ly), 0.012, 1);
        leader.current.rotation.z = Math.atan2(ay - ly, ax - lx);
      }
    } else {
      // Sections are labelled above (their sub-topic floats below); sub-topics below.
      group.current.position.set(body.pos.x, body.pos.y + bob + (isRoot ? r * 1.15 + 0.12 : -r * 1.15 - 0.1), 0.2);
    }

    // On the stage, titles of the sections waiting around the ring step back to a smaller size.
    const scale = look.layout === 'stage' && isRoot && !focused ? TITLE_SIZE.aside / TITLE_SIZE.current : 1;
    group.current.scale.setScalar(group.current.scale.x + (scale - group.current.scale.x) * Math.min(1, dt * 2));

    const dimmed = (look.labels === 'quiet' || look.labels === 'typewriter') && !focused;
    opacity.current += ((dimmed ? 0.4 : 1) - opacity.current) * Math.min(1, dt * 2);
    if (text.current) {
      text.current.fillOpacity = opacity.current;
      text.current.outlineOpacity = opacity.current;
    }
    if (look.labels === 'typewriter' && typedCount <= topic.title.length) {
      const n = Math.floor((performance.now() - mounted) / 55);
      if (n !== typedCount) setTypedCount(n);
    }
  });

  const style = look.labels;
  const title = style === 'tag' ? topic.title.toUpperCase() : topic.title;
  const shown = style === 'typewriter' ? title.slice(0, Math.max(0, typedCount)) + (typedCount < title.length ? '▍' : '') : title;
  const tagAnchor = side > 0 ? 'left' : 'right';
  return (
    <group ref={group}>
      {style === 'tag' && (
        <mesh ref={leader} geometry={lineGeometry}>
          <meshBasicMaterial color="#f4f1ea" transparent opacity={0.5} />
        </mesh>
      )}
      <Billboard>
        <Text
          ref={text}
          fontSize={style === 'tag' ? (isRoot ? 0.15 : 0.12) : style === 'quiet' ? (isRoot ? 0.2 : 0.14) : isRoot ? 0.24 : 0.16}
          color="#f4f1ea"
          anchorX={style === 'tag' ? tagAnchor : 'center'}
          anchorY={style === 'tag' ? 'middle' : isRoot ? 'bottom' : 'top'}
          maxWidth={isRoot ? 3 : 2}
          textAlign={style === 'tag' ? tagAnchor : 'center'}
          letterSpacing={style === 'tag' ? 0.14 : style === 'quiet' ? 0.02 : 0}
          outlineWidth={style === 'quiet' || style === 'tag' ? 0 : 0.012}
          outlineColor="#141416"
        >
          {shown}
        </Text>
      </Billboard>
    </group>
  );
}
