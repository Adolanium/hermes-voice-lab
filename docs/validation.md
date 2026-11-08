# Validation

Tested on 2026-11-08 on macOS 27.2 (arm64). Hermes Desktop was the official app built from `NousResearch/hermes-agent` at `ee6db222660c84e4ba2cf158108f0e6fed9afe34` (Desktop v0.23.0, Electron 44). Desktop launched its own gateway from the machine's published backend checkout (revision `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`) even with `HERMES_DESKTOP_HERMES_ROOT` set. Plugin validation and registry checks ran against the pinned `ee6db22` source. All testing used a disposable `HERMES_HOME` and Electron user-data folder. The live Hermes configuration and installed plugins were not modified.

## Automated

| Suite | Command | Result |
|---|---|---|
| Rust engine (13 tests) | `npm run test:engine` | pass |
| Node core (13 tests) | `npm test` | pass |
| Types | `npm run typecheck` | pass |
| Hermes manifest/security/desktop-surface lint | `hermes plugins validate <installed path>` | pass |

What the tests establish:

- **Stability**: random sweeps of every parameter, including closures and extreme sizes, at 8, 22.05, 44.1, 48, 96 and 192 kHz stay finite and within ±1 with no non-finite recoveries. Planned speech renders cleanly at 8–96 kHz.
- **Live = offline**: rendering a score in 128-frame worklet-sized blocks is sample-identical to the 1024-frame offline renderer. Block size never changes the output (Rust test with 128 vs 1000).
- **Timing**: score events land on their exact frame; a 0.25 s gate event starts at frame 12000 at 48 kHz.
- **Pitch**: sustained /ɑ/, /i/ and /u/ at 196, 262 and 440 Hz measure within 10 cents (autocorrelation), so pitch is independent of vowel.
- **Resonances**: a uniform tube resonates at odd quarter-wavelengths (within 3% for 15 cm). Calibrated vowels sit within 10% of the Hillenbrand et al. (1995) adult-female F1/F2 means; most are within 2–5%. The nasal branch moves resonances. /i/ is high-front, /ɑ/ low-back and /u/ low-F2.
- **Aerodynamics**: a lip closure builds intraoral pressure and its release produces a burst. Gate release decays to silence.
- **Planner**: events are ordered and in range. Voiceless fricatives devoice. Sung vowels start on note onsets (±20 ms) and melismas extend the vowel.
- **I/O**: WAV headers and clipping are correct. The Node CLI renders, reports metadata and rejects unknown presets.

## Installed host (native Hermes Desktop)

- The packaged plugin (`release/hermes-voice-lab/`) installed into the isolated home. Desktop discovered the desktop half, mounted the Voice Lab route, sidebar entry and palette command, and the Voice Lab settings page.
- **Audio**: Start audio created a 48 kHz AudioContext running the embedded-WASM worklet. Hold/Sustain, keyboard notes (key down marks the key, key up releases it), Speak and Sing played with live telemetry driving the portrait, airway, spectrum, waveform and glottal displays.
- **Lifecycle**: with AudioContext construction instrumented, three hot reloads while sounding each closed the previous context (`closed, closed, closed, running`), and navigating away closed the last (`closed ×4`). Disabling the plugin in Capabilities → Plugins removed its sidebar entry; re-enabling restored it.
- **Persistence**: a saved voice preset survived a plugin reload. Projects persist per conversation in `plugin-data/hermes-voice-lab/sessions/<conversation>/projects/main.json`.
- **Agent turns** (a scripted local OpenAI-compatible endpoint stood in for the model, so no real model and no credentials were used): Hermes discovered the plugin tools through Tool Search and invoked them with `tool_call`.
  - "Make the voice breathier" → `voice_lab_set_voice` changed breath to 62% and tension to 30% for that conversation; Voice Lab for that conversation showed the new values.
  - "Now sing something for me" with Voice Lab open → `voice_lab_perform` switched the view to Sing, loaded the melody with syllables on the notes, and showed "Hermes updated song, mode · Sing it".
  - The rendered WAV reached the transcript through `MEDIA:`. The package's tool-media renderer drew it as a Voice Lab card; its waveform comes from the plugin's `/peaks` route, and playback started.
- **Registry-level tools** (`validate-tools-v2.py`): get, set_voice (patch, vowel + preview render), perform (speak, sing), and render (variation) all wrote 48 kHz stereo WAVs inside the conversation's folder. Out-of-range values, unknown parameters and a different conversation's ID were refused.
- **Read-aloud provider**: Hermes' TTS registry returned `voice-lab`. `synthesize()` asked for `.mp3` and correctly produced WAV; `stream()` returned 24 kHz PCM.
- **Layout**: verified at 1440 px and 520 px wide (stacked layout), and in light and dark themes (the dark theme was checked in the standalone preview; native used the default light theme).

## Not verified

- The native WAV export save dialog (`captureGatewayFileDownload`) was not clicked through. The backend render behind it is the same code the tools exercise.
- Grant-folder project open/save via `ctx.files` was not exercised natively.
- No real LLM was used. Tool discovery and argument quality with a real model are untested.
- Windows and Linux hosts, remote gateways, and multiple simultaneous Desktop windows (the cross-window silence uses `BroadcastChannel` and is untested natively).

## Listening and intelligibility

The author could not listen to audio in this environment. Speech quality was judged by spectrograms, level measurements and an automatic proxy: research tooling renders ten fixed sentences with `runtime/render.mjs` and transcribes them with a local Whisper `base.en` model to compute word error rate. That measures machine intelligibility, not naturalness or human perception. Results are in the next section.
