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

## Second film: the instrument

Sources for the instrument film (`film2/`): a cold open on the act, then Hermes Agent Desktop: the agent writes a song and a beat into Voice Lab, she plays them, then the instrument by hand (grab the tongue, the vowel pad, the keyboard, held articulations, the body slider, the pads), and a dive into the act rendered with the cutaway open. See `film2/SPEC.md`.

1. Takes: four recordings of Hermes Desktop at its real window size and the app's zoom at 100 %: `agent` (the song request and the singing), `agent2` (the beat request and the beat, from the same chat), `play` (the instrument) and `beat` (the pads). For each, provide `<take>.mp4`, `<take>-audio.webm` and `<take>.json` (marks in seconds, with `audioStart`) in `film2/assets/`. The agent turns used a scripted stand-in model on a local mock server; the tool calls, the plugin and its engine are real.
2. The act: `node scripts/render-video.mjs --reveal 0,6 --out demo/film2/assets/act.mp4` (the lounge set with the cutaway open throughout).
3. Fonts: `film2/assets/fonts/Collapse-Bold.woff2`, as for the first film.
4. Score: `demo/out/timeline.json`, as for the first film (step 4.1–4.2).
5. Soundtrack: `cd demo && python build_audio2.py`.
6. Render: `cd demo/film2 && npx hyperframes render -q delivery -o ../../docs/media/voice-lab-instrument.mp4`.
