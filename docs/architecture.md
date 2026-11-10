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

Everything that ships lives in `plugin/`; paths below are relative to it. One engine (Rust → `runtime/voice_lab_engine.wasm`) and one planner (TypeScript, `src/core`) serve live playback, Desktop export and agent renders. The language model only sends structured values: parameters, text, notes. Planning, timing and samples are local.

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

**Losses.** Viscous resistance per branch (Poiseuille). A Borda–Carnot loss where a jet leaves a narrowing: its direction comes from the sign of the drive, not the previous flow, which would switch the loss on and off as the flow reverses. A frequency-dependent wall loss acts on the flow above about 1.5 kHz and widens the upper formants to a few hundred Hz while F1 stays sharp. The nasal passages are narrow, folded slits, and their loss grows with frequency: the low murmur near 250 Hz rings with about 130 Hz of bandwidth and carries a nasal's loudness, while everything above 600 Hz is damped 700 Hz wide. (One flat 450 Hz left the murmur 6 dB quieter than real speakers'; a flat 250 Hz let the upper resonances through, and /n/ was heard as /l/.) Walls are mass–spring–dampers per unit area; they lower the resonance of a closed tract.

**Walls that give way.** Behind the surface layer sits deep tissue (cheeks, pharynx walls, the neck around the larynx): 4.3 g/cm², resonant near 15 Hz and critically damped. It is too heavy to follow sound, but it yields about 10 cm³ to a pressure that lasts. When a voiced stop seals the mouth, the air still has somewhere to go, so the folds keep vibrating for 60–80 ms and the skin radiates that hum (the voice bar: all of the walls' motion radiates). Speakers slacken the walls to voice and brace them otherwise, and so does the model: with the folds apart or pressed shut the deep tissue is 20 times stiffer, so voiceless stops and ejectives build pressure at once. Before this a /b d g/ closure was digital silence.

**Moving flesh, moving air.** An articulator that moves changes the volume of its sections, and that pumps air. The tongue is a muscle of constant volume: where it rises it draws flesh from beside and below, and a one-dimensional tube has no room for that, so only a quarter of the volume change of a tongue, jaw or lip gesture moves air (all of it made every closure thump). Three movements are real pistons and pump in full: the larynx rising under shut folds, the tongue pulling down between two seals, and the ventricular folds squeezing the ventricle's air in a growl.

**Source.** The glottis is an orifice whose area opens and closes: a raised-cosine opening, then a closing that steepens toward contact for a pressed voice. Its resistance is Bernoulli plus slit viscosity plus inertance, driven by lung pressure minus the pressure above it. The flow pulse, its skew, source–tract interaction and devoicing behind a closure all follow from that. The folds vibrate only when adducted and when the pressure across them exceeds a phonation threshold of about 2.5 cmH₂O. Voiceless consonants pull the folds apart, and a small posterior gap never closes. Lung pressure ramps within each control period, because a stepped pressure would buzz at the control rate.

**Creatures (`creature.rs`).** `creature` switches the source.
- **Songbird:** two van der Pol labia, oversampled 4×. Their nonlinearity rises with air-sac pressure, so the tone is pure when soft and buzzier when loud; the second side sings (1 + `harmony`) × the pitch. A 4 cm trachea, a resonance tracking the song's pitch (the oropharyngeal cavity, which keeps birdsong tonal) and a beak whose gape (`lipOpen`) sets the passband shape it.
- **Elephant:** like the human glottis here, the lips' opening is driven at the pitch, more sharply when blown harder. Air passes them by Bernoulli against the back pressure of a 1.2–2 m trunk (a delay line inverted and low-passed at the open end).

The seal and the alligator use the human airway, which now reaches 32 cm, with their own proportions, growl, fry and nasal coupling. Every call ends with `creature` back at 0.

**Recording chain.** On the dry voice, before the room:
- microphone distance: a 160 Hz shelf up to +8 dB and +3 dB of level up close; far away −4 dB of bass, −4 dB above 5 kHz, −6 dB of level and up to 2.5× the room send;
- low and high shelves at 220 Hz and 5.5 kHz and a 1.6 kHz peak;
- an RMS compressor (10 ms attack, 150 ms release, threshold −14 to −30 dB, ratio 1–8, make-up gain);
- drive (unity-gain tanh, so quiet signals pass and peaks round off).

Every stage is bypassed at its neutral setting (the engine's defaults), so those renders are bit-identical to the plain voice. The default character voice uses a +3 dB peak at 1.6 kHz: the source and tract are 3–4 dB weak in the 1–4 kHz presence region against real speakers, and this lift brought it 0.53 dB (MCD) closer to them without costing intelligibility.

**Voice qualities.** Four controls change the larynx, not a filter:
- **Falsetto** (`register`): only the thin edges of the folds vibrate. The pulse becomes smooth and symmetric with a smaller swing, and a posterior gap stays open, which adds aspiration. Measured on a held /ɑ/ at 220 Hz, H1−H2 rises from 1 to 15 dB, and the level drops about 8 dB.
- **Fry** pairs the pulses: a short cycle with a weak pulse, then a long one, with an irregular rhythm and a short open phase. The half-pitch component reaches −1 dB re H1.
- **Growl** draws the ventricular folds (about 0.3–1 cm above the glottis) together, flapping at half the pitch. They never seal, and as they swing in they squeeze the air out of the ventricle beside them, so the airway itself doubles the period (−15 dB re H1).
- **Twang** narrows the epilarynx tube (2.4 cm, toward 0.5 cm²), raises the larynx (1 cm shorter tract, wider pharynx) and firms the closure. The harmonics at 2.5–4 kHz rise 10 dB.

**Other airstreams.** The airway already turns articulator motion into air movement (each node's volume change pumps air), so these need only the movements:
- **Glottal stop:** `glottal` presses the folds shut, and they stop vibrating.
- **Ejectives:** the folds stay shut while `larynx` rises through the oral closure and takes up to 40% of the pharynx's cross-section. The trapped air compresses, and the release pops. Measured release peaks are ×30 (t') and ×5 (k') those of the same gesture without the rise. The velar seal leaves less air behind it to compress.
- **Clicks:** between two oral seals (the back of the tongue and the tip or the lips), `suction` widens the cavity by 60%. The air there rarefies, and the front seal pops open 30 ms before the back one (×5–11 without the suction).

The phonemes are Q (ʔ), PE, TE, KE (ejectives), and CB (ʘ), CD (ǀ) and CA (ǃ) (clicks). "tsk" in text is a dental click.

**Palatalization.** A palatalized consonant (PJ BJ TJ DJ KJ GJ MJ NJ FJ VJ SJ ZJ LJ RRJ; ʲ in IPA) keeps its own constriction while the tongue body takes the /j/ position (`tongueX` 1, `tongueY` 0.95). Before a vowel the body gets there at the release, so the vowel starts with a [j]-like glide; elsewhere it is there 30 ms before the consonant begins, so the vowel before it ends in an [i]-like glide. Soft t and d are released through a hiss (the second half of the segment, as an affricate's), as Russian мать is. A soft velar is fronted by the same body move, a soft l loses its dark body shape, and soft stops are not aspirated (the aspiration would cover the glide). A vowel next to a soft consonant moves 15% of the way to the palatal position, and 60% between two of them, as Russian /a/ does in пять [pʲætʲ]. Text input is still English only: the soft consonants are reached through phoneme input.

**Trills.** With `trill` on, the narrowest constriction and its neighbors (tongue tip, lips or uvula, whichever is narrowest) are held near contact. They open toward 0.25 cm² and spring shut about 27 times a second, but only with a breath behind them (they are driven by effort × gate). The phonemes RR (rolled r), BR (lip trill) and RU (uvular r) set the place and turn the trill on for their segment. In text, "brr…" is a lip trill and "rrr…" a rolled r.

**Bodies.** Tract length scales the whole airway. `pharynx` stretches or shrinks the part below the velum (sections 0–24 of 44) relative to the mouth, each section taking the nearest section of the unscaled tract so closures stay exact. A search over both against the Hillenbrand et al. (1995) means for men and for 10–12-year-old children puts the presets at a 16.4 cm tract with pharynx 1.0 (men, 3.9% mean F1/F2 error over 12 vowels) and a 12.6 cm tract with pharynx 1.1 (children, 4.3%). The search does not support the textbook shorter child pharynx for this model: errors rise to 5–9% below 1.05. The female vowel targets are used unchanged for all bodies.

The `yodel` song style flips `register` across the middle of the song's range. The flip comes just before the vowel, with an 8 ms time constant, and the pitch snaps across the leap.

**Turbulence.** Each sample, the Reynolds number of the actual flow drives a dipole source ∝ Re² − Re_c² (critical ≈ 1800, saturating near 12 000), injected as a series pressure source. There are three sources:
- the jet about 1 cm downstream of the narrowest constriction;
- the incisors, when a coronal jet strikes them (sibilants), weighted by place so /ʃ/ comes out a few dB louder than /s/, as it does in real speakers;
- the glottis, where the slit's Reynolds number 2u/(ℓν) drives aspiration.

The cavity in front of each source sets the spectrum's peaks. Bursts are not generated separately: air compresses behind a closure and leaves when it opens. Articulators open at a limited rate (about 40 cm²/s plus 40 /s × area), which shapes the transient. A parameter jump installs the new shape at once without pumping air.

**Output stage.** Radiated sound is the rate of change of the air leaving the lips and nostrils, plus a little wall radiation. A leveler (−22 dBFS, 3:1; 50 ms window and 40 ms attack, so a held note settles within its onset; 0.8 s release) and a 2 ms look-ahead limiter (ceiling 0.8) follow, then the soft clipper.

**Display telemetry.** At control rate the engine also keeps the smoothed sound-pressure amplitude in every oral and nasal section (`engine_energy`), the mean airflow, the share of air leaving through the nose, and whether the tract is sealed. The glottal panel draws the last cycle of computed glottal airflow. The cutaway's lit airway, flow particles, seal marker and sound readout use only these values and the area function; nothing there is a canned animation, except the fold view, which runs the modeled pulse slowed 100× and says so.

**Real-time safety.** Render work is bounded per sample. Buffers and score storage (65,536 events) are allocated at construction. A non-finite or runaway sample resets the airway and filters and is counted in telemetry; the tests assert it never happens. Offline rendering runs at about 13× real time in Node on an Apple-silicon laptop.

**ABI.** Plain `extern "C"` functions over linear memory: `engine_init/set/jump/render`, output, parameter, area and state pointers, score staging/load/play/stop, `analyze` and `shape_from_params`. `src/core/engine.ts` wraps them and checks parameter-table parity at load.

## Planner (`src/core`)

- `text.ts`: normalization (numbers, punctuation → boundaries), a CMUdict-derived lexicon (front-coded, gzip, decoded lazily), original fallback letter-to-sound rules, ARPABET input and syllabification. Speech uses weak forms of function words inside a phrase ("of" [əv], "to" [tə], "for" [fɚ]); a phrase-final one keeps its strong form. Singing keeps full forms.
- `phonemes.ts`: ARPABET inventory plus `DX` (flap, used for intervocalic T/D). Vowel targets come from calibration; consonants constrain only the articulators they use.
- `planner.ts`: phones → timed segments (inherent durations with stress, cluster and phrase-final rules) → events on independent tiers. The tongue body follows a vowel-to-vowel trajectory with dorsal consonants superimposed. Vowel moves are quick (τ 12–24 ms) and start about four time constants ahead, so vowels reach their targets; tip, lips, dorsum, velum and glottis gestures are local. A voiceless fricative keeps the glottis open from just before its onset to 5 ms past its end, and a phrase-final consonant releases into silence: the folds come back together only once the breath has stopped. The velum lowers about 35 ms before a nasal. Intonation has declination, accents on stressed syllables, a final fall or a question rise. Singing aligns vowel onsets to note starts and places codas before the next note. Sung consonants keep their spoken length: an onset takes its time from the end of the previous vowel (which keeps at least 40% of its length or 50 ms), and a phrase's first onset starts inside the silence before it. The pitch moves during the onset consonants, so the vowel starts in tune; glides shorten on short notes. Songs add a little effort (a firmer, less breathy sung voice was tried and dropped: it moved the voice away from a real singer), and a phrase ending in punctuation gives up 130 ms for a breath when the next note follows at once. The planner also glides pitch for legato and delays vibrato on long notes, and returns lyric cues (consonant onset, vowel onset and release per sung syllable) for display. The `cartoon` song style adds fast pitch glides up into each note (a glide, not a jump: an instant f0 step clicks), slower slides on held syllables, fall-offs before rests, wider and faster vibrato, stronger accents, and scales the jaw, lip-opening and rounding targets up (closures stay closed).
- Live singing (`planLiveOn`, `planLiveOff`): a key down plans the held syllable's coda (legato), this syllable's onset and its vowel held for up to 30 s. A key up plans the diphthong glide, the coda and the end of the breath. Neither score has the preamble, so the articulators carry on from where they are.
- `duet.ts`: a second singer sings a part written out or derived from the melody: an octave below, a fifth below, or a diatonic third above in the song's key (guessed from the last note). Live, each singer gets their own engine (a second worklet node, made on first use, started with the first). Renders mix both at 0.72 each.
- `beat.ts`: a beat is 16 or 32 sixteenth-note steps, each one sound id or a rest. It is sung as a song of vowel-less syllables written as bracketed phonemes (`[PE]`, `[T+S]`, `[BR]`), so a beat goes through the same planner and engine as speech and song. A looping beat repeats exactly one bar.
- `show.ts`: a show is spoken lines and sung numbers strung into one score with one set of word cues; the demo lounge set lives here. In songs, a syllable with no vowel is performed as written: beatbox hits ("tss", "pff", "kh") put the stop's release on the beat, and a nasal ("hmm") is hummed for the note.
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
- `voice_lab_jam` checks the answer (at most 32 notes and 32 beats) and broadcasts it as the `plugin.hermes-voice-lab.jam` event instead of saving it. The open view sings it. The phrase going the other way is recorded by `src/performance/jam.ts` (the line the monophonic voice actually sang, newest held key first), written on a sixteenth grid, and sent with the gateway's `prompt.submit` to the focused live session after 1.4 s of silence.
- `tts.py` registers the opt-in `voice-lab` provider (`synthesize` → WAV; `stream` → 24 kHz PCM).
