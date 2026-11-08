# Validation

Tested on 2026-11-08 on macOS 27.2 (arm64). Hermes Desktop was the official app built from `NousResearch/hermes-agent` at `ee6db222660c84e4ba2cf158108f0e6fed9afe34` (Desktop v0.23.0, Electron 44). Desktop launched its own gateway from the machine's published backend checkout (revision `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`) even with `HERMES_DESKTOP_HERMES_ROOT` set. Plugin validation and registry checks ran against the pinned `ee6db22` source. All testing used a disposable `HERMES_HOME` and Electron user-data folder. The live Hermes configuration and installed plugins were not modified.

## Automated

| Suite | Command | Result |
|---|---|---|
| Rust engine (14 tests) | `npm run test:engine` | pass |
| Node core (14 tests) | `npm test` | pass |
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
- **Voice qualities**: on a held /ɑ/ at 220 Hz, falsetto raises H1−H2 by more than 8 dB, fry and growl put a subharmonic within 15 and 20 dB of H1 (a modal voice has none), twang raises the 2.5–4 kHz harmonics by more than 6 dB, and every output stays bounded. The yodel style flips the register up on the high notes and back on the low ones.
- **Sung consonants**: with notes nearly touching at 120 bpm, no sung consonant is shorter than 45 ms (the planner used to squeeze onsets into the gap between notes, down to 14 ms), vowels still land on the beat, segments stay ordered and cues keep onset ≤ vowel < release.
- **Cartoon singing**: one lyric cue per sung syllable (holds extend the previous cue, punctuation kept for display), cues in order with onset ≤ vowel < release, scoops add pitch events, the jaw opens wider on average, invalid styles are rejected, and the silly song renders finite with peak ≤ 0.81 (an earlier version jumped f0 instantly at each scoop and produced a 0.95 click; the test now guards it).
- **I/O**: WAV headers and clipping are correct. The Node CLI renders, reports metadata and rejects unknown presets.

## Installed host (native Hermes Desktop)

- The plugin folder (`plugin/`) installed into the isolated home. Desktop discovered the desktop half, mounted the Voice Lab route, sidebar entry and palette command, and the Voice Lab settings page.
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

### Airway engine in the installed host (2026-11-08)

Installed into the isolated test home, first with `install-dev.mjs`, later with `hermes plugins install` from Git (`…#plugin`); installed files byte-identical to `plugin/`.
- **Inside view:** open /ɑ/ → lit 26.2, 28 particles; tip sealed → "d", lit 6.6, 14 particles; velum down → "n", air through the nose.
- **Lifecycle:** one running AudioContext; reloads and navigation close old ones; presets persist.
- **Live Speak and the silly song (cartoon, Stage on):** audible 84% and 95% of the sampled window, peaks 0.32 and 0.45, no page errors, floating words in time.
- **Export WAV** through the backend: the song render transcribes clearly.
- **Engine cost** in the host's V8 at 128-frame blocks: about 5% of one core.
- **Agent tools** (registry, `validate-tools-v2.py`): get, set_voice, vowel preview, speak, sing and render variation wrote 48 kHz WAVs; bad input was refused.
- **Read-aloud provider** (`validate-tts.py`): 48 kHz file, 24 kHz PCM stream.
- **Transient sweep** (30 sentences × 4 voices): no resets; default and breathy voices peak ≤ 0.60.

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

The author could not listen to audio in this environment. Speech quality was judged from spectrograms, level and spectrum measurements, and an automatic proxy: research tooling renders fixed sentences with `plugin/runtime/render.mjs`, transcribes them with a local Whisper model (greedy decoding), and computes the word error rate (WER). A sentence's errors are capped at its word count, so one hallucinated run-on can't dominate. This measures machine intelligibility, not naturalness or human perception. Run to run, it varies by about ±2 points.

The judge set has 30 sentences: the 10 below, 10 Harvard sentences (IEEE 1969), and 10 original semantically unpredictable sentences dense in sibilants, affricates, nasals and stops.

| Build | 30 sentences, small.en | 10 sentences below, base.en |
|---|---|---|
| v0.2 (Kelly–Lochbaum waveguide, LF flow source) | 49.1% | 38.5% |
| Airway transmission line, area-driven glottis, Reynolds-number turbulence | 48.7% | |
| + vowel targets reached (quick vowel moves) | 47.3% | |
| + glottis open through voiceless fricatives | 44.2% | |
| + final consonants release into silence | 43.4% | |
| + weak forms of function words | 39.8% | |
| + lossy nasal passages (murmur 10–13 dB below vowels) | 29.6% | 10.4% |
| + breathiness from the glottal gap, sibilant balance | 31.4% | 12.4% |
| + no hiss surges at /s/→/l/ and /s/→/tʃ/ (released) | **31–35% across runs** | **10.4%** |

Sung diction is judged the same way. The 30 judge sentences are sung one syllable per eighth note at 120 bpm, on a gentle tune near her speaking pitch (A3–E4), with the last syllable held. Each sentence is transcribed alone (`research/tools/sung/sung_wer.py`, Whisper small.en):

| Build | Spoken | Sung, natural | Sung, cartoon |
|---|---|---|---|
| Before | 34.4% | 79.3% | 78.6% |
| Onset consonants take time from the previous vowel; phrase-initial onsets start in the silence; sung consonants near their spoken length | | 63.9% | 63.1% |
| + firmer singing voice (more tension and effort, half the breath), pitch moves during the onset consonants, shorter glides on short notes, a breath at phrase-final punctuation | | **61.3%** | |

Singing the same sentences with each note placed where the vowel falls in speech (one pitch) gives 41.5%. The singing path itself is close to speech; most of the remaining loss comes from setting every syllable to an equal note. A reference physical-modeling synthesizer sung through the same test scored 52.0%.

Short sentences now come through ("Please call me when you get home", "What time is it now?", "I would like a cup of tea"). Dense consonant clusters at word ends ("box", "planks", "chopped") and the unpredictable sentences remain weak. Singing stays well behind speech; Whisper is also a harsher judge of singing than of speech. Weak forms of function words in songs were tried and made no difference (64.8%), so sung function words keep their full vowels.

What each step fixed:
- **Airway.** The old engine was buzzy and muffled at once: F2 and F3 sat 10–15 dB below natural values, while 4–8 kHz carried about 10 dB too much. In the new engine a held /ɑ/ has F2 −6 dB and F3 −29 dB relative to F1, against about −6 and −26 in natural female speech. The airway alone did not change the score, but every later step built on it.
- **Fricative levels re vowel (released).** s −7.4, ʃ −6.0, tʃ −5.3, z −11, h −10.6, v −19, f −21, θ −22 dB, with peaks at 5.9 kHz (s) and 2.8 kHz (ʃ).
- **Nasals.** In v0.2 the nasal murmur was as loud as /l/, so "nine" was heard as "line" and "noon" as "loom".

Current transcripts of the 10 sentences (base.en):

| WER | Sentence | Whisper heard |
|---|---|---|
| 0.00 | The quick brown fox jumps over the lazy dog. | The quick brown fox jumps over the lazy dog. |
| 0.14 | Please call me when you get home. | Please problem me when you get home. |
| 0.50 | She sells sea shells by the sea shore. | She settles seashells by the sea shower. |
| 0.00 | What time is it now? | What time is it now? |
| 0.00 | I would like a cup of tea. | I would like a cup of tea. |
| 0.00 | Open the window and let the light in. | Open the window and let the light in. |
| 0.14 | Seven green birds sat on the fence. | Seven green birds sit on the fence. |
| 0.25 | My voice is shaped by breath and math. | My voice is shaped by breath of mess. |
| 0.00 | Good morning, how are you today? | Good morning. How are you today? |
| 0.00 | We will meet at the old bridge at noon. | We will meet at the old bridge at noon. |

**Levels.** Speech renders at RMS ≈ 0.08–0.10. A C4–E4–G4–C5 sung test went from RMS 0.29 / peak 1.0 to RMS 0.10–0.12 / peak ≤ 0.67 once the pitch-compensated source, a slow leveler and a 2 ms look-ahead limiter (ceiling 0.8) were in place. Through the real tool registry, sung and spoken renders peak at 0.42–0.43.

**Voice character** (sustained /ɑ/, `research/tools/voice_metrics.py`, measured on the output):

| Preset | F0 (Hz) | H1–H2 (dB) | H1–A3 (dB) | HNR (dB) |
|---|---|---|---|---|
| Signature | 212 | 3.4 | 28.2 | 15.0 |
| Warm | 194 | 5.0 | 31.4 | 14.6 |
| Bright | 238 | −0.2 | 25.6 | 15.8 |
| Airy | 222 | 6.5 | 40.6 | 9.9 |
| Lyric | 329 | −5.4 | 18.9 | 16.5 |
| Alto | 176 | 3.8 | 28.3 | 14.5 |

Measured on the airway engine. The glottal flow now comes out of the interaction of an area-driven glottis with the tract, so H1–H2 and tilt follow the vowel and the preset. Pitch and tract length set the perceived size independently of these source measures.
