import type { Visualization } from './types';

export const VISUALIZATIONS: Visualization[] = [
  {
    id: 'bubbles',
    name: 'Bubbles',
    description: 'Ray-marched 3D blobs; keywords fly in and melt into their section.',
    load: () => import('./bubbles'),
    animatesKeywords: true,
  },
  {
    id: 'chalkboard',
    name: 'Chalkboard',
    description: 'A 2D board written in chalk: sections circled, sub-topics and the path of the talk drawn as arrows.',
    load: () => import('./chalkboard'),
    animatesKeywords: false,
  },
];

const STORAGE_KEY = 'snakk.visualization';

/** `?viz=chalkboard` wins, then the last one picked in this browser, then the first. */
export function initialVisualization(search: string): Visualization {
  const byId = (id: string | null) => VISUALIZATIONS.find((v) => v.id === id);
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  return byId(new URLSearchParams(search).get('viz')) ?? byId(remembered) ?? VISUALIZATIONS[0];
}

export function rememberVisualization(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable */
  }
}
