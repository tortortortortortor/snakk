import { Environment, Lightformer } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { talkView, useSnakk } from '../../engine';
import { KeywordBubble } from './KeywordBubble';
import { computeLayout } from './layout';
import { look } from './look';
import { bodies, stepSimulation } from './simulation';
import { SectionGroup } from './SectionGroup';

function World() {
  const topicState = useSnakk((s) => s.topicState);
  const pending = useSnakk((s) => s.pendingKeywords);
  const viewport = useThree((s) => s.viewport);
  const drift = useRef<THREE.Group>(null);

  // Only the sub-topic being talked about is its own blob; finished ones are absorbed into their section.
  const { current, activeSubId, currentRootId } = talkView(topicState);
  const focusIds = useMemo(() => new Set([current?.id, currentRootId].filter((x): x is string => !!x)), [current?.id, currentRootId]);
  const camera = useThree((s) => s.camera);
  const targets = useMemo(
    () =>
      computeLayout(
        topicState.topics,
        topicState.order,
        { width: viewport.width, height: viewport.height },
        new Set(activeSubId ? [activeSubId] : []),
        { mode: look.layout, absorb: look.absorb, currentRootId },
      ),
    [topicState.topics, topicState.order, viewport.width, viewport.height, activeSubId, currentRootId],
  );

  useFrame((state, dt) => {
    const { speaking } = useSnakk.getState();
    stepSimulation(targets, Math.min(dt, 0.05), { time: state.clock.elapsedTime, speaking, focusIds, viewport });
    if (look.focus === 'camera') {
      // Drift the camera a little toward what is being talked about, and lean in.
      const f = currentRootId ? bodies.get(currentRootId) : undefined;
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * 0.6);
      camera.position.x += ((f ? f.pos.x * 0.3 : 0) - camera.position.x) * k;
      camera.position.y += ((f ? f.pos.y * 0.25 : 0) - camera.position.y) * k;
      camera.position.z += ((f ? 8.8 : 10) - camera.position.z) * k;
    }
    if (drift.current) {
      const t = state.clock.elapsedTime;
      drift.current.rotation.y = Math.sin(t * 0.07) * 0.06;
      drift.current.rotation.x = Math.sin(t * 0.05) * 0.03;
    }
  });

  return (
    <group ref={drift}>
      {topicState.order
        .filter((id) => !topicState.topics[id].parentId)
        .map((id) => (
          <SectionGroup
            key={id}
            root={topicState.topics[id]}
            subtopics={topicState.order.filter((c) => topicState.topics[c].parentId === id).map((c) => topicState.topics[c])}
            currentId={topicState.currentTopicId}
            activeSubId={activeSubId && topicState.topics[activeSubId]?.parentId === id ? activeSubId : null}
          />
        ))}
      {pending.map((b) => (
        <KeywordBubble key={b.id} bubble={b} colorIndex={topicState.topics[b.targetTopicId]?.colorIndex ?? 0} />
      ))}
    </group>
  );
}

export function Scene() {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 10], fov: 45 }} gl={{ antialias: true }}>
      <color attach="background" args={['#161618']} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 6]} intensity={1.6} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} position={[0, 5, -6]} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#ffd9c2" position={[-6, 0, 2]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#c2d6ff" position={[6, 0, 2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" intensity={2} position={[0, -4, 4]} scale={3} />
      </Environment>
      <World />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.7} intensity={0.55} />
        <Vignette eskil={false} offset={0.2} darkness={0.55} />
      </EffectComposer>
    </Canvas>
  );
}
