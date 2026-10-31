import { useEffect } from 'react';
import { useSnakk } from '../engine/store';

/** How long a keyword is "on its way" in views that do not animate the trip. */
const TRAVEL_MS = 700;

/** For views that do not animate keywords: land each pending keyword after its stagger delay. */
export function useAutoLand(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const schedule = () => {
      for (const k of useSnakk.getState().pendingKeywords) {
        if (timers.has(k.id)) continue;
        const wait = Math.max(0, k.spawnedAt + k.delayMs + TRAVEL_MS - Date.now());
        timers.set(k.id, setTimeout(() => useSnakk.getState().landKeyword(k.id), wait));
      }
    };
    schedule();
    const unsubscribe = useSnakk.subscribe((s, prev) => {
      if (s.pendingKeywords !== prev.pendingKeywords) schedule();
    });
    return () => {
      unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, [enabled]);
}
