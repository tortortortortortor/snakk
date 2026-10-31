/**
 * The engine: speech to text, text to a topic tree, sessions and replay. It knows nothing about
 * how the talk is drawn. Visualizations read from here; only the shell drives the controller.
 */
export { useSnakk, type Mode, type OpsLogEntry } from './store';
export { sectionHops, talkView, type SectionHop, type SectionView, type TalkView } from './selectors';
export type { PendingKeyword, Segment, Topic, TopicState } from './topics/types';
