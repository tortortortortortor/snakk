import type { MicVAD } from '@ricky0123/vad-web';
import { concatFloat32, encodeWav, rms } from '../audio/wav';
import { Emitter, postTranscribe, type Listener, type TranscriptEventName, type TranscriptSource } from './source';

export interface LocalVadOptions {
  /** Silence that ends an utterance. A lecturer's natural pause is roughly 0.6-1 s. */
  redemptionMs: number;
  /** Send a snapshot of the utterance in progress this often, for live captions. 0 disables. */
  interimEveryMs: number;
  /** Utterances longer than this are cut so captions and topics keep moving. */
  maxUtteranceMs: number;
  /** Names and terms the speaker will use, e.g. "Tor, Nordlo Next, Whisper". Sent to Whisper as a prompt. */
  vocabulary: string;
}

export const DEFAULT_VAD_OPTIONS: LocalVadOptions = {
  redemptionMs: 800,
  interimEveryMs: 1800,
  maxUtteranceMs: 25_000,
  vocabulary: '',
};

const SAMPLE_RATE = 16000;

/**
 * Silero VAD runs in the browser and cuts the microphone stream at pauses.
 * Each finished utterance goes to the local Whisper server through /api/transcribe.
 * While someone is speaking, periodic snapshots give interim captions.
 */
export class LocalVadWhisperSource implements TranscriptSource {
  private emitter = new Emitter();
  private vad: MicVAD | null = null;
  private frames: Float32Array[] = [];
  private speaking = false;
  private speechStartedAt = 0;
  private sessionStart = 0;
  private interimInFlight = false;
  private lastInterimAt = 0;
  private utteranceSeq = 0;
  private lastFinalText = '';
  private finalChain: Promise<void> = Promise.resolve();

  constructor(private options: LocalVadOptions = DEFAULT_VAD_OPTIONS) {}

  on<K extends TranscriptEventName>(event: K, cb: Listener<K>) {
    return this.emitter.on(event, cb);
  }

  setOptions(update: Partial<LocalVadOptions>) {
    this.options = { ...this.options, ...update };
    if (update.redemptionMs !== undefined) this.vad?.setOptions({ redemptionMs: update.redemptionMs });
  }

  async start(): Promise<void> {
    if (this.vad) {
      await this.vad.start();
      this.emitter.emit('status', { state: 'listening' });
      return;
    }
    this.emitter.emit('status', { state: 'loading', detail: 'Loading voice detection' });
    this.sessionStart = performance.now();
    try {
      // Loaded on demand: onnxruntime is large and only needed once recording starts.
      const { MicVAD } = await import('@ricky0123/vad-web');
      this.vad = await MicVAD.new({
        model: 'v5',
        baseAssetPath: '/vad/',
        onnxWASMBasePath: '/vad/',
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        redemptionMs: this.options.redemptionMs,
        preSpeechPadMs: 400,
        minSpeechMs: 250,
        getStream: () =>
          navigator.mediaDevices.getUserMedia({
            audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          }),
        onSpeechStart: () => this.handleSpeechStart(),
        onVADMisfire: () => this.handleMisfire(),
        onSpeechEnd: (audio) => this.handleSpeechEnd(audio),
        onFrameProcessed: (probs, frame) => this.handleFrame(probs.isSpeech, frame),
      });
      await this.vad.start();
      this.emitter.emit('status', { state: 'listening' });
    } catch (err) {
      const message = (err as Error).message || String(err);
      this.emitter.emit('status', { state: 'error', detail: message });
      this.emitter.emit('error', { message });
      throw err;
    }
  }

  async stop(): Promise<void> {
    await this.vad?.pause();
    if (this.speaking && this.frames.length) this.handleSpeechEnd(concatFloat32(this.frames));
    this.emitter.emit('status', { state: 'idle' });
  }

  async destroy(): Promise<void> {
    await this.vad?.destroy();
    this.vad = null;
  }

  /** Whisper's prompt: the glossary first, then what was just said, for spelling and continuity. */
  private prompt(): string {
    const vocab = this.options.vocabulary.trim();
    return [vocab && `${vocab}.`, this.lastFinalText].filter(Boolean).join(' ');
  }

  private now() {
    return Math.round(performance.now() - this.sessionStart);
  }

  private handleSpeechStart() {
    this.speaking = true;
    this.frames = [];
    this.speechStartedAt = this.now();
    this.lastInterimAt = performance.now();
    this.utteranceSeq++;
    this.emitter.emit('speechStart', { atMs: this.speechStartedAt });
  }

  private handleMisfire() {
    this.speaking = false;
    this.frames = [];
    this.emitter.emit('speechEnd', { atMs: this.now(), durationMs: 0 });
  }

  private handleFrame(speechProb: number, frame: Float32Array) {
    this.emitter.emit('level', { rms: rms(frame), speechProb });
    if (!this.speaking) return;
    this.frames.push(frame.slice());
    const elapsed = performance.now() - this.lastInterimAt;
    const utteranceMs = (this.frames.length * frame.length * 1000) / SAMPLE_RATE;

    if (utteranceMs > this.options.maxUtteranceMs) {
      // Long monologue without a pause: cut here and keep listening.
      const audio = concatFloat32(this.frames);
      this.frames = [];
      this.sendFinal(audio, this.speechStartedAt, this.now());
      this.speechStartedAt = this.now();
      return;
    }
    if (this.options.interimEveryMs > 0 && elapsed > this.options.interimEveryMs && !this.interimInFlight && utteranceMs > 800) {
      this.lastInterimAt = performance.now();
      this.sendInterim(concatFloat32(this.frames));
    }
  }

  private handleSpeechEnd(audio: Float32Array) {
    this.speaking = false;
    this.frames = [];
    const endMs = this.now();
    this.emitter.emit('speechEnd', { atMs: endMs, durationMs: endMs - this.speechStartedAt });
    this.sendFinal(audio, this.speechStartedAt, endMs);
  }

  private sendInterim(audio: Float32Array) {
    const seq = this.utteranceSeq;
    this.interimInFlight = true;
    postTranscribe(encodeWav(audio, SAMPLE_RATE), { partial: true, prompt: this.prompt() })
      .then((res) => {
        if (res && res.text && seq === this.utteranceSeq && this.speaking) {
          this.emitter.emit('interim', { text: res.text, lang: res.language });
        }
      })
      .catch(() => undefined)
      .finally(() => (this.interimInFlight = false));
  }

  /** Finals are chained so they are emitted in speaking order even if the server is slow. */
  private sendFinal(audio: Float32Array, startMs: number, endMs: number) {
    const wav = encodeWav(audio, SAMPLE_RATE);
    const id = `u${startMs}`;
    const request = postTranscribe(wav, { partial: false, prompt: this.prompt() });
    this.finalChain = this.finalChain.then(async () => {
      try {
        const res = await request;
        if (!res || !res.text) return;
        this.lastFinalText = res.text;
        this.emitter.emit('final', { id, text: res.text, lang: res.language, startMs, endMs, latencyMs: res.latencyMs });
      } catch (err) {
        this.emitter.emit('error', { message: (err as Error).message });
      }
    });
  }
}
