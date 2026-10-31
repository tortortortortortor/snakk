# snakk

A live map of a lecture. Speak, and the topics you cover are drawn as you go: as floating blobs that keywords fly into (**Bubbles**), or written on a chalkboard with arrows for the path of the talk (**Chalkboard**).

- Speech is transcribed **on your Mac** with whisper.cpp (large-v3-turbo, Metal). Language is detected per utterance.
- At each pause, **Claude Sonnet 5.5** groups what you said into sections and sub-topics. It runs through your Claude Code login (`claude -p`) or an API key.
- One engine, several visualizations: switch in the top bar, with **v**, or `?viz=chalkboard`. Bubbles is React + react-three-fiber with custom blob shaders; Chalkboard is SVG.

## Run

```bash
brew install whisper-cpp        # provides whisper-server
npm install
npm run models                  # ~550 MB, once
cp .env.example .env            # optional: ANTHROPIC_API_KEY, model, languages
npm run dev                     # open http://localhost:5173
```

Press **Record** and talk, or **Demo** to watch a scripted talk. **Type** lets you add sentences by keyboard. **Save** downloads the session and **Replay…** plays one back. Press **d** for the debug drawer and **p** for presenter mode.

Without Claude Code or an API key, the app falls back to an offline keyword heuristic.

Progress and decisions: see the build log linked in `CLAUDE.md`.
