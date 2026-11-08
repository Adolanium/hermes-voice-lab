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
- **Resonances**: a uniform tube resonates at odd quarter-wavelengths (within 3% for 15 cm). Calibrated vowels are within 10% (F1) and 13% (F2) of the Hillenbrand et al. (1995) adult-female means. Most are within 2–5%. Fitting with natural-looking articulations leaves F2 short for /ɑ/ (−12%), /æ/ (−9%) and /i/ (−7%). The nasal branch moves resonances. /i/ is high-front, /ɑ/ low-back and /u/ low-F2.
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

### Living cutaway (native, `research/validation/airway-alive.mjs`)

| Step | Readout | Lit beads in front of the airway (sum) | Moving particles |
|---|---|---|---|
| Hold /ɑ/ | ɑ, as in "father" | 28.0 | 28 |
| Drag the tongue tip up to seal | d, sealed behind the ridge, no air out | 6.2 | 7 (stopped at the seal) |
| Drag the velum down | n, air through the nose, nasal port 1.50 cm² | 26.2 (nasal path lit) | 28 |

Engine test `closure_stops_airflow_and_sound_in_front_and_nose_takes_over` pins the same behavior. Measured with `bin/probe.rs`, an open /ɑ/ is −19 dB; a tip, lip or dorsum seal with the nose shut is digital silence once voicing stops; the same tip seal with the velum open is −24 dB (nasal).

## Not verified

- The native WAV export save dialog (`captureGatewayFileDownload`) was not clicked through. The backend render behind it is the same code the tools exercise.
- Grant-folder project open/save via `ctx.files` was not exercised natively.
- No real LLM was used. Tool discovery and argument quality with a real model are untested.
- Windows and Linux hosts, remote gateways, and multiple simultaneous Desktop windows (the cross-window silence uses `BroadcastChannel` and is untested natively).

## Listening and intelligibility

The author could not listen to audio in this environment. Speech quality was judged from spectrograms, level measurements and an automatic proxy. Research tooling renders ten fixed sentences with `runtime/render.mjs`, transcribes them with a local Whisper `base.en` model, and computes the word error rate (WER). This measures machine intelligibility, not naturalness or human perception, and Whisper is noisy: identical audio has scored 0.376–0.431 across reruns. Decisions also used a larger set of 60 sentences × 2 seeds.

| Build | Mean WER (10 sentences) |
|---|---|
| First complete engine | 0.774 |
| After intelligibility work (closures, gesture precedence, VOT, bursts, sibilants, tempo, leveler) | 0.376 |
| Released (softer Signature source) | 0.36–0.39 across runs |

Released transcripts. Rows are from one run; the eighth sentence replaced an earlier benchmark wording, and the earlier rows above used the old one.

| WER | Sentence | Whisper heard |
|---|---|---|
| 0.11 | The quick brown fox jumps over the lazy dog. | The quick brown fox clumps over the lazy dog. |
| 0.29 | Please call me when you get home. | Please call me when you're back home. |
| 0.75 | She sells sea shells by the sea shore. | She sells, she sells, I'll say sure |
| 0.00 | What time is it now? | What time is it now? |
| 0.57 | I would like a cup of tea. | I would like to top out the |
| 0.12 | Open the window and let the light in. | Open the window and let the light in it. |
| 0.71 | Seven green birds sat on the fence. | Sell and drink their bread on the fence. |
| 0.38 | My voice is shaped by breath and math. | My life is shaped by breath of love. |
| 0.00 | Good morning, how are you today? | Good morning. How are you today? |
| 0.67 | We will meet at the old bridge at noon. | We will lay that little bridge up low. |

**Levels.** Speech renders at RMS ≈ 0.08–0.10. A C4–E4–G4–C5 sung test went from RMS 0.29 / peak 1.0 to RMS 0.10–0.12 / peak ≤ 0.67 once the pitch-compensated source, a slow leveler and a 2 ms look-ahead limiter (ceiling 0.8) were in place. Through the real tool registry, sung and spoken renders peak at 0.42–0.43.

**Voice character** (sustained /ɑ/, `research/tools/voice_metrics.py`, measured on the output):

| Preset | F0 (Hz) | H1–H2 (dB) | H1–A3 (dB) | HNR (dB) |
|---|---|---|---|---|
| Signature | 212 | 0.0 | 23.4 | 14.7 |
| Warm | 194 | 3.9 | 26.7 | 13.9 |
| Bright | 238 | −7.9 | 12.2 | 15.3 |
| Airy | 222 | 1.2 | 22.8 | 8.4 |
| Lyric | 331 | −12.6 | 13.3 | 16.4 |
| Alto | 176 | 5.2 | 28.3 | 14.2 |

The intelligibility work made the source firmer (Signature H1–H2 −4.8 dB). The released presets soften it again without hurting the WER proxy. Pitch and tract length set the perceived size independently of these source measures.
