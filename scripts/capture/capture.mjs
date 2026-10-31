#!/usr/bin/env node
// Replays a recorded session in headless Chrome (real GPU) and saves stills, a clip and a motion-trail
// composite for each job, so visualizations and their options can be compared at the same lecture second.
//
// Usage: node scripts/capture/capture.mjs <jobs.json> [nameFilterRegex]
// Needs `npm run dev` running, and ffmpeg for clips. Output: captures/<job name>/.
//
// jobs.json: [{ "name": "chalk-end", "query": "viz=chalkboard", "from": 318000, "shots": [322000, 332000], "clip": [318000, 334000] }]
//   query    URL query string (viz=..., look=...)
//   from     ms into the session; everything before is applied at once
//   shots    ms into the session to take a still at
//   clip     optional [startMs, endMs] for clip.mp4 and trail.png
//   session  optional path to a session file (default: the northern-lights lecture)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../..');
const [jobsFile, filter] = process.argv.slice(2);
if (!jobsFile) {
  console.error('usage: node scripts/capture/capture.mjs <jobs.json> [nameFilterRegex]');
  process.exit(1);
}
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8')).filter((j) => !filter || new RegExp(filter).test(j.name));
const DEFAULT_SESSION = path.join(root, 'fixtures/sessions/lecture-northern-lights-claude-sonnet-5-5.json');
const outRoot = path.join(root, 'captures');

// Metal ANGLE gives headless Chrome the real GPU on macOS, so shaders run at full frame rate.
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const job of jobs) {
  const dir = path.join(outRoot, job.name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const session = JSON.parse(fs.readFileSync(job.session ?? DEFAULT_SESSION, 'utf8'));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: `${dir}/raw`, size: { width: 1280, height: 720 } } });
  const ctxStart = Date.now();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(job.name, 'PAGEERROR', e.message));
  await page.goto(`http://localhost:5173/?${job.query ?? ''}`);
  await page.waitForFunction(() => window.snakk);
  await page.keyboard.press('p'); // presenter mode: no top bar or controls
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const replayStart = Date.now();
  await page.evaluate(([s, from]) => window.snakk.startReplay(s, { speed: 1, mode: 'recorded', fromMs: from }), [session, job.from]);
  for (const at of job.shots) {
    const wait = at - job.from - (Date.now() - replayStart);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: `${dir}/${String(Math.round(at / 100)).padStart(4, '0')}.png` });
  }
  const end = job.clip ? job.clip[1] : job.shots.at(-1);
  const left = end - job.from - (Date.now() - replayStart);
  if (left > 0) await page.waitForTimeout(left + 200);
  await ctx.close();
  const raw = path.join(dir, 'raw', fs.readdirSync(`${dir}/raw`)[0]);
  if (job.clip) {
    const ss = String((replayStart - ctxStart + (job.clip[0] - job.from)) / 1000);
    const dur = (job.clip[1] - job.clip[0]) / 1000;
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss, '-t', String(dur), '-i', raw, '-vf', 'scale=960:-2,fps=30', '-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', `${dir}/clip.mp4`]);
    // Motion trail: light lingers, so the paths things took show up in one still.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', ss, '-t', String(dur), '-i', raw, '-vf', 'scale=960:-2,fps=30,lagfun=decay=0.965', '-update', '1', '-frames:v', String(Math.round(dur * 30) - 1), `${dir}/trail.png`]);
  }
  fs.rmSync(`${dir}/raw`, { recursive: true, force: true });
  console.log('done', job.name, '->', path.relative(root, dir));
}
await browser.close();
