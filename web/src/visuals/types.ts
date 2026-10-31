import type { ComponentType } from 'react';

/**
 * A way of drawing the talk. A visualization is a full-screen React component that reads the
 * engine's store (`useSnakk`, `talkView`, `sectionHops`) and never writes to it, except to land
 * pending keywords when it animates them. Captions and controls are drawn by the shell on top.
 */
export interface Visualization {
  id: string;
  name: string;
  /** One line for the switcher. */
  description: string;
  /** Loaded on demand, so one view's dependencies (three.js, fonts) never weigh on another. */
  load: () => Promise<{ default: ComponentType }>;
  /**
   * The view animates each pending keyword and calls `landKeyword` when it arrives. When false,
   * the shell lands each keyword after its `delayMs` and the view draws `landedKeywords` as they come.
   */
  animatesKeywords: boolean;
}
