export interface EngineRequest {
  wav: Buffer;
  partial: boolean;
  /** Text the speaker said just before, to keep vocabulary and spelling consistent. */
  prompt?: string;
  /** ISO-639-1 code; omitted means auto-detect. */
  language?: string;
}

export interface EngineResult {
  text: string;
  /** ISO-639-1, or 'und' if the engine did not say. */
  language: string;
  durationMs: number;
}

export interface TranscribeEngine {
  readonly name: string;
  readonly model: string;
  transcribe(req: EngineRequest): Promise<EngineResult>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}
