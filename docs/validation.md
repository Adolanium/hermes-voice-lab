# Validation

Tested on 2026-11-08 on macOS 27.2 (arm64). Hermes Desktop was the official app built from `NousResearch/hermes-agent` at `ee6db222660c84e4ba2cf158108f0e6fed9afe34` (Desktop v0.23.0, Electron 44). Desktop launched its own gateway from the machine's published backend checkout (revision `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19`) even with `HERMES_DESKTOP_HERMES_ROOT` set. Plugin validation and registry checks ran against the pinned `ee6db22` source. All testing used a disposable `HERMES_HOME` and Electron user-data folder. The live Hermes configuration and installed plugins were not modified.

## Automated

Golden tests (`tests/golden.test.ts`) fingerprint fixed renders and plans with SHA-256: speech, a song, a beat, the clicks, ejectives and trills, the voice qualities, a body and the recording chain. Any change to the sound or the plans fails them on purpose. A deliberate change is re-blessed with `BLESS=1 npm test`, and the commit says what changed and why.

| Suite | Command | Result |
|---|---|---|
| Rust engine (17 tests) | `npm run test:engine` | pass |
| Node core (93 tests) | `npm test` | pass |
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
- **Duet**: thirds above follow the key's scale, the octave-below part is the melody minus 12, the second singer gets their preset's body, a duet with the part off has no second score, invalid parts are refused (TypeScript and Python), and the renderer CLI mixes both singers within range.
- **Bestiary**: every call is audible and bounded, the songbird's output crosses zero more than 1,000 times a second (measured 2.3–4.1 kHz whistles), and every call hands back the human airway. Golden renders of the human voice are unchanged.
- **Recording chain**: the defaults leave the output bit-identical, a close microphone lifts 150–450 Hz by more than 3 dB, a +12 dB high shelf lifts 5.5–9 kHz by more than 8 dB, drive lowers the crest factor by at least 15%, and every setting stays bounded.
- **Beat mode**: a pattern becomes one note per sounding step on the sixteenth grid with the right bracketed phonemes. Steps 0, 4 and 8 sound within 30–50 ms of their place, the output is bounded, and invalid patterns are refused (TypeScript and Python).
- **IPA input**: stress marks, diphthongs, affricates, boundaries and the non-English sounds parse to the expected phonemes; ARPABET still works.
- **Live singing**: one engine is driven through key down, a legato second syllable and key up. The held vowel and the legato note are within 30 cents of their keys, the output is silent after release, and the live scores never jump the tongue or lips (no preamble).
- **Ejectives and clicks**: behind a sealed glottis, the t' release is more than 5× and the k' release more than 2.5× the same gesture without the larynx rise. Each click is more than 3× its release without the tongue's suction. A glottal stop cuts the voice to under a quarter of its level, "tsk" plans a dental click, and every output stays bounded.
- **Palatalization**: `nʲɛt pʲatʲ` parses to NJ EH T / PJ AA TJ. After a soft p, m, l or z the first 50 ms of /ɑ/ carry over 6 dB more energy at 2.2–3.2 kHz relative to 1.2–1.9 kHz than after the plain consonant (measured against the end of the same vowel), the tongue body moves only for the soft one, and outputs stay bounded.
- **Palatalization against a real voice** (not automated): the macOS Russian voice (Milena) and ours on пат/пять, ток/тёк, тук/тюк, топ/топь, second formant through the vowel. Onset after a soft consonant: hers 2.15–2.4 kHz, ours 1.9–2.4 kHz (lowest after soft t, whose hiss covers the start), both down to the plain vowel by a quarter of its length. /a/ between two soft consonants: hers 2.1–2.3 kHz throughout, ours 2.1–2.4 kHz (1.5 kHz before the vowel-fronting rule). Rise into a final soft p: hers +390 Hz, ours +870 Hz, an overshoot kept because the earlier, weaker gesture (+310 Hz) left стал/сталь indistinguishable to the recognizer below.
- **Palatalization heard by a recognizer** (`research/tools/judge/palatal_afc.py`, not automated): 12 Russian minimal pairs (мат/мать, лук/люк, стал/сталь …), each word spoken alone. Whisper small (multilingual) gives the probability of both words of the pair for each recording; a pair counts when the soft word is more likely on the soft recording than on the hard one. The macOS Russian voice: 12/12, mean margin 7.2 (log-probability). Ours: 12/12, mean margin 3.8; weakest мат/мать (+0.1) and вол/вёл (+1.8). Without the soft consonants the two recordings of a pair are the same sound (margin 0). Plain transcription of the same isolated words is too hard a test for either voice (hers 9/24 exact, ours 1/24).
- **Trills**: the rolled r, lip trill and uvular r each modulate the output envelope at 27 ± 5 Hz, stay bounded, and "brrr" in text plans a lip trill.
- **Bodies**: with the Tenor and Child presets' tract length and pharynx, the 12 calibrated vowels land within 6% mean F1/F2 error of the Hillenbrand et al. (1995) means for men and for children (measured: 3.9% and 4.3%).
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

## Real voices

Since 2026-11-08 the voice has been tuned toward real voices, one measured change at a time. The two distance judges are our own code, after the reference project's method. The datasets are used for research only and nothing derived from them ships.
- **Speech** (`research/tools/judge/speech.py`): 48 Harvard sentences, 4 from each of the 12 adult female speakers in the TSP speech database (Kabal 2018). The judge measures mel-cepstral distance (MCD) along a DTW path, counting each real frame once, plus length, spectral balance, H1−H2, pitch range, formant bandwidth and consonant levels.
- **Singing** (`research/tools/judge/singer.py`): 20 English songs (2,469 notes) of the Children's Song Dataset (Choi et al. 2020), sung with the singer's own phonemes, times and pitches. Each note's steady part is compared with her recording.
- **Naturalness** (`research/tools/mos/`): UTMOS22 (Saeki et al. 2022, via SpeechMOS), a neural predictor of listeners' mean opinion score (1–5), on the same 48 sentences. It ranks real speakers, the reference synthesizer and ours the way the owner hears them; MCD did not, so since round 4 naturalness leads and MCD is a secondary measure.

| | Naturalness (UTMOS, higher is better) | Speech MCD (lower is better) | Length vs real | Pitch range vs real | Formant bandwidth (real 158 Hz) | Singing note MCD | Whisper WER |
|---|---|---|---|---|---|---|---|
| Before | 2.38 | 32.90 dB | ×1.23 | −5.1 st | 200 Hz | 36.62 dB | 38.9% |
| Checkpoint 3 | 2.18 | 32.12 dB | ×1.04 | +0.5 st | 189 Hz | 35.07 dB | 33.2% |
| Now | **2.68** | 33.50 dB | ×1.23 | **+0.6 st** | **162 Hz** | 35.70 dB | 34.1% |
| Reference synthesizer | 2.89 | 32.46 dB | ×1.02 | −3.3 st | 118 Hz | 38.87 dB | 43.4% (earlier run) |
| Real speakers | 4.25 | — | — | — | — | — | — |

Kept changes:
- intonation scaled to real speakers' pitch range;
- a firmer, less breathy default voice;
- no extra firmness for singing;
- a +3 dB presence lift at 1.6 kHz in the default voice's recording chain;
- no extra high-frequency wall loss in the airway, so formants are as sharp as real ones (it had made the voice muffled);
- a careful reading pace with normal-speed gestures (the faster rate and gestures kept at checkpoint 2 matched real spectra better but sounded choppy);
- female vowels recalibrated against Hillenbrand et al. (1995): mean F1–F3 error 3.45% (was 4.29%).

Two bugs were fixed along the way: the tract analysis now uses a 32,768-point FFT, because with lighter wall loss the tract rang past the old window and truncation ripple read as false formants; and the output limiter now holds its gain over the look-ahead, which stops peaks overshooting the 0.81 ceiling (a beatbox show had reached 0.845).

Sung naturalness is about unchanged (UTMOS 1.67 → 1.69; reference 1.78, real singer 2.45). Whisper WER varies by about ±2 points run to run. Slower gestures everywhere scored up to the reference's naturalness but raised WER to 39–47%, so they were not kept.

### Phone by phone (2026-11-09)

A third judge (`research/tools/judge/phones.py`) carries our planner's phone boundaries onto each real recording along the DTW path and compares each phone: its length, its level, a stop's burst, a sibilant's centre frequency, and whether it starts with a hard edge. Each gap is counted in units of how much the 12 speakers differ from each other; the score is the mean excess over one such unit. It runs on 240 Harvard sentences (20 per speaker), and Whisper's word error rate is taken on the same 240 (1,928 words) with a paired error bar. The 30-sentence WER moves 2–6 points on a change that does nothing, so it no longer decides.

What the judge found, and what was changed for it:
- **Voiced stops were silent.** A /b/ closure sat 59 dB below the vowels (speakers: about 20–29 dB). The tract filled in 10 ms and the folds stalled. Deep tissue that yields, braced when the folds are apart, and full skin radiation of the walls' motion put it at −20 dB.
- **Every closure thumped.** All of a gesture's volume change pumped air; now a quarter does, except for the true pistons. Hard broadband onsets fell from 7.0 to 5.6 a second (speakers: 5.9).
- **Sibilants were low and /ʃ tʃ dʒ/ quiet.** The obstacle source moved up and the postalveolar one was strengthened; /tʃ dʒ/ release earlier in their length.
- **Nasals were 8 dB quiet.** The nasal passages now lose energy by frequency: the low murmur rings, the upper resonances stay damped.
- **Stops were long, some vowels short.** Inherent lengths moved about 70% of the way to the speakers'.

| | Before | After | Real speakers |
|---|---|---|---|
| Whisper WER, 240 sentences | 33.2% | **29.3%** (−4.0 ± 1.1, paired) | not measured |
| Phone score (0 = within the speakers' range) | 0.553 | **0.147** | — |
| Predicted naturalness (UTMOS, 30 sentences) | 2.78 | **3.31** | 4.25 |
| Hard broadband onsets per second | 7.03 | **5.60** | 5.92 |
| Speech MCD | 34.17 dB | 33.93 dB | — |
| /b/ closure level re vowels | −59 dB | −20 dB | −20 to −29 dB |
| /n/ level re vowels | −10.4 dB | −6.1 dB | −2.6 dB |
| /ʃ/ level re vowels | −7.3 dB | −2.7 dB | −3.6 to −4.0 dB |
| /tʃ/ level re vowels | −21.0 dB | −8.4 dB | −8 to −11 dB |
| /s/ centre frequency | 6.56 kHz | 6.88 kHz | 7.3 kHz |
| Sung naturalness (UTMOS, 20 songs) | 1.76 | **1.98** | 2.45 |
| Sung WER (30 sentences) | 57.2% | 57.4% | — |
| Singing note MCD | 35.86 dB | 36.20 dB | — |

What it cost: the voice is about 1 dB darker at 1–4 kHz against the speakers (−1.5 and −2.4 dB became −2.6 and −3.3 dB), the singing note MCD rose 0.34 dB, and the lip click is weaker (the tongue clicks and ejectives were retuned to their old strength). Tried and dropped: a slower breath attack (no judge moved), a faster tempo (length ×1.20 → ×1.09 but +2.6 ± 0.9 points of WER), a slower release of the back of the tongue, and a second step of nasal loudness (no change). Still open: nasals 3.5 dB quiet, /ɝ/ 3.6 dB quiet, speech 20% slower than real, and no listener has compared before and after yet.

Rejected changes and their numbers are in `research/hill-climb/log.md`. The owner listened at four checkpoints and preferred the new version each time (the third only slightly). An earlier, deeper sung vibrato moved toward the real singer but was not audibly different, so it was not kept. Still open: about 0.2 naturalness behind the reference, speech slower than real (×1.23), and shallow sung vibrato.

## Sung words (2026-11-12)

Two judges for sung diction, both with Whisper `small.en` (research tooling, `research/tools/sung/`):
- **Real songs** (`songs.py`): ten English songs of the Children's Song Dataset whose lyric text has one syllable per sung note (991 words), sung on the singer's own note times and pitches from the lyrics as text, the way a user makes a song. Whisper transcribes the whole song. On her recordings it gets 16.0% of the words wrong, which is what this judge can reach.
- **Sentences** (`sung240.py`): the 240 Harvard sentences of the speech judge, one syllable per eighth note at 120 bpm, with a paired error bar.

A phone aligner given the planned sounds (`lost.py`) says which of them it cannot find in the render.

| | Before | After | Real singer |
|---|---|---|---|
| Real songs, word errors | 55.6% | **32.5%** (−23.1 ± 5.5, paired over songs) | 16.0% |
| 240 sung sentences, word errors | 62.0% | **51.6%** (−10.4 ± 1.7, paired) | not measured |
| Sung consonants the aligner cannot find (240 sentences) | 19.5% | 17.6% | — |
| Speech, 240 sentences, word errors | 29.3% | 29.4% (+0.2 ± 0.8) | — |
| Speech, predicted naturalness (UTMOS, 30 sentences) | 3.32 | 3.32 | 4.25 |
| Speech consonants the aligner cannot find, of 6,012 | 515 | 443 | 158 |

What was changed, each step measured on its own:
- **A held vowel is reached within 60 ms.** The rule that places a vowel's target 38% into its length was written for spoken vowels of about 100 ms. On a half-second note the tongue arrived 100–190 ms late, so long notes began as the vowel before them. This was the largest step: real songs 48.1% → 31.4% (−16.8 ± 5.1, eight songs better, none worse).
- **Sung consonants keep their spoken length** (they were cut to about 70% of it): real songs −10.5 ± 6.3, sentences −4.4 ± 2.2.
- **/t/ and /d/ release through a short hiss at the ridge.** Against real speakers the /t/ burst was 2.7 dB weak and is now in their range; the aligner misses 22% of sung /t/ where it missed 55%. Without the stage on /d/, real songs lost 5.1 ± 3.7 points.
- **Unstressed syllables on short notes stay weak** ("the", the end of "little") and a little softer; on notes of 0.35 s or more they open to the full vowel. Sentences −5.8 ± 1.8.
- **A final voiced consonant ends like a speaker's.** After a last /z/ or /d/ the mouth opened while the voice was on, adding a vowel ("toes" as "toe-zuh"). The voice now fades out of a final fricative and a final stop is released into breath. Final fricatives the aligner misses: 44% → 30%.

Tried and dropped: reaching the vowel within 35 ms (no better than 60), a longer breath after a final consonant (no change), no vibrato (no change). Singing on one note or an octave lower made no difference to the errors; an octave higher cost 12 points on sentences. The timing of the syllables matters most: sung on one pitch with speech timing, the same sentences score 36.6%.

Still open: final stops (43% not found), final /z v/, /r/ at the end of a syllable, nasals at the start, and consonants on high notes. The song judge moves by about ±4 points between runs of near-identical builds, so steps smaller than that need the sentence judge. No listener has compared before and after yet.

## Other languages' sounds (2026-11-12)

A sound English does not use is checked against something independent of our own tests: Whisper `small` chooses between the two words of a minimal pair (`research/tools/judge/contrast.sh`), for our render and for the macOS voice of that language as the control. A pair counts when the recording of the second word prefers the second word more than the recording of the first does.

| Contrast | Pairs | Control voice | Ours |
|---|---|---|---|
| Hindi aspirated and breathy stops (पल/फल, बाल/भाल …) | 8 | Lekha 7/8 | **7/8** |
| Polish sibilants s / ɕ / ʂ and their affricates (kasa/Kasia/kasza, bicz/bić …) | 9 | Zosia 9/9 | **8/9** (ʐ/ʑ not told apart) |
| Korean lax / tense / aspirated stops (달/탈/딸 …), through the Korean front end | 15 | Yuna 10/15 | **11/15** |
| French nasal vowels (beau/bon, paix/pain …) | 10 | Thomas 10/10 | 5/10: not heard |

Whole Korean phrases (10, transcribed by Whisper): 38% of characters wrong from ours, 3% from Yuna; five of the ten came back exactly. Nasal vowels do change the modeled spectrum (first formant 7 dB weaker and 60 Hz wider on /a/), but the low nasal resonance real nasal vowels have is missing. A larger velar port changed nothing and a less damped nasal passage did not help, so both were reverted and the engine is unchanged.

With the voice off, the airway was put into 20 random corners of the articulator space at 16 and 48 kHz device rates (jaw, lips, tongue, tip, velum, throat, larynx, tract length and pharynx at their limits): once a pose is held the output is silent (peak under 0.0003). Jumping between corners in 30 ms thumps, up to the limiter's ceiling when the tract length jumps from 11 to 32 cm.

Score import was checked with a two-part MusicXML file (English and Korean) from the command line and in the built web page.

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
