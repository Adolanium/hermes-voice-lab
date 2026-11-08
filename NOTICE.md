# Sources and notices

The instrument's source, tract calibration, gesture lexicon, melodies, and side-profile drawing were authored for Hermes Voice Lab. No speech samples, pretrained models, pronunciation dictionaries, or measured speaker data are bundled.

## Nous Girl

The editable portrait interprets the Nous Girl character published by Nous Research. Its paths were drawn for this product after inspecting the official black and white SVG references. Character attribution is separate from authorship of this drawing and the synthesis code. This is an unofficial instrument and fictional synthetic voice, not an official Nous voice.

References: https://github.com/NousResearch/hermes-agent/blob/ee6db222660c84e4ba2cf158108f0e6fed9afe34/assets/nous-girl-black.svg and the corresponding nous-girl-white.svg. The repository publishes these under its root MIT license; no separate asset license was found in the inspected checkout. This does not grant trademark rights or imply endorsement.

Copyright (c) 2025 Nous Research

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Scientific background

- Murphy, Jani, and Ternström, *Articulatory vocal tract synthesis in Supercollider*, DAFx 2015. https://dafx.de/paper-archive/details/eHg8j1Dj_oAGb2pGTuyaJQ
- Weitz, Steiner, and Birkholz, *Gesture-Based Articulatory Text-to-Speech Synthesis*, ESSV 2017. https://www.dfki.de/en/web/research/projects-and-publications/publication/9202
- Julius O. Smith III, *Physical Audio Signal Processing*, digital waveguide theory. https://ccrma.stanford.edu/~jos/pasp/
- Hongchan Choi, *Audio worklet design pattern*. https://developer.chrome.com/blog/audio-worklet-design-pattern

These inform the design. Their code, figures, anatomical measurements, and calibration tables are not redistributed.

## Runtime dependencies

The desktop build uses Hermes' provided React runtime and plugin SDK. The standalone development preview installs React and React DOM, MIT licensed by Meta Platforms, Inc. and affiliates. npm retains dependency notices in installed packages. esbuild, TypeScript, Vite, and Playwright are build/test tools, not required by the installed desktop bundle. The Rust engine has no external crates.
