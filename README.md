# Hermes Voice Lab

A local vocal instrument for Hermes Desktop. A Rust pressure-wave tube model produces the sound. The same WebAssembly engine runs inside an AudioWorklet for playback and Node for WAV rendering. No cloud TTS, recorded voice, GPU, or neural model is used.

This is an early instrument with an original feminine synthetic voice target. Voice quality and speech intelligibility still need listening evaluation. It is not an official Nous voice.

## Install

Use the release archive from `npm run package`. It includes the compiled desktop module and WASM; users do not need Rust or npm. Node 22 or later must be available on the gateway machine for agent-side WAV rendering.

Extract the archive's `hermes-voice-lab` folder into your chosen Hermes profile's `plugins` directory. Enable the agent plugin using Hermes' plugin controls and enable Voice Lab under Desktop **Capabilities → Plugins**. Open **Voice Lab** from the sidebar or command palette. Desktop and gateway must both have the unified package if they run on different machines. No sound starts until a user presses a playback control.

For an isolated development installation, use a separate `HERMES_HOME`, enable the plugin there, and launch Desktop with that same home. Keep your normal profile separate. The development host revision and actual test coverage are listed in `docs/validation.md`.

## Instrument

- Drag the portrait's articulation handles or use the labeled tongue, jaw, and lip controls. The cutaway is a stylized display of modeled articulation, not medical anatomy.
- Choose a vowel, adjust pitch independently of the tract shape, and change breath or vibrato.
- Play keyboard notes or the note sequence. Timing is scheduled by sample frame inside the audio processor.
- Save and load a project. Hermes projects are scoped to the active conversation; standalone preview patches are downloaded and imported as JSON files.
- Export a mono 16-bit PCM WAV rendered by the same engine.
- Enter a short phrase from the supported lexicon or explicit phoneme tokens. Unknown words are reported. This is experimental gesture synthesis with no general grapheme-to-phoneme model or intelligibility guarantee.

The avatar interprets Nous Girl with new SVG paths. Its mouth responds to articulation. Waveform and spectrum displays use the actual output analyser. See `NOTICE.md` for character attribution and scientific sources.

## Ask Hermes

`voice_lab_patch` updates a project for the active session. Supply `session_id`, `project_id` such as `main`, and a `patch`, for example `{"breath":0.3,"pitch":220}`. The tool can also accept a complete project with timed events. `voice_lab_render` renders the saved project and returns a standard `MEDIA:` WAV attachment. Desktop receives scoped update events; playback remains user initiated.

A project uses this shape:

```json
{"version":1,"name":"Warm vowel","patch":{"pitch":205,"breath":0.16},"events":[{"time":0,"duration":0.8,"params":{"tongueX":0.58,"jaw":0.44}},{"time":0.8,"duration":0.8,"params":{"pitch":230,"lip":0.2}}]}
```

Parameters are `tongueX`, `tongueY`, `jaw`, `lip`, `breath`, `vibrato`, `gain`, `gate`, `voicing`, `frication`, and `nasal`, all 0–1. `pitch` is 80–400 Hz. Geometry controls alter a synthetic tract area function, not a captured person's anatomy. Source pulse shape, tract length, damping, radiation and breath noise jointly define the character.

## Build and test

```sh
npm ci
# Rust 1.98.0 is pinned for reproducible engine builds.
rustup target add wasm32-unknown-unknown
node scripts/build-engine.mjs
npm run build
npm test
npm run typecheck
npm run dev
npm run package
```

The build embeds the compiled WASM and worklet source in `desktop/plugin.js`, leaving only supported Hermes SDK and React imports. `npm run dev` is a standalone development preview, not proof of installed-host compatibility.

Render a project without a browser:

```sh
node scripts/render.mjs --project /absolute/project.json --output /absolute/voice.wav
```

## Current limits

The tube geometry is an intentionally small acoustic model. English articulation is a restricted original lexicon and a subset of ARPABET-style tokens without stress digits. It does not model all consonants or detailed coarticulation. The default voice has not been validated as natural or intelligible by listeners. Read-aloud/TTS-provider registration is deferred until that quality threshold is met and the current provider extension API is verified. Duets, beatboxing, animal voices, and 3D rendering are not implemented.

See `docs/architecture.md`, `docs/validation.md`, and `NOTICE.md` for details.
