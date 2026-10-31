import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

export function expandHome(p: string): string {
  return p.startsWith('~') ? homedir() + p.slice(1) : p;
}

export interface WhisperProcessOptions {
  bin: string;
  modelPath: string;
  port: number;
  threads: number;
}

/**
 * Makes sure a whisper.cpp `whisper-server` is listening on the configured port.
 * If one is already running (for example started by hand), it is reused and left alone on exit.
 */
export class WhisperProcess {
  private child: ChildProcess | null = null;
  status: 'idle' | 'starting' | 'ready' | 'external' | 'error' = 'idle';
  detail = '';

  constructor(private readonly opts: WhisperProcessOptions) {}

  get url(): string {
    return `http://127.0.0.1:${this.opts.port}`;
  }

  async ensureRunning(): Promise<void> {
    if (await this.ping()) {
      if (!this.child) this.status = 'external';
      return;
    }
    const model = expandHome(this.opts.modelPath);
    if (!existsSync(model)) {
      this.status = 'error';
      this.detail = `Whisper model not found at ${model}. Run \`npm run models\`.`;
      console.warn(`[stt] ${this.detail}`);
      return;
    }
    this.status = 'starting';
    console.log(`[stt] starting ${this.opts.bin} on :${this.opts.port} with ${model}`);
    this.child = spawn(
      this.opts.bin,
      ['-m', model, '-l', 'auto', '--port', String(this.opts.port), '-t', String(this.opts.threads), '-nlp'],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    this.child.stderr?.on('data', (buf: Buffer) => {
      const line = buf.toString();
      if (/error|failed/i.test(line)) console.warn(`[whisper-server] ${line.trim()}`);
    });
    this.child.on('error', (err) => {
      this.status = 'error';
      this.detail = `Could not start ${this.opts.bin}: ${err.message}. Install with \`brew install whisper-cpp\`.`;
      console.error(`[stt] ${this.detail}`);
    });
    this.child.on('exit', (code) => {
      if (this.status !== 'error') {
        this.status = 'error';
        this.detail = `whisper-server exited with code ${code}`;
      }
      this.child = null;
    });

    for (let i = 0; i < 120 && this.child; i++) {
      if (await this.ping()) {
        this.status = 'ready';
        console.log('[stt] whisper-server ready');
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  stop(): void {
    this.child?.kill('SIGTERM');
    this.child = null;
  }

  private async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/`, { signal: AbortSignal.timeout(800) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
