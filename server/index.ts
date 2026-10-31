import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { basename } from 'node:path';
import type { CategorizeRequest, HealthResponse } from '../shared/topics.ts';
import { WhisperCppEngine } from './engines/whispercpp.ts';
import { WhisperKitEngine } from './engines/whisperkit.ts';
import type { TranscribeEngine } from './engines/types.ts';
import { parseAllowlist } from './languages.ts';
import { claudeCliAvailable, ClaudeCliProvider } from './claude-cli.ts';
import { AnthropicTopicProvider, OfflineTopicProvider, type TopicProvider } from './topics.ts';
import { TranscribeService } from './transcribe.ts';
import { WhisperProcess } from './whisper-process.ts';

const env = process.env;
const API_PORT = Number(env.API_PORT ?? 8787);
const STT_ENGINE = env.STT_ENGINE ?? 'whispercpp';
const MODEL_PATH = env.WHISPER_MODEL_PATH ?? '~/.cache/snakk/models/ggml-large-v3-turbo-q5_0.bin';

let whisperProcess: WhisperProcess | null = null;
let engine: TranscribeEngine;
if (STT_ENGINE === 'whisperkit') {
  engine = new WhisperKitEngine(env.WHISPERKIT_URL ?? 'http://127.0.0.1:50060', env.WHISPERKIT_MODEL ?? 'large-v3-v20240930_turbo');
} else {
  whisperProcess = new WhisperProcess({
    bin: env.WHISPER_SERVER_BIN ?? 'whisper-server',
    modelPath: MODEL_PATH,
    port: Number(env.WHISPER_SERVER_PORT ?? 8178),
    threads: Number(env.WHISPER_THREADS ?? 8),
  });
  engine = new WhisperCppEngine(whisperProcess.url, basename(MODEL_PATH));
}
const transcriber = new TranscribeService(engine, parseAllowlist(env.STT_LANGUAGES));

/**
 * TOPIC_PROVIDER: auto (default) | anthropic | claude-cli | offline.
 * auto = the Anthropic API when a key is set, else `claude -p` via the local Claude Code login, else offline.
 */
async function pickTopicProvider(): Promise<TopicProvider> {
  const model = env.TOPIC_MODEL ?? 'claude-sonnet-5-5';
  const choice = env.TOPIC_PROVIDER ?? 'auto';
  if (choice === 'offline') return new OfflineTopicProvider();
  if (choice === 'anthropic') return new AnthropicTopicProvider(model);
  if (choice === 'claude-cli') return new ClaudeCliProvider(model);
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return new AnthropicTopicProvider(model);
  if (await claudeCliAvailable()) return new ClaudeCliProvider(model);
  return new OfflineTopicProvider();
}
const topicProvider = await pickTopicProvider();
const offline = new OfflineTopicProvider();

const app = new Hono();

app.get('/api/health', async (c) => {
  const [stt, topics] = await Promise.all([engine.health(), topicProvider.health()]);
  const body: HealthResponse = {
    ok: stt.ok && topics.ok,
    stt: {
      engine: engine.name,
      model: engine.model,
      ok: stt.ok,
      detail: stt.detail ?? (whisperProcess?.status === 'error' ? whisperProcess.detail : undefined),
    },
    topics: { provider: topicProvider.name, model: topicProvider.model, ok: topics.ok, detail: topics.detail },
  };
  return c.json(body);
});

/** Body: a 16 kHz mono WAV. Query: partial=1 for interim snapshots, prompt=<previous text>. */
app.post('/api/transcribe', async (c) => {
  const wav = Buffer.from(await c.req.arrayBuffer());
  if (wav.length < 44) return c.json({ error: 'empty audio' }, 400);
  const partial = c.req.query('partial') === '1';
  const prompt = c.req.query('prompt') || undefined;
  try {
    const result = await transcriber.transcribe(wav, { partial, prompt });
    if (!result) return c.body(null, 204);
    return c.json(result);
  } catch (err) {
    console.error('[stt]', err);
    return c.json({ error: (err as Error).message }, 502);
  }
});

/** Body: CategorizeRequest. Query: provider=offline forces the heuristic. */
app.post('/api/topics', async (c) => {
  const req = (await c.req.json()) as CategorizeRequest;
  if (!req?.utterance?.trim()) return c.json({ error: 'empty utterance' }, 400);
  const provider = c.req.query('provider') === 'offline' ? offline : topicProvider;
  try {
    return c.json(await provider.categorize(req));
  } catch (err) {
    console.error('[topics]', err);
    return c.json({ error: (err as Error).message, provider: provider.name }, 502);
  }
});

const server = serve({ fetch: app.fetch, port: API_PORT, hostname: '127.0.0.1' }, (info) => {
  console.log(`[api] listening on http://127.0.0.1:${info.port} (stt=${engine.name}, topics=${topicProvider.name}/${topicProvider.model})`);
});
void whisperProcess?.ensureRunning();

function shutdown() {
  whisperProcess?.stop();
  server.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
