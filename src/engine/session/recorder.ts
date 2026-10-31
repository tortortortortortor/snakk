import type { CategorizeResponse } from '../../../shared/topics';
import type { FinalTranscript } from '../transcript/source';

export type SessionEvent =
  | { t: number; type: 'speechStart' }
  | { t: number; type: 'speechEnd' }
  | { t: number; type: 'interim'; text: string; lang: string }
  | { t: number; type: 'final'; segment: FinalTranscript; forced?: boolean }
  | { t: number; type: 'categorized'; segmentIds: string[]; words: number; response: CategorizeResponse };

export interface SessionFile {
  version: 1;
  createdAt: string;
  title: string;
  events: SessionEvent[];
}

type Untimed = SessionEvent extends infer E ? (E extends SessionEvent ? Omit<E, 't'> : never) : never;

/** Records every transcript and categorizer event with a timestamp so a lecture can be replayed. */
export class SessionRecorder {
  private events: SessionEvent[] = [];
  private startedAt = performance.now();

  record(event: Untimed): void {
    if (this.events.length === 0) this.startedAt = performance.now();
    this.events.push({ ...event, t: Math.round(performance.now() - this.startedAt) } as SessionEvent);
  }

  get size(): number {
    return this.events.length;
  }

  clear(): void {
    this.events = [];
  }

  toFile(title = 'snakk session'): SessionFile {
    return { version: 1, createdAt: new Date().toISOString(), title, events: [...this.events] };
  }

  download(): void {
    const file = this.toFile();
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `snakk-session-${file.createdAt.replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

export function parseSessionFile(text: string): SessionFile {
  const json = JSON.parse(text) as SessionFile;
  if (json.version !== 1 || !Array.isArray(json.events)) throw new Error('Not a snakk session file');
  return json;
}
