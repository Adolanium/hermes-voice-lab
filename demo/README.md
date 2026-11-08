# Demo film

Sources for [`docs/media/hermes-demo.mp4`](../docs/media/hermes-demo.mp4): the lounge act opens it, then Hermes Agent Desktop is shown whole: a request to the agent, the agent's song in Voice Lab, the physics, and a dive through her mouth into the full act.

- `timeline.ts`: exports the act's score (sections, notes, cues) as JSON.
- `music.py`: the band (upright bass, Rhodes, vibes doubling her melody, brushes) scored from that timeline.
- `build_audio.py`: mixes the soundtrack: the app takes' own audio, the act, and the band under both, timed by `film/film.json`.
- `film/`: the HyperFrames project (`index.html`, `compositions/`, `SPEC.md`, `REVIEW.md`).

## Rebuild

The media are not committed (see `.gitignore`).

1. Take recordings: two takes of Hermes Desktop with the plugin installed. Record the window at its real size with the app's zoom set so all of Voice Lab fits (67 % on a 1470 × 833 window). For each take, provide `agent|physics.mp4`, `-audio.webm` and `.json`, with marks in seconds and `audioStart`. Copy them into `film/assets/`.
2. `film/assets/act.mp4`: a copy of `docs/media/boop-bop-song.mp4`.
3. `film/assets/fonts/Collapse-Bold.woff2`: Hermes Desktop's wordmark face, from its build.
4. Score and voice:
   1. Bundle the score: `npx esbuild --bundle --platform=node --format=esm demo/timeline.ts --outfile=demo/out/timeline.mjs`.
   2. Write it out: `node demo/out/timeline.mjs > demo/out/timeline.json`.
   3. Extract the act's own audio: `ffmpeg -i docs/media/boop-bop-song.mp4 -vn -ar 48000 -ac 2 demo/out/act-voice.wav`.
5. Mix the soundtrack: `cd demo && python build_audio.py` (needs numpy, scipy, ffmpeg).
6. Render: `cd demo/film && npx hyperframes render -q delivery -o ../../docs/media/hermes-demo.mp4`.

The act's lounge-singer format was inspired by the demo of Jameson Hodge's [chimera-vocal-synth](https://github.com/jamesondh/chimera-vocal-synth); see [NOTICE.md](../NOTICE.md).

The agent turn in the recording used a scripted stand-in model on a local mock server, so the reply is fixed. The tool calls are real: the agent's Voice Lab tools, the plugin and its engine.
