---
name: demo
description: Start snakk, drive it in Chrome (demo script, replay, or a synthetic microphone with real audio), take a screenshot and report what works. Use to verify any change to transcription, topics or the 3D scene, or when the user says "show me", "run it", or "screenshot".
---

# Demo

## Start

```bash
npm run dev            # web on :5173, API on :8787; the API starts whisper-server on :8178
curl -s localhost:8787/api/health
```

Health must show `stt.ok` and `topics.ok`. If the model is missing: `npm run models`.

## Drive it (chrome-devtools MCP)

- **Scripted talk**: open http://localhost:5173, click **Demo**. Runs the real categorizer on a fixed English talk (about 60 s).
- **Replay**: **Replay…** loads a saved session; recorded mode uses stored topics (no API), recategorize mode re-runs Claude.
- **Real microphone path without speaking**: reload the page with this `initScript`, then click **Record**. It feeds `web/public/fixtures/test-speech.wav` (Norwegian, Norwegian, English with pauses) through voice detection, Whisper and Claude:

```js
navigator.mediaDevices.getUserMedia = async () => {
  const ctx = new AudioContext();
  const audio = await ctx.decodeAudioData(await (await fetch('/fixtures/test-speech.wav')).arrayBuffer());
  const src = ctx.createBufferSource(); src.buffer = audio;
  const dest = ctx.createMediaStreamDestination(); src.connect(dest); src.start();
  return dest.stream;
};
```

New test audio: `say -v Nora "..." -o x.aiff && ffmpeg -i x.aiff -ar 16000 -ac 1 x.wav`, concatenated with 2 s silences.

- Press **d** for the debug drawer: topic tree, every categorizer call with latency, transcript with language and latency.
- Check the console for errors (a 404 for nothing else than an icon is a bug).

## Report

Screenshot, then attach it to the build log via `/buildlog` when it shows a milestone. Say what was exercised and what was not (a synthetic voice is not a real lecture).
