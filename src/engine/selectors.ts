import type { Topic, TopicState } from './topics/types';

/** A top-level section with its sub-topics, in creation order. */
export interface SectionView {
  root: Topic;
  subtopics: Topic[];
}

/** What every visualization needs to know about the talk, derived from the topic tree. */
export interface TalkView {
  sections: SectionView[];
  current: Topic | null;
  /** The section being talked about (the current topic, or its parent). */
  currentRootId: string | null;
  /** The current topic when it is a sub-topic. */
  activeSubId: string | null;
}

export function talkView(state: TopicState): TalkView {
  const current = state.currentTopicId ? (state.topics[state.currentTopicId] ?? null) : null;
  const sections = state.order
    .filter((id) => state.topics[id] && !state.topics[id].parentId)
    .map((id) => ({
      root: state.topics[id],
      subtopics: state.order.filter((c) => state.topics[c]?.parentId === id).map((c) => state.topics[c]),
    }));
  return {
    sections,
    current,
    currentRootId: current ? (current.parentId ?? current.id) : null,
    activeSubId: current?.parentId ? current.id : null,
  };
}

/** One move of the talk from one section to another. */
export interface SectionHop {
  from: string;
  to: string;
  at: number;
  /** The talk went back to a section it had already left. */
  returning: boolean;
}

/** The trail reduced to moves between sections: going into a sub-topic and back out is not a hop. */
export function sectionHops(state: TopicState): SectionHop[] {
  const rootOf = (id: string) => state.topics[id]?.parentId ?? id;
  const hops: SectionHop[] = [];
  const seen = new Set<string>();
  let prev: string | null = null;
  for (const { topicId, at } of state.trail) {
    if (!state.topics[topicId]) continue;
    const root = rootOf(topicId);
    if (prev && root !== prev) hops.push({ from: prev, to: root, at, returning: seen.has(root) });
    seen.add(root);
    prev = root;
  }
  return hops;
}
