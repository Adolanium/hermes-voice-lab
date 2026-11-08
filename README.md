# Hermes Voice Lab

A vocal synthesizer for Hermes Desktop built on a physical model of the voice. A side-profile portrait of Nous Girl is the instrument: drag her jaw, lips and tongue and the sound changes, because the drawing and the sound come from the same articulatory parameters. Hermes can play it too: ask for a breathier voice, a different vowel, a spoken line or a short song, and the controls move in front of you.

![Voice Lab in Hermes Desktop](docs/media/voice-lab-play.png)

Everything is synthesized locally by a Rust engine compiled to WebAssembly: a glottal source drives a simulated vocal tract. There are no recordings, no neural or cloud TTS and no network calls. The default voice is an original adult feminine character voice, clear, warm and slightly breathy. It is a fictional voice for the character and not an official Nous voice.

**Listen** (rendered by the shipped engine, 48 kHz mono): [phrase, Signature voice](docs/media/speech-signature.wav) · [song with lyrics](docs/media/song-signature.wav) · [Warm voice](docs/media/speech-warm.wav) · [Airy voice](docs/media/speech-airy.wav) · [vowel glide /ɑ i u o æ ɝ/](docs/media/vowels.wav)

| Speak | Sing | Dark theme |
|---|---|---|
| ![Speak mode](docs/media/voice-lab-speak.png) | ![Sing mode](docs/media/voice-lab-sing.png) | ![Dark theme](docs/media/voice-lab-dark.png) |

## What you can do

- **Play.** Hold a vowel, shape it on the portrait or the vowel pad, and play notes from the on-screen or computer keyboard (A–; keys, Z/X for octaves). Pitch, effort, tension (glottal pulse shape), breath, vibrato and humanize are independent of the tract shape: jaw, lips, rounding, tongue tip and back, velum (nasal), rhotic bunching, throat width and tract length.
- **Speak.** Type a short English phrase or ARPABET phonemes. The planner turns words into overlapping articulator gestures with stress, durations and intonation. A gesture score shows the planned trajectories, and the current phone is highlighted while it plays.
- **Sing.** Write lyrics and draw notes on a piano roll. Each note takes the next syllable. Onset consonants are placed before the beat so vowels land on it, and a lone `-` holds the previous vowel across notes. Long notes get delayed vibrato.
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

`npm run dev` starts a standalone browser preview of the instrument. It is a development aid only and does not prove Hermes compatibility. `npm run calibrate` refits the vowel targets (see `docs/architecture.md`). Offline render example:

```bash
node runtime/render.mjs --text "Good morning." --voice warm --output /tmp/hello.wav
```

## How it works

A Liljencrants–Fant glottal source (with jitter, shimmer, drift, vibrato and breath noise) drives a 44-section power-normalized Kelly–Lochbaum waveguide with a nasal branch. Turbulence noise and stop bursts come from a simple aerodynamic model of pressure and flow through the constrictions. Tract length is continuous, set by the waveguide's internal clock and resampled to the host rate. Articulators move with critically damped dynamics, so live playback, the Desktop export and agent renders all follow the same sample-accurate score. Details: [docs/architecture.md](docs/architecture.md). Test coverage and host verification: [docs/validation.md](docs/validation.md).

## Limits

- English only. Pronunciation comes from the CMU dictionary plus fallback letter-to-sound rules; unknown words are flagged as guessed. ARPABET input gives exact control.
- Speech is intelligible for many short phrases but sounds robotic. On an automatic proxy (ten fixed sentences transcribed by Whisper `base.en`), the word error rate is about 0.36–0.39: four sentences come back exactly or nearly so, while /s/–/ʃ/ sequences, some nasals and velars, and /ɑ/ vs /ʌ/ remain weak. This is not a human listening test; see `docs/validation.md`.
- A held sung note fades by about 5 dB over its first ~0.6 s as the output leveler settles.
- The area-function geometry is a compact original parametric model, not measured anatomy. The cutaway is a stylized view of the modeled articulators.
- Not yet implemented: MIDI input, beatboxing, other species, duets and 3D views.

See [NOTICE.md](NOTICE.md) for the dictionary license, character attribution and scientific sources.
