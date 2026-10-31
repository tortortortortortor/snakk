import { describe, expect, it, vi } from 'vitest';
import type { CategorizeRequest, CategorizeResponse } from '../../../shared/topics';
import { TopicEngine } from './engine';
import { emptyTopicState, type Segment } from './types';

let n = 0;
const seg = (text: string): Segment => ({ id: `s${++n}`, text, lang: 'en', startMs: 0, endMs: 0 });
const ok: CategorizeResponse = { utterance_language: 'en', current_topic_id: null, ops: [], provider: 'test', model: 'm', latencyMs: 1 };

function setup() {
  const timers: { fn: () => void; ms: number }[] = [];
  const requests: CategorizeRequest[] = [];
  let release: (() => void) | null = null;
  const deps = {
    categorize: vi.fn(async (req: CategorizeRequest) => {
      requests.push(req);
      await new Promise<void>((r) => (release = r));
      return ok;
    }),
    getState: emptyTopicState,
    onResponse: vi.fn(),
    onError: vi.fn(),
    setTimer: (fn: () => void, ms: number) => timers.push({ fn, ms }) - 1,
    clearTimer: (h: unknown) => {
      timers[h as number] = { fn: () => {}, ms: -1 };
    },
  };
  const engine = new TopicEngine(deps);
  const finish = async () => {
    release?.();
    await new Promise((r) => setTimeout(r, 0));
  };
  return { engine, deps, timers, requests, finish };
}

describe('TopicEngine', () => {
  it('flushes as soon as a pause brings the buffer to the minimum', async () => {
    const { engine, requests, finish } = setup();
    engine.addFinal(seg('Hello my name is Tor'));
    expect(requests).toHaveLength(0);
    engine.addFinal(seg('and I code'));
    expect(requests).toHaveLength(1);
    expect(requests[0].utterance).toBe('Hello my name is Tor and I code');
    await finish();
  });

  it('flushes a short buffer after quiet, but not while speaking', () => {
    const { engine, timers, requests } = setup();
    engine.addFinal(seg('Okay so'));
    expect(timers.at(-1)?.ms).toBe(2500);
    engine.speechStart();
    timers.forEach((t) => t.fn());
    expect(requests).toHaveLength(0);
    engine.speechEnd();
    engine.addFinal(seg('next topic'));
    timers.at(-1)!.fn();
    expect(requests).toHaveLength(1);
  });

  it('keeps one request in flight and sends what arrived meanwhile next', async () => {
    const { engine, requests, finish, deps } = setup();
    engine.addFinal(seg('one two three four five six seven eight'));
    engine.addFinal(seg('nine ten eleven twelve thirteen fourteen fifteen sixteen'));
    expect(requests).toHaveLength(1);
    await finish();
    expect(deps.onResponse).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(2);
    expect(requests[1].context).toEqual(['one two three four five six seven eight']);
    await finish();
  });

  it('reports errors and keeps going', async () => {
    const { engine, deps } = setup();
    deps.categorize.mockRejectedValueOnce(new Error('boom'));
    engine.addFinal(seg('a b c d e f g h i'), true);
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.onError).toHaveBeenCalled();
  });
});
