import type { TranscribeResult } from '../../../shared/topics';

export interface FinalTranscript {
  id: string;
  text: string;
  lang: string;
  startMs: number;
  endMs: number;
  latencyMs: number;
}

export interface TranscriptEvents {
  speechStart: { atMs: number };
  speechEnd: { atMs: number; durationMs: number };
  interim: { text: string; lang: string };
  final: FinalTranscript;
  level: { rms: number; speechProb: number };
  status: { state: 'idle' | 'loading' | 'listening' | 'error'; detail?: string };
  error: { message: string };
}

export type TranscriptEventName = keyof TranscriptEvents;
export type Listener<K extends TranscriptEventName> = (payload: TranscriptEvents[K]) => void;

/** Anything that turns the microphone into transcript events. Swap implementations without touching the app. */
export interface TranscriptSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  on<K extends TranscriptEventName>(event: K, cb: Listener<K>): () => void;
}

export class Emitter {
  private listeners = new Map<string, Set<(p: unknown) => void>>();
  on<K extends TranscriptEventName>(event: K, cb: Listener<K>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(cb as (p: unknown) => void);
    this.listeners.set(event, set);
    return () => set.delete(cb as (p: unknown) => void);
  }
  emit<K extends TranscriptEventName>(event: K, payload: TranscriptEvents[K]): void {
    this.listeners.get(event)?.forEach((cb) => cb(payload));
  }
}

export async function postTranscribe(
  wav: ArrayBuffer,
  opts: { partial: boolean; prompt?: string },
): Promise<TranscribeResult | null> {
  const qs = new URLSearchParams();
  if (opts.partial) qs.set('partial', '1');
  if (opts.prompt) qs.set('prompt', opts.prompt.slice(-400));
  const res = await fetch(`/api/transcribe?${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'audio/wav' },
    body: wav,
  });
  if (res.status === 204) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `transcribe failed (${res.status})`);
  return json as TranscribeResult;
}
