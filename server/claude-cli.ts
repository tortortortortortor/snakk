import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { execFile, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TopicOpsResponseSchema, type CategorizeRequest, type CategorizeResponse } from '../shared/topics.ts';
import { renderUserTurn, SYSTEM_PROMPT, type TopicProvider } from './topics.ts';

const JSON_SCHEMA = JSON.stringify(betaZodOutputFormat(TopicOpsResponseSchema).schema);

/**
 * Runs the categorizer through Claude Code's headless mode (`claude -p`), so it uses the
 * local Claude Code login instead of an API key. Each call is a fresh, tool-less,
 * settings-free session in an empty temp directory: no hooks, plugins, MCP servers,
 * CLAUDE.md or session files, which keeps it at roughly 2-4 s per call.
 */
export class ClaudeCliProvider implements TopicProvider {
  readonly name = 'claude-cli';
  private readonly workdir: string;
  private readonly mcpConfig: string;

  constructor(
    readonly model: string,
    private readonly bin = process.env.CLAUDE_BIN ?? 'claude',
    private readonly timeoutMs = 45_000,
  ) {
    this.workdir = mkdtempSync(join(tmpdir(), 'snakk-claude-'));
    this.mcpConfig = join(this.workdir, 'empty-mcp.json');
    writeFileSync(this.mcpConfig, '{"mcpServers":{}}');
  }

  args(): string[] {
    return [
      '-p',
      '--model', this.model,
      '--effort', 'low',
      '--tools', '',
      '--output-format', 'json',
      '--no-session-persistence',
      '--setting-sources', '',
      '--strict-mcp-config', '--mcp-config', this.mcpConfig,
      '--disable-slash-commands',
      '--system-prompt', SYSTEM_PROMPT,
      '--json-schema', JSON_SCHEMA,
    ];
  }

  categorize(req: CategorizeRequest): Promise<CategorizeResponse> {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, this.args(), { cwd: this.workdir, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`claude -p timed out after ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      child.stdout.on('data', (b: Buffer) => (stdout += b.toString()));
      child.stderr.on('data', (b: Buffer) => (stderr += b.toString()));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`Could not run ${this.bin}: ${err.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          const out = JSON.parse(stdout) as {
            is_error?: boolean;
            result?: string;
            structured_output?: unknown;
          };
          if (out.is_error) throw new Error(`claude -p failed: ${out.result ?? stderr}`);
          const raw = out.structured_output ?? (out.result ? JSON.parse(out.result) : undefined);
          const parsed = TopicOpsResponseSchema.parse(raw);
          resolve({ ...parsed, provider: this.name, model: this.model, latencyMs: Date.now() - started });
        } catch (err) {
          reject(new Error(`claude -p exited ${code}: ${(err as Error).message} ${stderr.slice(0, 300)}`));
        }
      });
      child.stdin.end(renderUserTurn(req));
    });
  }

  health(): Promise<{ ok: boolean; detail?: string }> {
    return new Promise((resolve) => {
      execFile(this.bin, ['--version'], { timeout: 5000 }, (err, stdout) => {
        if (err) resolve({ ok: false, detail: `\`${this.bin}\` not found. Install Claude Code or set TOPIC_PROVIDER.` });
        else resolve({ ok: true, detail: `Claude Code ${stdout.trim()} (uses your Claude Code login)` });
      });
    });
  }
}

export function claudeCliAvailable(bin = process.env.CLAUDE_BIN ?? 'claude'): Promise<boolean> {
  return new Promise((resolve) => execFile(bin, ['--version'], { timeout: 5000 }, (err) => resolve(!err)));
}
