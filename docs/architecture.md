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
| `airway.rs` | The airway as a lossy acoustic transmission line in the time domain: a pressure node per section (its air volume) and a flow branch between nodes (half a section's inertance on each side). Airflow and sound ride on the same variables. 44 oral sections, 30 nasal sections joined at the velopharyngeal port, yielding walls, and lip and nostril radiation into an area-dependent R‖L load. |
| `tract.rs` | Parametric area function from the articulators (continuous constriction positions, flat-topped closures). |
| `voice.rs` | Lungs, the vibrating glottis, turbulence sources, vibrato/jitter/shimmer/drift, resampling, room, output protection, and the score player. |
| `glottis.rs` | Liljencrants–Fant pulse shapes (kept for tests and reference displays). |
| `analysis.rs` | The modeled transfer function: drive the same airway with a volume-velocity impulse and take the FFT. Peaks are the exact resonances of the synthesized system. |
| `bin/trace.rs`, `bin/areas.rs`, `bin/probe.rs` | Development tools: per-millisecond engine readouts, area functions with formants, and parameter-script renders. |
| `bin/calibrate.rs` | Nelder–Mead fit of vowel articulations to adult-female mean F1–F3 (Hillenbrand et al. 1995), with priors that keep the portrait plausible. Writes `src/core/vowels.generated.json`. |

**Time stepping.** Leapfrog: branch flows at half steps from node pressures, then node pressures from flows (C·dp/dt = Σu − wall flow − dV/dt). Each branch update is implicit in its losses, with an exact quadratic for the kinetic term, so a constriction can be as narrow as it likes. The time step is 0.95 of a section's travel time. Sections are L/N long, so the internal rate is N·c/(0.95·L), about 90–150 kHz, and the tract length changes continuously without resizing arrays. An 8th-order Butterworth and cubic interpolation convert to the host rate. The node at the velopharyngeal port also holds the port's own air; otherwise three branches meeting there could break the stability bound when the port is wider than the oral section.

**Losses.** Viscous resistance per branch (Poiseuille). A Borda–Carnot loss where a jet leaves a narrowing: its direction comes from the sign of the drive, not the previous flow, which would switch the loss on and off as the flow reverses. A frequency-dependent wall loss acts on the flow above about 1.5 kHz and widens the upper formants to a few hundred Hz while F1 stays sharp. The nasal passages lose energy heavily (resonance bandwidths about 450 Hz), so nasal murmurs sit 10–13 dB below vowels, as in speech. Walls are mass–spring–dampers per unit area; they lower the resonance of a closed tract and carry the voice bar.

**Source.** The glottis is an orifice whose area opens and closes: a raised-cosine opening, then a closing that steepens toward contact for a pressed voice. Its resistance is Bernoulli plus slit viscosity plus inertance, driven by lung pressure minus the pressure above it. The flow pulse, its skew, source–tract interaction and devoicing behind a closure all follow from that. The folds vibrate only when adducted and when the pressure across them exceeds a phonation threshold of about 2.5 cmH₂O. Voiceless consonants pull the folds apart, and a small posterior gap never closes. Lung pressure ramps within each control period, because a stepped pressure would buzz at the control rate.

**Turbulence.** Each sample, the Reynolds number of the actual flow drives a dipole source ∝ Re² − Re_c² (critical ≈ 1800, saturating near 12 000), injected as a series pressure source. There are three sources:
- the jet about 1 cm downstream of the narrowest constriction;
- the incisors, when a coronal jet strikes them (sibilants), weighted by place so /s/ and /ʃ/ come out at similar levels;
- the glottis, where the slit's Reynolds number 2u/(ℓν) drives aspiration.

The cavity in front of each source sets the spectrum's peaks. Bursts are not generated separately: air compresses behind a closure and leaves when it opens. Articulators open at a limited rate (about 40 cm²/s plus 40 /s × area), which shapes the transient. A parameter jump installs the new shape at once without pumping air.

**Output stage.** Radiated sound is the rate of change of the air leaving the lips and nostrils, plus a little wall radiation. A slow leveler (−22 dBFS, 3:1) and a 2 ms look-ahead limiter (ceiling 0.8) follow, then the soft clipper.

**Display telemetry.** At control rate the engine also keeps the smoothed sound-pressure amplitude in every oral and nasal section (`engine_energy`), the mean airflow, the share of air leaving through the nose, and whether the tract is sealed. The glottal panel draws the last cycle of computed glottal airflow. The cutaway's lit airway, flow particles, seal marker and sound readout use only these values and the area function; nothing there is a canned animation, except the fold view, which runs the modeled pulse slowed 100× and says so.

**Real-time safety.** Render work is bounded per sample. Buffers and score storage (65,536 events) are allocated at construction. A non-finite or runaway sample resets the airway and filters and is counted in telemetry; the tests assert it never happens. Offline rendering runs at about 13× real time in Node on an Apple-silicon laptop.

**ABI.** Plain `extern "C"` functions over linear memory: `engine_init/set/jump/render`, output, parameter, area and state pointers, score staging/load/play/stop, `analyze` and `shape_from_params`. `src/core/engine.ts` wraps them and checks parameter-table parity at load.

## Planner (`src/core`)

- `text.ts`: normalization (numbers, punctuation → boundaries), a CMUdict-derived lexicon (front-coded, gzip, decoded lazily), original fallback letter-to-sound rules, ARPABET input and syllabification. Speech uses weak forms of function words inside a phrase ("of" [əv], "to" [tə], "for" [fɚ]); a phrase-final one keeps its strong form. Singing keeps full forms.
- `phonemes.ts`: ARPABET inventory plus `DX` (flap, used for intervocalic T/D). Vowel targets come from calibration; consonants constrain only the articulators they use.
- `planner.ts`: phones → timed segments (inherent durations with stress, cluster and phrase-final rules) → events on independent tiers. The tongue body follows a vowel-to-vowel trajectory with dorsal consonants superimposed. Vowel moves are quick (τ 12–24 ms) and start about four time constants ahead, so vowels reach their targets; tip, lips, dorsum, velum and glottis gestures are local. A voiceless fricative keeps the glottis open from just before its onset to 5 ms past its end, and a phrase-final consonant releases into silence: the folds come back together only once the breath has stopped. The velum lowers about 35 ms before a nasal. Intonation has declination, accents on stressed syllables, a final fall or a question rise. Singing aligns vowel onsets to note starts, places codas before the next note, glides pitch for legato and delays vibrato on long notes. It also returns lyric cues (consonant onset, vowel onset and release per sung syllable) for display. The `cartoon` song style adds fast pitch glides up into each note (a glide, not a jump: an instant f0 step clicks), slower slides on held syllables, fall-offs before rests, wider and faster vibrato, stronger accents, and scales the jaw, lip-opening and rounding targets up (closures stay closed).
- `project.ts`: the project document (voice, held shape, phrase, song) with validation shared by the UI and the renderer. The Python backend mirrors the structural checks using `runtime/catalog.json`.

## Desktop (`src/desktop.tsx`, `src/ui`)

- The plugin is one ESM file importing only `@hermes/plugin-sdk`, `react` and `react/jsx-runtime`. WASM, lexicon and worklet source are embedded. The worklet is loaded from a blob URL that is revoked after `addModule`.
- Audio starts only on a user gesture. A `BroadcastChannel` silences other windows when one starts sounding. Unmount, disable and reload close the AudioContext, disconnect nodes, release listeners and stop telemetry.
- The project is scoped to the focused conversation (stored id, then runtime id, then a scratch project). Writes check that the conversation hasn't changed. Edits save after a short debounce. Agent edits arrive as plugin events, are filtered by conversation, profile and client, highlight the changed controls and offer playback.
- `TOOL_MEDIA_RENDERER_AREA` draws this package's own tool output as a Voice Lab audio card. Its waveform comes from the plugin's `/peaks` route, which reads the rendered WAV.
- The portrait's lower face is bent, not cut: `src/ui/faceRig.ts` moves every point of the traced artwork with smooth weights. Points below the lip line rotate about the jaw hinge, with the weight easing off across the cheek, behind the jaw and down the neck. The lower lip follows its own lip-gap angle, so the lips can stay shut on b, p and m while the jaw is open. Rounding pushes both lips forward. The open mouth (cavity, upper teeth, tongue) is drawn between the warped lip lines. The weights are computed once; a frame costs about 0.6 ms.
- Stage mode (`src/ui/stage.tsx`) is a pure function of the song clock and the lyric cues: floating syllables, music notes, head bob and tilt, karaoke line. On stage the lips move more while singing.
- `scripts/render-video.mjs` + `video.html` (development only) render the engine offline in one pass, record the engine's telemetry at the middle of every video frame, step the portrait through those frames in headless Chromium and mux the screenshots with the same audio in ffmpeg. Air particles run on that fixed clock with a seeded generator, so videos are reproducible.
- Styling uses only Hermes theme tokens, so the portrait's ink follows the theme (light: black ink on paper; dark: the white-ink variant).

## Agent side (`__init__.py`, `voice_backend.py`, `tts.py`)

- Tools default to the active conversation (`HERMES_SESSION_ID`) and refuse other conversations. IDs are validated against path traversal. Projects are written atomically under `plugin-data/hermes-voice-lab/sessions/<id>/`.
- Rendering runs `node runtime/render.mjs` with a fixed argument list and a timeout, writes 48 kHz stereo WAVs under the conversation's `renders/` folder, and returns a standalone `MEDIA:` line.
- `tts.py` registers the opt-in `voice-lab` provider (`synthesize` → WAV; `stream` → 24 kHz PCM).
