# Hermes Voice Lab

A vocal synthesizer for Hermes Desktop built on a physical model of the voice. A side-profile portrait of Nous Girl, with her headphones, is the instrument: drag her jaw, lips and tongue and the sound changes, because the drawing and the sound come from the same articulatory parameters. Hermes can play it too: ask for a breathier voice, a different vowel, a spoken line or a short song, and the controls move in front of you.

![Voice Lab in Hermes Desktop](docs/media/voice-lab-play.png)

Everything is synthesized locally by a Rust engine compiled to WebAssembly: a glottal source drives a simulated vocal tract. There are no recordings, no neural or cloud TTS and no network calls. The default voice is an original adult feminine character voice, clear, warm and slightly breathy. It is a fictional voice for the character and not an official Nous voice.

**Demo:** [Voice Lab in Hermes Agent Desktop](docs/media/hermes-demo.mp4) (86 s, 1080p). It shows the whole Hermes window. You ask the agent for a silly song. The agent writes one and hands it to Voice Lab. She sings it live, with a band that plays her melody. Then the physics: seal the tongue and the sound stops; open the nose and she hums. Last, a dive through her mouth into the full act. The agent turn was recorded with a scripted stand-in model, so the reply text is fixed. The tool calls, the plugin and the engine are real. Sources and rebuild steps are in [`demo/`](demo/README.md).

**Watch:** [Boop Bop, Live!](docs/media/boop-bop-song.mp4) (41 s, 1080p). She does a short lounge set: patter ("Hello, hello! Is this thing on?"), scat, a verse about her own tongue, lips, nose and jaw with the inside view open, a brag ("No samples. No auto tune. Just physics!"), a beatbox break and a bow. Sound and picture come from one offline engine run, frame by frame, so the mouth, the inside view and the floating words are in exact sync with the audio.

**Listen** (rendered by the shipped engine, 48 kHz mono): [phrase, Signature voice](docs/media/speech-signature.wav) · [song with lyrics](docs/media/song-signature.wav) · [Warm voice](docs/media/speech-warm.wav) · [Airy voice](docs/media/speech-airy.wav) · [vowel glide /ɑ i u o æ ɝ/](docs/media/vowels.wav)

| Speak | Sing | Dark theme |
|---|---|---|
| ![Speak mode](docs/media/voice-lab-speak.png) | ![Sing mode](docs/media/voice-lab-sing.png) | ![Dark theme](docs/media/voice-lab-dark.png) |

## What you can do

- **Play.** Hold a vowel, shape it on the portrait or the vowel pad, and play notes from the on-screen or computer keyboard (A–; keys, Z/X for octaves). Pitch, effort, tension (glottal pulse shape), breath, vibrato and humanize are independent of the tract shape: jaw, lips, rounding, tongue tip and back, velum (nasal), rhotic bunching, throat width and tract length.
- **Speak.** Type a short English phrase or ARPABET phonemes. The planner turns words into overlapping articulator gestures with stress, durations and intonation. A gesture score shows the planned trajectories, and the current phone is highlighted while it plays.
- **Sing.** Write lyrics and draw notes on a piano roll. Each note takes the next syllable. Onset consonants are placed before the beat so vowels land on it, and a lone `-` holds the previous vowel across notes. Long notes get delayed vibrato. **Cartoon** style makes her sing like an animated character: pitch scoops into every note, slides on held syllables, fall-offs at phrase ends, wide wobbly vibrato and an oversized jaw and lips. **Silly song** loads an original scat demo that works each part of the mouth in turn. With **Stage** on, sung syllables pop out of her mouth and float away, music notes puff out on held notes, her head bobs on the beat and lifts on high notes, and a karaoke line follows the song.
- **Watch it work.** Inside the cutaway, the airway lights up with the sound energy the engine computes in each section, and air particles drift from the vocal folds to the lips at the modeled airflow. Seal the airway with the tongue tip, the back of the tongue or the lips and the air stops at the seal, the sound in front of it dies, and the voice falls silent. Lower the velum and the air and sound leave through the nose instead. A readout names the sound being made (nearest vowel, or the sealed or turbulent place for consonants) next to lip, narrowest and nasal-port areas in cm². A top-down view of the vocal folds, slowed 100×, opens and closes with the modeled glottal pulse.
| Tongue tip sealed: the air stops at the seal | Velum lowered: air and sound leave through the nose |
  |---|---|
  | ![Sealed airway](docs/media/voice-lab-airway-sealed.png) | ![Nasal airway](docs/media/voice-lab-airway-nasal.png) |
- **See it.** The cutaway shows the modeled mouth, tongue, throat and nasal path. The airway panel draws the area function the engine is using, the spectrum overlays the measured output on the modeled tract resonances (F1–F4), and the waveform and glottal-pulse panels show the output and the LF pulse. Panels are labeled *measured* or *model*.
- **Keep it.** Projects save with each conversation. Voice presets save per plugin. Projects can be saved to and opened from a folder you grant, and WAV export (48 kHz stereo) uses the same engine.

## Ask Hermes

The agent tools take structured instructions. The engine does all timing and synthesis.

| Tool | Does |
|---|---|
| `voice_lab_get` | Current voice, shape, phrase and song, plus parameter ranges, presets and vowels |
| `voice_lab_set_voice` | Change the voice (e.g. `{"breath": 0.6, "tenseness": 0.3}`), apply a preset, hold a vowel (`"vowel": "UW"`), optionally render a preview |
| `voice_lab_perform` | Speak a phrase, or sing a melody (`"melody": "E4:0.5 G4:0.5 A4:1 r:0.5 C5:2"`, `"lyrics": "o-pen the light"`) and return a WAV |
| `voice_lab_render` | Render the project, or a variation with temporary overrides, to WAV |

Calls are scoped to the active conversation, so edits appear in that conversation's Voice Lab, where a toast offers to play them. Renders come back as normal Hermes media. Desktop shows them in a Voice Lab audio card with the rendered waveform:

![Voice Lab audio card in a chat](docs/media/voice-lab-chat-card.png)

In Hermes builds with Tool Search, these plugin tools are discovered through `tool_search`/`tool_call` like other plugin tools.

**Read-aloud (optional).** The plugin registers a `voice-lab` TTS provider. Set `tts.provider: voice-lab` in a profile's `config.yaml` to hear replies in the character voice; voices are the presets (`signature`, `warm`, `bright`, `airy`, `lyric`, `alto`). It is English only and clearly less natural than neural TTS, so it is opt-in.

## Install

1. Download `hermes-voice-lab-<version>.tar.gz` from Releases, or build it (below).
2. Extract `hermes-voice-lab/` into your profile's plugins folder (`$HERMES_HOME/plugins/`).
3. Enable the agent side with `hermes plugins enable hermes-voice-lab`, then restart the gateway so the plugin's routes mount.
4. In Hermes Desktop, open **Capabilities → Plugins**, enable **Voice Lab**, and open it from the sidebar or the command palette (**Open Voice Lab**).

You need neither Rust nor npm: the package ships the compiled WebAssembly engine, the desktop bundle and the Node renderer. Agent-side rendering uses Node 20+, which the Hermes runtime provides. Sound starts only after you press a play control.

## Build from source

```bash
npm ci
rustup target add wasm32-unknown-unknown    # Rust 1.98, pinned in rust-toolchain.toml
node scripts/build-engine.mjs              # engine → runtime/voice_lab_engine.wasm
node scripts/build.mjs                     # Node runtime + desktop/plugin.js
npm test && npm run test:engine && npm run typecheck
node scripts/package.mjs                   # release/hermes-voice-lab-<ver>.tar.gz
HERMES_HOME=/path/to/test-home node scripts/install-dev.mjs
```

`node scripts/render-video.mjs --out show.mp4` renders a 1920×1080 performance video of the lounge set (`src/core/show.ts`) (needs ffmpeg and a Playwright Chromium; development tool, not shipped). `npm run dev` starts a standalone browser preview of the instrument. It is a development aid only and does not prove Hermes compatibility. `npm run calibrate` refits the vowel targets (see `docs/architecture.md`). Offline render example:

```bash
node runtime/render.mjs --text "Good morning." --voice warm --output /tmp/hello.wav
```

## How it works

The airway is simulated as a lossy acoustic transmission line in the time domain: 44 oral sections and a 30-section nasal branch carry the airflow from the lungs and the sound together. The glottis is an orifice whose area opens and closes, so the flow pulse, source–tract interaction and devoicing behind a closure follow from the physics. Turbulence noise is driven by the Reynolds number of the actual flow, at the constriction, at the teeth for sibilants and at the glottis. Bursts happen because air compresses behind a closure and escapes when it opens. Yielding walls, frequency-dependent wall losses, lossy nasal passages and lip and nostril radiation set the bandwidths. Tract length is continuous, set by the time step. Articulators move with critically damped dynamics, so live playback, the Desktop export and agent renders all follow the same sample-accurate score. On a 30-sentence Whisper test the speech went from 49% to 31% word errors with this engine and the planner fixes that came with it. Details: [docs/architecture.md](docs/architecture.md). Test coverage and host verification: [docs/validation.md](docs/validation.md).

## Limits

- English only. Pronunciation comes from the CMU dictionary plus fallback letter-to-sound rules; unknown words are flagged as guessed. ARPABET input gives exact control.
- Speech is intelligible for many short phrases but sounds robotic. On an automatic proxy (ten fixed sentences transcribed by Whisper `base.en`), the word error rate is about 0.36–0.39: four sentences come back exactly or nearly so, while /s/–/ʃ/ sequences, some nasals and velars, and /ɑ/ vs /ʌ/ remain weak. This is not a human listening test; see `docs/validation.md`.
- A held sung note fades by about 5 dB over its first ~0.6 s as the output leveler settles.
- The area-function geometry is a compact original parametric model, not measured anatomy. The cutaway is a stylized view of the modeled articulators.
- Not yet implemented: MIDI input, beatboxing, other species, duets and 3D views.

See [NOTICE.md](NOTICE.md) for the dictionary license, character attribution and scientific sources.
