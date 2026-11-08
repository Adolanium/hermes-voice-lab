# Architecture

```
            ┌──────────── Hermes Desktop (renderer) ────────────┐
 user ───▶  │ desktop/plugin.js  (React UI, portrait rig, scopes)│
            │   ├─ AudioWorklet ── engine.wasm  (live voice)     │
            │   ├─ main-thread engine.wasm (model analysis)      │
            │   └─ ctx.rest / plugin events ───────────┐         │
            └──────────────────────────────────────────┼─────────┘
                                                       ▼
            ┌──────────── Hermes gateway (Python) ─────────────────┐
 Hermes ──▶ │ __init__.py tools ─┐                                 │
 (LLM)      │ dashboard/plugin_api.py ─┤ voice_backend.py         │
            │ tts.py (voice-lab)  ─────┘   ├ per-conversation JSON │
            │                              └ node runtime/render.mjs ─▶ engine.wasm (offline)
            └──────────────────────────────────────────────────────┘
```

One engine (Rust → `runtime/voice_lab_engine.wasm`) and one planner (TypeScript, `src/core`) serve live playback, Desktop export and agent renders. The language model only sends structured values: parameters, text, notes. Planning, timing and samples are local.

## Engine (`engine/src`)

| Module | Role |
|---|---|
| `params.rs` | 24 parameters with ranges, defaults and response times. Critically damped second-order smoothing (exact solution). |
| `glottis.rs` | Liljencrants–Fant flow derivative shaped by Rd (Fant 1995 regressions). α and ε are solved once per period with fixed iteration counts. Injected as normalized flow. |
| `tract.rs` | Parametric area function from the articulators, plus a power-normalized Kelly–Lochbaum waveguide (44 oral sections, 30 nasal sections, three-port velum junction, aperture-dependent lip and nostril radiation). |
| `voice.rs` | Aerodynamics, noise sources, vibrato/jitter/shimmer/drift, resampling, room, output protection, and the score player. |
| `analysis.rs` | The modeled transfer function: drive the same waveguide with an impulse and take the FFT. Peaks are the exact resonances of the synthesized system. |
| `bin/trace.rs`, `bin/areas.rs`, `bin/probe.rs` | Development tools: per-millisecond engine readouts, area functions with formants, and parameter-script renders. |
| `bin/calibrate.rs` | Nelder–Mead fit of vowel articulations to adult-female mean F1–F3 (Hillenbrand et al. 1995), with priors that keep the portrait plausible. Writes `src/core/vowels.generated.json`. |

**Tract length.** Every tick a wave moves one section, so section length = c / f_internal. The internal clock is `f = N·c / L`, roughly 80–140 kHz. Changing L (size, lip protrusion) therefore changes the tract length continuously, without resizing arrays. An 8th-order Butterworth and cubic interpolation convert to the host rate.

**Why power-normalized junctions.** With pressure-wave junctions, a section that closes (a stop or nasal closure) can store large pressure that comes back out as a click when it reopens. Normalized waves (w = p·√A) make each junction a rotation that preserves energy while areas change, which removed those clicks.

**Aerodynamics.** The glottis and the narrowest supraglottal path (including the nose when the velum is open) act as two orifices in series. Intraoral pressure follows them with a short time constant. Turbulence ∝ max(0, A·ΔP − θ), saturating. It is injected just downstream of the constriction, or at the teeth for coronal sibilants with a band-limited spectrum. A release after built-up pressure produces a burst. Voicing amplitude follows the transglottal pressure drop, so voicing dies naturally during closures.

**Output stage.** The glottal source is scaled by 210/f0 so effort, not pitch, sets loudness. A slow leveler (−22 dBFS, 3:1) and a 2 ms look-ahead limiter (ceiling 0.8) follow, then the soft clipper. Junction coefficients glide every tick between control updates, so fast closures don't click.

**Display telemetry.** At control rate the engine also keeps the smoothed wave amplitude in every oral and nasal section (`engine_energy`), the mean airflow, the share of air leaving through the nose, and whether the tract is sealed. The cutaway's lit airway, flow particles, seal marker and sound readout use only these values and the area function; nothing there is a canned animation, except the fold view, which runs the modeled pulse slowed 100× and says so.

**Real-time safety.** Render work is bounded per sample. Buffers and score storage (65,536 events) are allocated at construction. Any non-finite sample resets the filters and is counted in telemetry; the tests assert it never happens.

**ABI.** Plain `extern "C"` functions over linear memory: `engine_init/set/jump/render`, output, parameter, area and state pointers, score staging/load/play/stop, `analyze` and `shape_from_params`. `src/core/engine.ts` wraps them and checks parameter-table parity at load.

## Planner (`src/core`)

- `text.ts`: normalization (numbers, punctuation → boundaries), a CMUdict-derived lexicon (front-coded, gzip, decoded lazily), original fallback letter-to-sound rules, ARPABET input and syllabification.
- `phonemes.ts`: ARPABET inventory plus `DX` (flap, used for intervocalic T/D). Vowel targets come from calibration; consonants constrain only the articulators they use.
- `planner.ts`: phones → timed segments (inherent durations with stress, cluster and phrase-final rules) → events on independent tiers. The tongue body follows a vowel-to-vowel trajectory with dorsal consonants superimposed; tip, lips, dorsum, velum and glottis gestures are local. Intonation has declination, accents on stressed syllables, a final fall or a question rise. Singing aligns vowel onsets to note starts, places codas before the next note, glides pitch for legato and delays vibrato on long notes.
- `project.ts`: the project document (voice, held shape, phrase, song) with validation shared by the UI and the renderer. The Python backend mirrors the structural checks using `runtime/catalog.json`.

## Desktop (`src/desktop.tsx`, `src/ui`)

- The plugin is one ESM file importing only `@hermes/plugin-sdk`, `react` and `react/jsx-runtime`. WASM, lexicon and worklet source are embedded. The worklet is loaded from a blob URL that is revoked after `addModule`.
- Audio starts only on a user gesture. A `BroadcastChannel` silences other windows when one starts sounding. Unmount, disable and reload close the AudioContext, disconnect nodes, release listeners and stop telemetry.
- The project is scoped to the focused conversation (stored id, then runtime id, then a scratch project). Writes check that the conversation hasn't changed. Edits save after a short debounce. Agent edits arrive as plugin events, are filtered by conversation, profile and client, highlight the changed controls and offer playback.
- `TOOL_MEDIA_RENDERER_AREA` draws this package's own tool output as a Voice Lab audio card. Its waveform comes from the plugin's `/peaks` route, which reads the rendered WAV.
- Styling uses only Hermes theme tokens, so the portrait's ink follows the theme (light: black ink on paper; dark: the white-ink variant).

## Agent side (`__init__.py`, `voice_backend.py`, `tts.py`)

- Tools default to the active conversation (`HERMES_SESSION_ID`) and refuse other conversations. IDs are validated against path traversal. Projects are written atomically under `plugin-data/hermes-voice-lab/sessions/<id>/`.
- Rendering runs `node runtime/render.mjs` with a fixed argument list and a timeout, writes 48 kHz stereo WAVs under the conversation's `renders/` folder, and returns a standalone `MEDIA:` line.
- `tts.py` registers the opt-in `voice-lab` provider (`synthesize` → WAV; `stream` → 24 kHz PCM).
