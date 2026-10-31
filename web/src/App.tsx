import { lazy, Suspense, useMemo } from 'react';
import { Overlay } from './ui/Overlay';
import { useShell } from './ui/shell';
import { useAutoLand } from './ui/useAutoLand';

export function App() {
  const viz = useShell((s) => s.viz);
  const Stage = useMemo(() => lazy(viz.load), [viz]);
  useAutoLand(!viz.animatesKeywords);
  return (
    <>
      <Suspense fallback={null}>
        <Stage key={viz.id} />
      </Suspense>
      <Overlay />
    </>
  );
}
