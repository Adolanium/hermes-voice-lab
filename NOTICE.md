# Notices and sources

Hermes Voice Lab's code, engine, calibration results, presets, melodies, example phrases and portrait drawing were written for this project and are released under the MIT license in `LICENSE`. This file lists third-party material that ships with the plugin and the published research the design draws on.

## CMU Pronouncing Dictionary

`runtime/lexicon.txt.gz` (and `assets/lexicon.txt.gz`) is derived from the CMU Pronouncing Dictionary (https://github.com/cmusphinx/cmudict, commit `74790861f652b15e4ac49015a90074ad62a27690`): first pronunciations of alphabetic words, re-encoded by `scripts/build-lexicon.mjs`. Its license is reproduced in `assets/CMUDICT-LICENSE`:

> Copyright (C) 1993-2015 Carnegie Mellon University. All rights reserved.
>
> Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer. The contents of this file are deemed to be source code.
> 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
>
> This work was supported in part by funding from the Defense Advanced Research Projects Agency, the Office of Naval Research and the National Science Foundation of the United States of America, and by member companies of the Carnegie Mellon Sphinx Speech Consortium. We acknowledge the contributions of many volunteers to the expansion and improvement of this dictionary.
>
> THIS SOFTWARE IS PROVIDED BY CARNEGIE MELLON UNIVERSITY "AS IS" AND ANY EXPRESSED OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL CARNEGIE MELLON UNIVERSITY NOR ITS EMPLOYEES BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Nous Girl

The portrait is an original side-profile drawing that interprets the Nous Girl character published by Nous Research (reference assets: `assets/nous-girl-black.svg` and `assets/nous-girl-white.svg` in https://github.com/NousResearch/hermes-agent, inspected at revision `ee6db222660c84e4ba2cf158108f0e6fed9afe34`). No official artwork is traced or embedded. That repository is published under the MIT license; no separate asset license was found. The character belongs to Nous Research; this attribution is separate from authorship of the drawing and the code. Voice Lab is unofficial: its synthetic voice is a fictional character voice, not an official Nous voice, and nothing here implies endorsement or grants trademark rights.

The hermes-agent MIT notice, for the character reference:

> Copyright (c) 2025 Nous Research
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Scientific background

The engine implements published models in our own code. No code, figures, recordings or data tables from these works are redistributed, except the vowel formant means used as calibration targets (factual measurements, cited below).

- J. L. Kelly and C. C. Lochbaum, "Speech synthesis," Proc. 4th Int. Congress on Acoustics, 1962 — scattering-junction tube model.
- J. O. Smith III, *Physical Audio Signal Processing*, CCRMA — digital waveguides, normalized scattering junctions. https://ccrma.stanford.edu/~jos/pasp/
- G. Fant, J. Liljencrants and Q. Lin, "A four-parameter model of glottal flow," STL-QPSR 26(4), 1985 — LF glottal model.
- G. Fant, "The LF-model revisited. Transformations and frequency domain analysis," STL-QPSR 36(2–3), 1995 — Rd parameterization.
- D. H. Klatt and L. C. Klatt, "Analysis, synthesis, and perception of voice quality variations among female and male talkers," JASA 87(2), 1990 — breathiness and aspiration.
- J. L. Flanagan, *Speech Analysis, Synthesis and Perception*, 1972 — turbulence noise and aerodynamics.
- J. Hillenbrand, L. A. Getty, M. J. Clark and K. Wheeler, "Acoustic characteristics of American English vowels," JASA 97(5), 1995 — adult-female mean F1–F3 used as calibration targets (`engine/src/bin/calibrate.rs`).
- S. E. G. Öhman, "Coarticulation in VCV utterances," JASA 39(1), 1966 — vowel-to-vowel trajectory with superimposed consonant gestures.
- E. L. Saltzman and K. G. Munhall, "A dynamical approach to gestural patterning in speech production," Ecological Psychology 1(4), 1989 — critically damped articulator dynamics.
- D. H. Klatt, "Synthesis by rule of segmental durations in English sentences," 1979 — context-dependent duration rules. Some inherent durations equal Klatt's published values; others were tuned for this voice.
- D. Murphy, M. Jani and S. Ternström, "Articulatory vocal tract synthesis in SuperCollider," DAFx 2015. https://dafx.de/paper-archive/details/eHg8j1Dj_oAGb2pGTuyaJQ
- A. Weitz, I. Steiner and P. Birkholz, "Gesture-based articulatory text-to-speech synthesis," ESSV 2017. https://www.dfki.de/en/web/research/projects-and-publications/publication/9202
- H. Choi, "Audio worklet design pattern." https://developer.chrome.com/blog/audio-worklet-design-pattern

## Software

The desktop bundle uses the React runtime and `@hermes/plugin-sdk` supplied by Hermes Desktop; neither is bundled. Build and test tools (TypeScript, esbuild, Vite, Playwright, React DOM for the standalone preview) are development dependencies only. The Rust engine has no external crates.
