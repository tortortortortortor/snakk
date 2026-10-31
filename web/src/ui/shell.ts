import { create } from 'zustand';
import { initialVisualization, rememberVisualization } from '../visuals/registry';
import type { Visualization } from '../visuals/types';

/** Shell state that is about presentation, not the talk: which visualization is on screen. */
export const useShell = create<{ viz: Visualization; setViz: (v: Visualization) => void }>((set) => ({
  viz: initialVisualization(typeof location === 'undefined' ? '' : location.search),
  setViz: (viz) => {
    rememberVisualization(viz.id);
    const url = new URL(location.href);
    url.searchParams.set('viz', viz.id);
    history.replaceState(null, '', url);
    set({ viz });
  },
}));
