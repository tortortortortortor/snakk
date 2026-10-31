#!/usr/bin/env node
// Downloads whisper.cpp ggml models into ~/.cache/snakk/models.
// Usage: npm run models [-- large-v3-turbo-q5_0 | large-v3-turbo | small | base]
import { createWriteStream, existsSync, mkdirSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const name = process.argv[2] ?? 'large-v3-turbo-q5_0';
const dir = join(homedir(), '.cache', 'snakk', 'models');
const file = join(dir, `ggml-${name}.bin`);
const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${name}.bin`;

mkdirSync(dir, { recursive: true });
if (existsSync(file)) {
  console.log(`Already present: ${file}`);
  process.exit(0);
}
console.log(`Downloading ${url}`);
const res = await fetch(url);
if (!res.ok || !res.body) {
  console.error(`Download failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const total = Number(res.headers.get('content-length') ?? 0);
let done = 0;
let lastPct = -1;
const body = Readable.fromWeb(res.body);
body.on('data', (chunk) => {
  done += chunk.length;
  const pct = total ? Math.floor((done / total) * 100) : 0;
  if (pct !== lastPct && pct % 5 === 0) {
    lastPct = pct;
    process.stdout.write(`\r${pct}% of ${(total / 1e6).toFixed(0)} MB`);
  }
});
await pipeline(body, createWriteStream(`${file}.part`));
renameSync(`${file}.part`, file);
console.log(`\nSaved ${file}\nSet WHISPER_MODEL_PATH=${file.replace(homedir(), '~')} in .env if you use a non-default model.`);
