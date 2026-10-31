import type { TranscribeResult } from '../shared/topics.ts';
import { isAllowed } from './languages.ts';
import type { TranscribeEngine } from './engines/types.ts';

/**
 * Serializes requests to the local engine (it transcribes one clip at a time),
 * drops interim snapshots when a final is waiting, and keeps auto-detected
 * languages inside the allowlist.
 */
export class TranscribeService {
  private chain: Promise<unknown> = Promise.resolve();
  private pendingFinals = 0;
  private busy = false;
  private lastLanguage: string;

  constructor(
    private readonly engine: TranscribeEngine,
    private readonly allowlist: string[],
  ) {
    this.lastLanguage = allowlist[0] ?? 'en';
  }

  /** Returns null when an interim request was skipped because the engine is busy. */
  async transcribe(wav: Buffer, opts: { partial: boolean; prompt?: string }): Promise<TranscribeResult | null> {
    if (opts.partial && (this.busy || this.pendingFinals > 0)) return null;
    if (!opts.partial) this.pendingFinals++;

    const run = async (): Promise<TranscribeResult> => {
      this.busy = true;
      const started = Date.now();
      try {
        let result = await this.engine.transcribe({ wav, partial: opts.partial, prompt: opts.prompt });
        const detected = result.language;
        // Short clips are where auto-detection misfires. Re-run with the last good language.
        if (!isAllowed(detected, this.allowlist) && result.text) {
          result = await this.engine.transcribe({
            wav,
            partial: opts.partial,
            prompt: opts.prompt,
            language: this.lastLanguage,
          });
          result.language = this.lastLanguage;
        } else if (!opts.partial && result.text && detected !== 'und') {
          this.lastLanguage = detected === 'nn' ? 'no' : detected;
        }
        return {
          text: result.text,
          language: result.language === 'und' ? this.lastLanguage : result.language,
          detectedLanguage: detected,
          durationMs: result.durationMs,
          latencyMs: Date.now() - started,
          partial: opts.partial,
          engine: this.engine.name,
        };
      } finally {
        this.busy = false;
        if (!opts.partial) this.pendingFinals--;
      }
    };

    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }
}
