# Validation

Tested on macOS arm64 with Node 26.13.0 and the official Hermes checkout at `ee6db222660c84e4ba2cf158108f0e6fed9afe34`. Host-specific results are recorded separately in `host-validation.md`. Browser preview is Chrome 156.0.8078.74. Validation used a separate Hermes home/runtime/user-data directory; the user's live configuration was not used for plugin installation.

## Engine

- Four Rust tests cover finite bounded output during multi-rate sweeps, invalid parameter handling, deterministic audible output and release decay.
- Seven Node/WASM tests cover pitch within 1% at 110, 205 and 330 Hz across 44.1/48/96 kHz; identical sample output across timeline block sizes; geometry/nasal/noise effects; deterministic valid mono PCM16 WAV data; ten-second extreme sweeps; input rejection; every supported phoneme rendered finite and nonzero, with silence remaining zero.
- Five planner tests cover unknown-word rejection, contiguous timing, unsupported phonemes, exact lyric note boundaries and invalid timing.
- A local ten-second offline render took about 136 ms. This is a single-machine throughput measurement, not a realtime deadline guarantee.
- Spectral peaks vary with articulation. Peaks were not interpreted as validated formants. No listening review or speech intelligibility study was performed.

## Browser

`node scripts/test-browser.mjs` exercises the standalone UI through Chrome. It measures actual AudioWorklet output through an AnalyserNode. The recorded sustained RMS was about 0.035 and release peak below 0.000002. Tests cover no autoplay, keyboard notes, vowel selection, sequencing, valid WAV download, patch JSON round-trip, three disable/restart cycles with all contexts closed, accessible avatar controls, unknown-word rejection, and a 430px layout without horizontal overflow. See `browser-test-results.json` for exact measurements.

Screenshots in `docs/media/` are from the actual implementation. Browser captures are explicitly standalone and do not establish host loading. Audio examples are generated locally by the shipped engine; no subjective quality claim follows from their waveform measurements.

## Reproduce

```sh
npm ci
node scripts/build-engine.mjs
cargo test --manifest-path engine/Cargo.toml
npm run build
npm run typecheck
npm test
npm run dev -- --port 5188
# In another shell:
node scripts/test-browser.mjs
```

Installed-host steps and any remaining gaps are listed in `host-validation.md`. General English TTS and a Hermes read-aloud provider remain deferred. The next quality milestone is a listener-reviewed vowel/consonant calibration and intelligibility pass, followed by provider integration if usable.
