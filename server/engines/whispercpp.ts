import { toIsoLanguage } from '../languages.ts';
import type { EngineRequest, EngineResult, TranscribeEngine } from './types.ts';

interface VerboseJson {
  language?: string;
  duration?: number;
  text?: string;
}

/** Talks to a local whisper.cpp `whisper-server` (Metal on Apple Silicon). */
export class WhisperCppEngine implements TranscribeEngine {
  readonly name = 'whisper.cpp';

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
  ) {}

  async transcribe(req: EngineRequest): Promise<EngineResult> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(req.wav)], { type: 'audio/wav' }), 'utterance.wav');
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0.0');
    form.append('temperature_inc', req.partial ? '0.0' : '0.2');
    form.append('language', req.language ?? 'auto');
    if (req.prompt) form.append('prompt', req.prompt.slice(-400));

    const res = await fetch(`${this.baseUrl}/inference`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`whisper-server ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as VerboseJson & { error?: string };
    if (json.error) throw new Error(`whisper-server: ${json.error}`);
    return {
      text: cleanText(json.text ?? ''),
      language: toIsoLanguage(json.language),
      durationMs: Math.round((json.duration ?? 0) * 1000),
    };
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/`, { signal: AbortSignal.timeout(1500) });
      return { ok: res.ok };
    } catch (err) {
      return { ok: false, detail: `whisper-server not reachable at ${this.baseUrl}: ${(err as Error).message}` };
    }
  }
}

/** Whisper inserts line breaks and hallucinates a few stock phrases on near-silence. */
const HALLUCINATIONS = [
  /^\s*\[(?:BLANK_AUDIO|MUSIC|Music|music|silence)\]\s*$/,
  /^\s*\((?:music|Musikk|musikk)\)\s*$/,
  /^\s*(?:Thank you\.?|Thanks for watching!?|Teksting av .*|Undertekster av .*)\s*$/i,
];

export function cleanText(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  return HALLUCINATIONS.some((re) => re.test(text)) ? '' : text;
}
