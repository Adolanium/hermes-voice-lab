# Notices and sources

Hermes Voice Lab's code, engine, calibration results, presets, melodies, example phrases and portrait drawing were written for this project and are released under the MIT license in `LICENSE`. This file lists third-party material that ships with the plugin, the project that inspired the engine's design, and the published research the design draws on.

## Inspiration: chimera-vocal-synth

The voice engine's approach and the demo act's format were inspired by Jameson Hodge's [chimera-vocal-synth](https://github.com/jamesondh/chimera-vocal-synth) (MIT license; studied at commit `5ab44de`). After reading its voice code, we rebuilt our engine on the same ideas, in our own code and structure:
- a time-domain transmission-line airway that carries the airflow and the sound together;
- a glottis driven by its opening area;
- turbulence noise sized by the Reynolds number;
- opening speed limits on the articulators;
- several speech-timing rules.

Version 0.3's feature set also follows that project's feature list and architecture notes. These features were written in our own code:
- beatbox pads and a step sequencer;
- a bestiary of a songbird, a seal, an alligator and an elephant;
- duets;
- male and child bodies;
- falsetto, fry, growl (ventricular folds) and twang (epilarynx);
- trills, ejectives and clicks;
- IPA input, Web MIDI, live singing from the keyboard and a consonant chart;
- a recording chain;
- golden tests;
- tuning against real voices: a real-speaker judge (the TSP speech database) and a real-singer judge (the Children's Song Dataset), with one measured change at a time and an owner's listening checkpoints.

The mechanisms for ejectives (a sealed glottis and a rising larynx) and clicks (two oral seals and a lowering tongue body), and the sung-phrase details (onset consonants at the new note's pitch, phrase breaths, a firmer singing voice), follow the approach its documentation describes. The songbird (van der Pol labia rather than its normal-form model) and the elephant (driven lips into a delay-line trunk) are different models of our own.

The lounge-singer format of the demo videos also comes from its demo: spoken asides, scat, a beatbox break and a closing joke. The lines, melodies and jokes are ours.

No code was copied. A few published physical constants in `engine/src/airway.rs` and `engine/src/voice.rs` have the same values as in that project. They are the air density, sound speed and viscosity, the soft-wall mass, resistance and stiffness, and the critical Reynolds number, and come from the literature cited below (Flanagan 1972; Ishizaka, French and Flanagan 1975).

## CMU Pronouncing Dictionary

The plugin's `runtime/lexicon.txt.gz` (built from `assets/lexicon.txt.gz` in the source repository) is derived from the CMU Pronouncing Dictionary (https://github.com/cmusphinx/cmudict, commit `74790861f652b15e4ac49015a90074ad62a27690`): first pronunciations of alphabetic words, re-encoded by `scripts/build-lexicon.mjs`. Its license is reproduced in `CMUDICT-LICENSE` (in the plugin; `assets/CMUDICT-LICENSE` in the source repository):

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

The portrait (`src/ui/art/nousGirlArt.ts`) is a vector tracing of a side-profile Nous Girl illustration with headphones, supplied by the project owner as the character reference. It was mirrored to face the controls and traced to paths with potrace-style curve fitting. The jaw, mouth, cutaway, airway and handles are original rig layers drawn on top of it. The project owner provided the illustration for this use; its original author and license were not documented with it. Anyone redistributing the plugin should confirm they may use the illustration.

The character belongs to Nous Research (official assets `assets/nous-girl-black.svg` and `assets/nous-girl-white.svg` in https://github.com/NousResearch/hermes-agent, inspected at revision `ee6db222660c84e4ba2cf158108f0e6fed9afe34`). Voice Lab is unofficial: its synthetic voice is a fictional character voice, not an official Nous voice, and nothing here implies endorsement or grants trademark rights.

The hermes-agent MIT notice, for the character reference:

> Copyright (c) 2025 Nous Research
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Scientific background

The engine implements published models in our own code. No code, figures, recordings or data tables from these works are redistributed, except a few published values: the vowel formant means used as calibration targets and the physical constants noted above (factual measurements, cited below).

- J. L. Kelly and C. C. Lochbaum, "Speech synthesis," Proc. 4th Int. Congress on Acoustics, 1962 — scattering-junction tube model.
- J. O. Smith III, *Physical Audio Signal Processing*, CCRMA — digital waveguides, normalized scattering junctions. https://ccrma.stanford.edu/~jos/pasp/
- G. Fant, J. Liljencrants and Q. Lin, "A four-parameter model of glottal flow," STL-QPSR 26(4), 1985 — LF glottal model.
- G. Fant, "The LF-model revisited. Transformations and frequency domain analysis," STL-QPSR 36(2–3), 1995 — Rd parameterization.
- D. H. Klatt and L. C. Klatt, "Analysis, synthesis, and perception of voice quality variations among female and male talkers," JASA 87(2), 1990 — breathiness and aspiration.
- J. L. Flanagan, *Speech Analysis, Synthesis and Perception*, 1972 — turbulence noise, aerodynamics, radiation load, and the air constants.
- K. Ishizaka, J. C. French and J. L. Flanagan, "Direct determination of vocal tract wall impedance," IEEE Trans. ASSP 23(4), 1975 — soft-wall mass, resistance and stiffness.
- J. Hillenbrand, L. A. Getty, M. J. Clark and K. Wheeler, "Acoustic characteristics of American English vowels," JASA 97(5), 1995 — adult-female mean F1–F3 used as calibration targets (`engine/src/bin/calibrate.rs`).
- S. E. G. Öhman, "Coarticulation in VCV utterances," JASA 39(1), 1966 — vowel-to-vowel trajectory with superimposed consonant gestures.
- E. L. Saltzman and K. G. Munhall, "A dynamical approach to gestural patterning in speech production," Ecological Psychology 1(4), 1989 — critically damped articulator dynamics.
- D. H. Klatt, "Synthesis by rule of segmental durations in English sentences," 1979 — context-dependent duration rules. Some inherent durations equal Klatt's published values; others were tuned for this voice.
- D. Murphy, M. Jani and S. Ternström, "Articulatory vocal tract synthesis in SuperCollider," DAFx 2015. https://dafx.de/paper-archive/details/eHg8j1Dj_oAGb2pGTuyaJQ
- A. Weitz, I. Steiner and P. Birkholz, "Gesture-based articulatory text-to-speech synthesis," ESSV 2017. https://www.dfki.de/en/web/research/projects-and-publications/publication/9202
- H. Choi, "Audio worklet design pattern." https://developer.chrome.com/blog/audio-worklet-design-pattern

## Software

The desktop bundle uses the React runtime and `@hermes/plugin-sdk` supplied by Hermes Desktop; neither is bundled. Build and test tools (TypeScript, esbuild, Vite, Playwright, React DOM for the standalone preview) are development dependencies only. The Rust engine has no external crates.
