---
name: buildlog
description: Add an entry to the snakk build log (docs/buildlog/entries.json), rebuild the HTML page and republish it to the same artifact URL. Use after a milestone, a decision, a test result worth keeping, or when the user says "log this" or "update the build log".
---

# Build log

The build log is the shared record between Tor and Claude. Source of truth: `docs/buildlog/entries.json`. Rendered page: `docs/buildlog/index.html`. Published artifact: https://claude.ai/artifact/Jisf8BAmw3bEW4W5ET9uCD

## Steps

1. Read `docs/buildlog/entries.json`.
2. Add the new entry at the **top** of `entries` (newest first). Shape:
   - every entry: `id` (`YYYY-MM-DD-slug`, unique), `date` (`YYYY-MM-DD`, today), `type`, `title`
   - `type` is one of `milestone`, `decision`, `proposal`, `note`
   - prose goes in `body`: an array of paragraphs; `**bold**` is the only markup
   - decisions use `context`, `choice`, optional `alternatives` (array), `consequences`
   - optional: `metrics` (array of `[label, value]`), `image` (`{src: "img/<file>.jpg", alt}`), `diagram` (mermaid source)
3. Update `milestones[].status` (`done` | `partial` | `todo`) and `detail` if the work moved a milestone.
4. If a proposal was answered, remove or rewrite that paragraph so open questions stay accurate.
5. For screenshots: save to `docs/buildlog/img/`, convert with `sips -s format jpeg -s formatOptions 78 -Z 1600 in.png --out out.jpg`.
6. `npm run buildlog`.
7. Republish with the Artifact tool: `file_path: docs/buildlog/index.html`, `url` set to the artifact above (or the same file path within the session that published it). Pass every image under `img/` in `files` that is new since the last publish. Omit `capabilities` and `icon` so they are kept.
8. Read comments with ArtifactComments (`action: "read"`) and mention any new ones to Tor.

## Writing

Write for Tor reading later: plain sentences, what changed, what was verified and how, what is still open. Numbers go in `metrics`, not prose. Never claim something works that was not run.
