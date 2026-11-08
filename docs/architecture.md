# Architecture

`engine/src/lib.rs` owns all sample generation. Its 44 oral sections propagate opposing pressure waves through an area function controlled by tongue position, tongue height, jaw and lips. Area discontinuities scatter waves. A 28-section nasal side branch joins the oral tract at a three-way pressure-continuity junction. The internal clock is 104 kHz, corresponding to an approximately 14.5 cm oral tract at 343 m/s. Geometry is an original synthetic proxy, not measured anatomy.

An asymmetric glottal flow pulse, aspiration, local constriction noise, radiation filtering and distributed loss feed the tract. Pitch does not change its length or area function. The default target combines a 205 Hz fundamental, shorter tract, smooth pulse closure and modest aspiration. It is a fictional voice design target, not a validated adult voice classification.

Parameters are smoothed in the Rust engine. Output is guarded against non-finite values and soft bounded. Supported sample rates are 8–192 kHz; pitch tests cover 44.1, 48 and 96 kHz. Linear resampling and a simple rolloff are practical compromises, not a high-order reconstruction filter.

`audio/engine.js` wraps the raw WASM ABI and validates input. `Timeline` schedules sample-frame boundaries and is shared by `audio/voice-worklet.js` and `audio/offline.js`. Worklet blocks use reusable output views. Sparse visual messages copy tract geometry and actual smoothed parameters to the main thread. React, file access and language planning never run in the audio callback.

`audio/planner.js` contains a small original lexicon and gesture rules. Vowels hold tract targets, fricatives add noise, stops use a constriction and short release, and nasal tokens open the side branch. These are approximate gestures. Unknown words or phonemes reject the score. Lyric planning assigns one word to each note and extends vowel gestures. No external dictionary is bundled.

The React instrument receives an optional `VoiceLabBridge`. In Desktop, the adapter imports only the public SDK and React, registers a route/navigation item, pins the conversation/profile for each mounted instrument, and uses scoped REST/event APIs. The backend validates parameters and stores projects through Hermes' plugin storage. Render commands invoke Node with an argument array, never a shell, and return a normal WAV media attachment. User exports use the host's captured authenticated file download action.

The build embeds the worklet text and WASM bytes into one desktop ESM file because disk plugins cannot resolve arbitrary relative imports. Audio starts on a user gesture. Note release and Stop silence the voice; Disable audio closes its context. Unmount on navigation, plugin disable or reload closes audio and removes listeners/timers. Agent edits update controls but do not autoplay. Multiple windows therefore require separate explicit playback gestures.

The SVG portrait has new editable paths, direct articulation handles, an optional stylized cutaway, and a mouth driven by the engine's smoothed state. The airflow dash animation is illustrative and slowed. The waveform and spectrum read a real AnalyserNode; they are not acoustic calibration readouts.
