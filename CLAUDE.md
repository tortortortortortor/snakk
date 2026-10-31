# snakk

Live lecture visualizer. The microphone is transcribed locally, Claude groups what is said into topics at each pause, and a visualization draws the topics. One engine, several ways to draw it: **bubbles** (Blobmixer-style 3D blobs, react-three-fiber) and **chalkboard** (2D SVG board in chalk, arrows for the path of the talk). Pick with `?viz=` or the switcher (V).

Build log (shared with Tor, comments enabled): https://claude.ai/artifact/Jisf8BAmw3bEW4W5ET9uCD

## Commands

```bash
npm run dev        # Vite :5173 + API :8787; the API spawns whisper-server :8178
npm test           # vitest: reducer, topic engine, layout, wav, languages, fixture replays
npm run typecheck
npm run models     # download a whisper.cpp model to ~/.cache/snakk/models (default large-v3-turbo-q5_0)
npm run buildlog   # render docs/buildlog/entries.json -> docs/buildlog/index.html
npm run capture -- <jobs.json>   # replay a session in headless Chrome: stills, clip, trail per job -> captures/ (needs npm run dev)
```

## Layout

- `server/` Hono API. `/api/transcribe` (WAV in, text + language out), `/api/topics` (categorize), `/api/health`.
  - `engines/` speech engines behind `TranscribeEngine` (whisper.cpp default, WhisperKit adapter).
  - `claude-cli.ts` categorizer via `claude -p` (no tools/settings/MCP, JSON schema). `topics.ts` API + offline providers, prompt in `prompts/categorize.md`.
- `shared/topics.ts` zod schema for topic ops; shared by server and client.
- `src/engine/` everything that is not drawing. Public surface: `src/engine/index.ts` (`useSnakk`, `talkView`, `sectionHops`, types).
  - `transcript/` `TranscriptSource` + `LocalVadWhisperSource` (Silero VAD in browser, interim + final).
  - `topics/` `TopicEngine` (when to call Claude) and the pure `applyTopicOps` reducer (guardrails, keyword dedupe, `trail` of where the talk went).
  - `session/controller.ts` wires sources, engine, store and recorder. Replay and typed input go through the same entry points.
  - `store.ts` zustand store; `selectors.ts` derived views every visualization uses.
- `src/visuals/` one folder per visualization, registered in `registry.ts` against the `Visualization` contract in `types.ts`. Lazy-loaded; a view reads the engine and only writes `landKeyword` (if `animatesKeywords`; otherwise the shell lands keywords).
  - `bubbles/` `SectionGroup` ray-marches each section as one surface (smooth-union SDF in `sectionShader.ts`, keywords from `keywordAtlas.ts`); layout, simulation, and the `?look=` motion options in `look.ts` (`DEFAULT_LOOK` = Tor's picks). Build the ShaderMaterial imperatively: JSX `uniforms` props get copied and stop updating.
  - `chalkboard/` SVG board: `board.ts` pure layout (fixed serpentine grid, nothing written ever moves), `chalk.ts` hand-drawn paths, one SVG chalk filter.
- `src/ui/` the shell around any visualization: top bar with the view switcher, captions, controls, debug drawer.
- `src/architecture.test.ts` enforces the boundaries: the engine imports no rendering code; visuals reach the engine only via its index and never import each other.
- `fixtures/sessions/` recorded sessions; every file is replayed by `src/engine/topics/fixtures.test.ts`.
- `scripts/capture/` headless-Chrome capture of any view at any lecture second (see `jobs.example.json`). Output in `captures/` (git-ignored).

### Adding a visualization

1. `src/visuals/<name>/index.ts` default-exports a full-screen component that reads `useSnakk` / `talkView` / `sectionHops` from `../../engine`.
2. Register it in `src/visuals/registry.ts` (set `animatesKeywords`).
3. Capture it next to the others with `npm run capture` and log it.

## Conventions

- Provider order for topics: `TOPIC_PROVIDER=auto` -> Anthropic API if a key is set, else `claude -p`, else offline. Default model `claude-sonnet-5-5` (Tor's choice).
- Transcription stays local. Do not add cloud STT without asking.
- `three` is pinned to ~0.186 until `@react-three/postprocessing` supports newer.
- Keep the reducer pure and tested; new guardrails get a test.
- When categorizer output changes shape, record a new session (Save button) into `fixtures/sessions/`.

## Working with Tor

- Every milestone, decision and real test result gets a build-log entry (`/buildlog`) before the work is called done.
- Open questions go through `/propose` with a recommendation. Read his artifact comments with `/feedback` at the start of a session.
- Verify visual changes in Chrome with `/demo` and attach a screenshot.
