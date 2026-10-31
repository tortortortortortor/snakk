import type { SessionFile } from './recorder';

/**
 * A scripted talk (Tor's own example) used by the Demo button. It is replayed in
 * "recategorize" mode, so it exercises the real categorizer without a microphone.
 */
const LINES: [number, string][] = [
  [0, 'Hello everyone, my name is Tor, and today I will start with a brief introduction of myself before we carry on to the big topics.'],
  [7000, 'So my background is from academia. I have a PhD in physics, where I worked on numerical models of ocean currents.'],
  [14000, 'After the PhD I moved into software, and for the time being I work as a full stack front end developer at Nordlo Next, mostly with React and Next.js.'],
  [22000, 'Okay, now let us move on to the first big topic, which is how large language models are changing the way we write software.'],
  [29000, 'Coding agents like Claude Code can read a whole repository, run the tests, and propose changes, so the developer becomes more of a reviewer and an architect.'],
  [37000, 'That also changes how we plan work. We write specifications and build logs, and we iterate with the agent instead of typing every line ourselves.'],
  [45000, 'The second big topic is local speech recognition. Whisper runs on a laptop now, so this talk is being transcribed on my Mac without sending audio to the cloud.'],
  [53000, 'Voice activity detection finds the pauses, and each pause is the moment the system asks the model what I am talking about.'],
];

export const DEMO_SESSION: SessionFile = {
  version: 1,
  createdAt: '2026-10-30T00:00:00.000Z',
  title: 'Demo: introduction and two topics',
  events: LINES.flatMap(([t, text], i) => [
    { t, type: 'speechStart' as const },
    { t: t + 4000, type: 'speechEnd' as const },
    {
      t: t + 4500,
      type: 'final' as const,
      forced: true,
      segment: { id: `demo${i}`, text, lang: 'en', startMs: t, endMs: t + 4000, latencyMs: 0 },
    },
  ]),
};
