import { toIsoLanguage } from '../languages.ts';
import { cleanText } from './whispercpp.ts';
import type { EngineRequest, EngineResult, TranscribeEngine } from './types.ts';

/**
 * WhisperKit's local server (`whisperkit-cli serve`, the engine metawhisp uses).
 * It implements the OpenAI audio API, so this adapter speaks /v1/audio/transcriptions.
 * Start it yourself: `brew install whisperkit-cli && whisperkit-cli serve --port 50060`.
 */
export class WhisperKitEngine implements TranscribeEngine {
  readonly name = 'whisperkit';

  constructor(
    private readonly baseUrl: string,
    readonly model: string,
  ) {}

  async transcribe(req: EngineRequest): Promise<EngineResult> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(req.wav)], { type: 'audio/wav' }), 'utterance.wav');
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');
    if (req.language) form.append('language', req.language);
    if (req.prompt) form.append('prompt', req.prompt.slice(-400));
    const res = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`whisperkit ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { text?: string; language?: string; duration?: number };
    return {
      text: cleanText(json.text ?? ''),
      language: toIsoLanguage(json.language),
      durationMs: Math.round((json.duration ?? 0) * 1000),
    };
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, { signal: AbortSignal.timeout(1500) });
      return { ok: res.ok };
    } catch (err) {
      return { ok: false, detail: `WhisperKit server not reachable at ${this.baseUrl}: ${(err as Error).message}` };
    }
  }
}
