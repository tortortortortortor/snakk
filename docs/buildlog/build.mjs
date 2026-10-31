#!/usr/bin/env node
// Renders docs/buildlog/entries.json into docs/buildlog/index.html (the published build-log artifact).
// Usage: npm run buildlog
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, 'entries.json'), 'utf8'));

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Escape, then allow **bold**. */
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const TYPE_LABEL = { milestone: 'Milestone', decision: 'Decision', proposal: 'Needs your call', note: 'Note' };
const STATUS_LABEL = { done: 'Done', partial: 'In progress', todo: 'Not started' };

const fmtDate = (d) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function renderEntry(e) {
  const parts = [];
  parts.push(`<header class="entry-head">
      <span class="orb orb-${e.type}" aria-hidden="true"></span>
      <span class="type">${TYPE_LABEL[e.type] ?? esc(e.type)}</span>
      <time datetime="${esc(e.date)}">${fmtDate(e.date)}</time>
    </header>
    <h3>${inline(e.title)}</h3>`);
  if (e.context) parts.push(`<dl class="adr"><dt>Context</dt><dd>${inline(e.context)}</dd>`);
  if (e.choice) parts.push(`<dt>Choice</dt><dd>${inline(e.choice)}</dd>`);
  if (e.alternatives) parts.push(`<dt>Considered</dt><dd><ul>${e.alternatives.map((a) => `<li>${inline(a)}</li>`).join('')}</ul></dd>`);
  if (e.consequences) parts.push(`<dt>Consequences</dt><dd>${inline(e.consequences)}</dd>`);
  if (e.context) parts.push('</dl>');
  for (const p of e.body ?? []) parts.push(`<p>${inline(p)}</p>`);
  if (e.metrics) {
    parts.push(`<table class="metrics"><tbody>${e.metrics
      .map(([k, v]) => `<tr><th scope="row">${inline(k)}</th><td>${inline(v)}</td></tr>`)
      .join('')}</tbody></table>`);
  }
  if (e.diagram) parts.push(`<div class="diagram"><pre class="mermaid">${esc(e.diagram)}</pre></div>`);
  if (e.image) parts.push(`<figure><img src="${esc(e.image.src)}" alt="${esc(e.image.alt)}" loading="lazy"><figcaption>${inline(e.image.alt)}</figcaption></figure>`);
  parts.push(`<button type="button" class="comment" id="comment-btn-${esc(e.id)}" data-entry="${esc(e.id)}" hidden>Comment on this</button>`);
  return `<article class="entry entry-${e.type}" id="${esc(e.id)}" data-comment-target>${parts.join('\n    ')}</article>`;
}

/** Entries grouped under "Day N" headings, newest day first; day 1 is the first date in the log. */
function renderDays(entries) {
  const days = [...new Set(entries.map((e) => e.date))].sort();
  const out = [];
  let current = null;
  for (const e of entries) {
    if (e.date !== current) {
      current = e.date;
      out.push(`<h3 class="day" id="day-${days.indexOf(e.date) + 1}"><span>Day ${days.indexOf(e.date) + 1}</span> ${fmtDate(e.date)}</h3>`);
    }
    out.push(renderEntry(e));
  }
  return out.join('\n      ');
}

const milestones = data.milestones
  .map(
    (m) => `<li class="ms ms-${m.status}">
        <span class="ms-dot" aria-hidden="true"></span>
        <span class="ms-id">${esc(m.id)}</span>
        <span class="ms-title">${esc(m.title)}</span>
        <span class="ms-status">${STATUS_LABEL[m.status] ?? esc(m.status)}</span>
        <span class="ms-detail">${inline(m.detail)}</span>
      </li>`,
  )
  .join('\n      ');

const workflow = data.workflow.map(([cmd, what]) => `<li><code>${esc(cmd)}</code><span>${inline(what)}</span></li>`).join('\n        ');
const openProposals = data.entries.filter((e) => e.type === 'proposal').length;
const updated = data.entries.map((e) => e.date).sort().at(-1);

const html = `<title>snakk build log</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a narrow lab-notebook column of dated entries, with the milestone track as a strip on top
   and the way-we-work card beside it on wide screens. Entry types are marked with the app's own blob gradients. */
:root {
  --ground: #f3f4f7;
  --sheet: #ffffff;
  --ink: #17181c;
  --ink-soft: #5b5e69;
  --rule: #dcdee5;
  --accent: #d2492a;
  --blob-milestone-a: #ff6b4a; --blob-milestone-b: #ffc152;
  --blob-decision-a: #3f6df2; --blob-decision-b: #8fdcff;
  --blob-proposal-a: #a64cf2; --blob-proposal-b: #ff8fd8;
  --blob-note-a: #12b08c; --blob-note-b: #c4f05a;
  --font-display: "Bricolage Grotesque", "Avenir Next", "Helvetica Neue", sans-serif;
  --font-body: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #121317; --sheet: #1b1c21; --ink: #ecebe6; --ink-soft: #a3a3ab; --rule: #2c2e36; --accent: #ff7a57;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --ground: #121317; --sheet: #1b1c21; --ink: #ecebe6; --ink-soft: #a3a3ab; --rule: #2c2e36; --accent: #ff7a57;
  color-scheme: dark;
}
body {
  background: var(--ground);
  color: var(--ink);
  font: 400 16px/1.6 var(--font-body);
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 40px 64px;
}
.wrap { max-width: 1080px; margin: 0 auto; display: grid; gap: 32px; }
h1, h2, h3 { font-family: var(--font-display); text-wrap: balance; margin: 0; }
.masthead { display: grid; gap: 10px; }
.masthead h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
.masthead h1 span { color: var(--ink-soft); font-weight: 500; }
.masthead p { margin: 0; max-width: 62ch; color: var(--ink-soft); font-size: 1.05rem; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 18px; font: 500 12px/1.4 var(--font-mono); color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.06em; }
.meta b { color: var(--accent); font-weight: 500; }

.track { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: 14px; overflow: hidden; }
.ms { background: var(--sheet); padding: 14px 14px 16px; display: grid; grid-template-columns: auto 1fr; grid-template-areas: "dot id" "title title" "status status" "detail detail"; gap: 4px 8px; align-content: start; min-width: 0; }
.ms-dot { grid-area: dot; width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--ink-soft); align-self: center; }
.ms-done .ms-dot { border: 0; background: radial-gradient(circle at 35% 30%, var(--blob-milestone-b), var(--blob-milestone-a)); }
.ms-partial .ms-dot { border-color: var(--blob-milestone-a); background: linear-gradient(90deg, var(--blob-milestone-a) 50%, transparent 50%); }
.ms-id { grid-area: id; font: 500 12px/1 var(--font-mono); color: var(--ink-soft); align-self: center; }
.ms-title { grid-area: title; font: 600 15px/1.3 var(--font-body); }
.ms-status { grid-area: status; font: 500 11px/1.4 var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); }
.ms-done .ms-status { color: var(--ink); }
.ms-detail { grid-area: detail; font-size: 13px; line-height: 1.5; color: var(--ink-soft); }

.columns { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 32px; align-items: start; }
@media (max-width: 860px) { .columns { grid-template-columns: minmax(0, 1fr); } .aside { order: -1; } }
.log { display: grid; gap: 20px; min-width: 0; }
.log > h2, .aside h2 { font: 500 12px/1 var(--font-mono); text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); }

.day { margin: 28px 0 -2px; padding-top: 14px; border-top: 1px solid var(--rule); font: 500 12px/1 var(--font-mono); letter-spacing: 0.06em; color: var(--ink-soft); display: flex; gap: 10px; align-items: baseline; }
.day span { font-size: 17px; font-weight: 600; color: var(--ink); text-transform: uppercase; letter-spacing: 0.08em; }
.entry { background: var(--sheet); border: 1px solid var(--rule); border-radius: 14px; padding: 22px 24px 20px; display: grid; gap: 12px; min-width: 0; }
.entry-proposal { border-color: color-mix(in srgb, var(--blob-proposal-a) 45%, var(--rule)); }
.entry-head { display: flex; align-items: center; gap: 10px; font: 500 12px/1 var(--font-mono); color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.06em; }
.entry-head time { margin-left: auto; text-transform: none; letter-spacing: 0; }
.orb { width: 18px; height: 18px; border-radius: 50%; flex: none; }
.orb-milestone { background: radial-gradient(circle at 35% 30%, var(--blob-milestone-b), var(--blob-milestone-a) 70%); }
.orb-decision { background: radial-gradient(circle at 35% 30%, var(--blob-decision-b), var(--blob-decision-a) 70%); }
.orb-proposal { background: radial-gradient(circle at 35% 30%, var(--blob-proposal-b), var(--blob-proposal-a) 70%); }
.orb-note { background: radial-gradient(circle at 35% 30%, var(--blob-note-b), var(--blob-note-a) 70%); }
.entry-proposal .type { color: var(--blob-proposal-a); }
.entry h3 { font-size: 1.4rem; font-weight: 700; letter-spacing: -0.015em; line-height: 1.2; }
.entry p { margin: 0; max-width: 68ch; }
.entry strong { font-weight: 600; }
.adr { margin: 0; display: grid; grid-template-columns: 116px minmax(0, 1fr); gap: 8px 16px; }
.adr dt { font: 500 12px/1.9 var(--font-mono); text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); }
.adr dd { margin: 0; }
.adr ul { margin: 0; padding-left: 1.1em; display: grid; gap: 4px; }
@media (max-width: 520px) { .adr { grid-template-columns: minmax(0, 1fr); gap: 2px; } .adr dd { margin-bottom: 8px; } .entry { padding: 18px 16px; } }
.metrics { border-collapse: collapse; width: 100%; font-size: 14px; }
.metrics th, .metrics td { text-align: left; padding: 8px 0; border-top: 1px solid var(--rule); vertical-align: top; }
.metrics th { font-weight: 400; color: var(--ink-soft); padding-right: 16px; }
.metrics td { font: 500 14px/1.5 var(--font-mono); font-variant-numeric: tabular-nums; }
figure { margin: 4px 0 0; display: grid; gap: 8px; }
figure img { width: 100%; height: auto; border-radius: 10px; border: 1px solid var(--rule); background: var(--ground); display: block; }
figcaption { font-size: 13px; color: var(--ink-soft); }
.diagram { overflow-x: auto; border: 1px solid var(--rule); border-radius: 10px; padding: 12px; }
.diagram pre { margin: 0; }
.comment { justify-self: start; font: 500 13px/1 var(--font-body); color: var(--ink); background: transparent; border: 1px solid var(--rule); border-radius: 999px; padding: 8px 14px; cursor: pointer; }
.comment:hover { border-color: var(--ink-soft); }
.comment:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.aside { display: grid; gap: 16px; position: sticky; top: calc(env(safe-area-inset-top, 0px) + 16px); min-width: 0; }
@media (max-width: 860px) { .aside { position: static; } }
.card { background: var(--sheet); border: 1px solid var(--rule); border-radius: 14px; padding: 18px; display: grid; gap: 12px; }
.card p { margin: 0; font-size: 14px; color: var(--ink-soft); }
.card ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.card li { display: grid; gap: 2px; font-size: 14px; }
.card code { font: 500 13px/1.4 var(--font-mono); color: var(--accent); }
.legend li { grid-template-columns: 18px 1fr; align-items: center; gap: 10px; }
</style>

<div class="wrap">
  <header class="masthead">
    <h1>snakk <span>build log</span></h1>
    <p>${inline(data.tagline)}</p>
    <div class="meta"><span>Updated ${fmtDate(updated)}</span><span>${data.entries.length} entries</span><span><b>${openProposals} open ${openProposals === 1 ? 'proposal' : 'proposals'}</b></span><span>Repo: ~/dev/snakk</span></div>
  </header>

  <ol class="track" aria-label="Milestones">
      ${milestones}
  </ol>

  <div class="columns">
    <main class="log">
      <h2>Entries, newest first</h2>
      ${renderDays(data.entries)}
    </main>
    <aside class="aside">
      <section class="card">
        <h2>How we work</h2>
        <p>Comment on any entry. In the terminal, these project skills drive the loop:</p>
        <ul>
        ${workflow}
        </ul>
      </section>
      <section class="card">
        <h2>Entry types</h2>
        <ul class="legend">
          <li><span class="orb orb-proposal"></span><span>Needs your call: an open question with a recommendation</span></li>
          <li><span class="orb orb-decision"></span><span>Decision: what we chose and why</span></li>
          <li><span class="orb orb-milestone"></span><span>Milestone: something that now works</span></li>
          <li><span class="orb orb-note"></span><span>Note: observations and test results</span></li>
        </ul>
      </section>
    </aside>
  </div>
</div>

<script>
(async () => {
  // "Comment on this" opens claude.ai's own comment composer on that entry. Hidden where commenting is unavailable.
  let comments = null;
  try { comments = window.claude ? await window.claude.use('comments') : null; } catch { comments = null; }
  if (!comments) return;
  for (const btn of document.querySelectorAll('button.comment')) {
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      const entry = document.getElementById(btn.dataset.entry);
      try {
        await comments.openComposer({ element: entry });
      } catch (err) {
        if (err && (err.code === 'unavailable' || err.code === 'not_granted')) {
          document.querySelectorAll('button.comment').forEach((b) => (b.hidden = true));
        }
      }
    });
  }
})();
</script>
`;

writeFileSync(join(here, 'index.html'), html);
console.log(`Wrote ${join(here, 'index.html')} (${data.entries.length} entries)`);
