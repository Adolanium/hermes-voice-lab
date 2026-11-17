// src/cli/render.ts
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// src/core/params.ts
var PARAM_NAMES = [
  "pitch",
  "loudness",
  "gate",
  "tenseness",
  "breath",
  "voicing",
  "vibratoDepth",
  "vibratoRate",
  "tongueX",
  "tongueY",
  "tipPlace",
  "tipClose",
  "dorsumClose",
  "jaw",
  "lipOpen",
  "lipRound",
  "velum",
  "tractLength",
  "throat",
  "gain",
  "humanize",
  "space",
  "lateral",
  "rhotic",
  "register",
  "fry",
  "growl",
  "twang",
  "pharynx",
  "trill",
  "glottal",
  "larynx",
  "suction",
  "mic",
  "eqLow",
  "eqMid",
  "eqHigh",
  "comp",
  "drive",
  "creature",
  "harmony"
];
var META = {
  pitch: ["Pitch", "Hz", "source", "Fundamental frequency of the vocal folds."],
  loudness: ["Effort", "", "source", "Lung pressure. More effort is louder and slightly brighter."],
  gate: ["Gate", "", "internal", "Note on/off envelope."],
  tenseness: ["Tension", "", "source", "Glottal pulse shape (LF Rd). Low is lax and soft, high is pressed and bright."],
  breath: ["Breath", "", "source", "Glottal leak and aspiration noise."],
  voicing: ["Voicing", "", "source", "Vocal-fold adduction. 0 opens the glottis for whisper or voiceless sounds."],
  vibratoDepth: ["Vibrato", "", "source", "Vibrato depth (up to \xB185 cents)."],
  vibratoRate: ["Vibrato rate", "Hz", "source", "Vibrato speed."],
  tongueX: ["Tongue front", "", "tract", "Tongue body position, back (0) to front (1)."],
  tongueY: ["Tongue height", "", "tract", "Tongue body height, low (0) to high (1)."],
  tipPlace: ["Tip place", "", "tract", "Tongue tip target, teeth (0) to behind the ridge (1)."],
  tipClose: ["Tip closure", "", "tract", "Tongue tip constriction. 1 seals the tract."],
  dorsumClose: ["Back closure", "", "tract", "Tongue back against the soft palate (k, g, ng)."],
  jaw: ["Jaw", "", "tract", "Jaw opening."],
  lipOpen: ["Lips open", "", "tract", "Lip aperture. 0 closes the lips."],
  lipRound: ["Lip round", "", "tract", "Rounding and protrusion; lengthens the tract."],
  velum: ["Nasal", "", "tract", "Velum opening; couples the nasal cavity."],
  tractLength: ["Tract length", "cm", "tract", "Overall vocal tract length (size), excluding lip protrusion."],
  throat: ["Throat", "", "tract", "Pharynx width (tongue root). Wider is darker and warmer."],
  gain: ["Output", "", "output", "Output level."],
  humanize: ["Humanize", "", "source", "Jitter, shimmer and slow pitch drift."],
  space: ["Room", "", "output", "Small room reverberation."],
  lateral: ["Lateral", "", "internal", "Side channel around the tongue tip for l."],
  rhotic: ["Rhotic", "", "tract", "Bunched-r narrowing of pharynx and palate; lowers F3."],
  register: ["Falsetto", "", "source", "Vocal register, chest (0) to falsetto (1): thin, never fully closed folds. Flip it fast for a yodel."],
  fry: ["Fry", "", "source", "Vocal fry: paired, irregular, creaky pulses."],
  growl: ["Growl", "", "source", "Ventricular folds flapping at half the pitch: a rough growl."],
  twang: ["Twang", "", "source", "Narrowed epilarynx: a bright, ringing, nasal-sounding twang."],
  trill: ["Trill", "", "tract", "The narrowest constriction (tongue tip, lips or uvula) flaps in the airflow about 27 times a second."],
  glottal: ["Glottal closure", "", "internal", "The vocal folds pressed shut: a glottal stop, and the seal behind an ejective."],
  larynx: ["Larynx raise", "", "internal", "The larynx rises like a piston and squeezes the pharynx (ejectives)."],
  suction: ["Tongue suction", "", "internal", "The tongue body pulls down between two oral seals (clicks)."],
  mic: ["Mic distance", "", "output", "Close: proximity bass and a bit louder. Far: thinner, duller, quieter and roomier. 0.4 is neutral."],
  eqLow: ["Low", "dB", "output", "EQ low shelf at 220 Hz."],
  eqMid: ["Mid", "dB", "output", "EQ peak at 1.6 kHz."],
  eqHigh: ["High", "dB", "output", "EQ high shelf at 5.5 kHz."],
  comp: ["Compressor", "", "output", "Evens out the level (threshold falls and ratio rises with the amount)."],
  drive: ["Drive", "", "output", "Tape-style saturation (tanh)."],
  creature: ["Creature", "", "internal", "Sound source: 0 the human airway, 1 a songbird syrinx, 2 an elephant trumpet."],
  harmony: ["Second voice", "", "internal", "Songbird: the syrinx's second side sings (1 + this) \xD7 the pitch."],
  pharynx: ["Pharynx", "\xD7", "tract", "Throat length relative to the mouth: longer in adult men (\u22481.15), shorter in children (\u22480.85)."]
};
var RANGES = {
  pitch: [50, 1100, 210],
  loudness: [0, 1, 0.72],
  gate: [0, 1, 0],
  tenseness: [0, 1, 0.4],
  breath: [0, 1, 0.15],
  voicing: [0, 1, 1],
  vibratoDepth: [0, 1, 0.18],
  vibratoRate: [3, 9, 5.4],
  tongueX: [0, 1, 0.36],
  tongueY: [0, 1, 0.3],
  tipPlace: [0, 1, 0.35],
  tipClose: [0, 1, 0],
  dorsumClose: [0, 1, 0],
  jaw: [0, 1, 0.62],
  lipOpen: [0, 1, 0.62],
  lipRound: [0, 1, 0.12],
  velum: [0, 1, 0],
  tractLength: [11, 32, 14.2],
  throat: [0, 1, 0.5],
  gain: [0, 1, 0.7],
  humanize: [0, 1, 0.45],
  space: [0, 1, 0.18],
  lateral: [0, 1, 0],
  rhotic: [0, 1, 0],
  register: [0, 1, 0],
  fry: [0, 1, 0],
  growl: [0, 1, 0],
  twang: [0, 1, 0],
  pharynx: [0.75, 1.3, 1],
  trill: [0, 1, 0],
  glottal: [0, 1, 0],
  larynx: [0, 1, 0],
  suction: [0, 1, 0],
  mic: [0, 1, 0.4],
  eqLow: [-12, 12, 0],
  eqMid: [-12, 12, 0],
  eqHigh: [-12, 12, 0],
  comp: [0, 1, 0],
  drive: [0, 1, 0],
  creature: [0, 2, 0],
  harmony: [0, 1, 0]
};
var PARAMS = PARAM_NAMES.map((name, id) => {
  const [min, max, def] = RANGES[name];
  const [label, unit, group, help] = META[name];
  return { name, id, min, max, default: def, label, unit, group, help };
});
var PARAM_ID = Object.fromEntries(PARAM_NAMES.map((n2, i) => [n2, i]));
function isParamName(name) {
  return PARAM_NAMES.includes(name);
}
function defaultPatch() {
  return Object.fromEntries(PARAMS.map((p) => [p.name, p.default]));
}
function validatePatch(input, label = "patch") {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) throw new TypeError(`${label} must be an object`);
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isParamName(key)) throw new TypeError(`Unknown parameter "${key}"`);
    const spec = PARAMS[PARAM_ID[key]];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${key} must be a finite number`);
    if (value < spec.min || value > spec.max) throw new RangeError(`${key} must be between ${spec.min} and ${spec.max}`);
    out[key] = value;
  }
  return out;
}
function clampParam(name, value) {
  const s = PARAMS[PARAM_ID[name]];
  return Number.isFinite(value) ? Math.min(s.max, Math.max(s.min, value)) : s.default;
}
var VOICE_PARAMS = [
  "pitch",
  "loudness",
  "tenseness",
  "breath",
  "vibratoDepth",
  "vibratoRate",
  "tractLength",
  "throat",
  "gain",
  "humanize",
  "space",
  "register",
  "fry",
  "growl",
  "twang",
  "pharynx",
  "mic",
  "eqLow",
  "eqMid",
  "eqHigh",
  "comp",
  "drive"
];
var midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

// src/core/engine.ts
var N_SECTIONS = 44;
var RESPONSE_BINS = 256;
var STATE = {
  internalRate: 0,
  length: 1,
  minArea: 2,
  minIndex: 3,
  nasalArea: 4,
  oralPressure: 5,
  frication: 6,
  voicing: 7,
  f0: 8,
  rms: 9,
  peak: 10,
  rd: 11,
  flow: 12,
  playing: 13,
  position: 14,
  resets: 15,
  aspiration: 16,
  burst: 17,
  scoreLength: 18,
  noiseIndex: 19,
  airflow: 20,
  nasalShare: 21,
  closed: 22
};
var STATE_LEN = 23;
var NASAL_SECTIONS = 30;
var ENERGY_LEN = N_SECTIONS + NASAL_SECTIONS;
function compileScore(events, length) {
  const out = new Float32Array(events.length * 4);
  let end = 0;
  events.forEach(([t, name, v, tau], i) => {
    out[i * 4] = t;
    out[i * 4 + 1] = PARAM_ID[name];
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = tau;
    end = Math.max(end, t);
  });
  return { events: out, length: length ?? end + 0.4 };
}
var Engine = class {
  sampleRate;
  e;
  constructor(module2, sampleRate, seed2 = 1) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8e3 || sampleRate > 192e3) throw new RangeError("Sample rate must be 8000\u2013192000 Hz");
    this.e = new WebAssembly.Instance(module2, {}).exports;
    this.sampleRate = sampleRate;
    this.e.engine_init(sampleRate, seed2 >>> 0 || 1);
    if (this.e.engine_param_count() !== PARAM_NAMES.length) throw new Error("Engine parameter table mismatch");
  }
  /** Engine-reported [min, max, default] for each parameter. */
  specs() {
    return PARAMS.map((p) => Array.from(this.f32(this.e.param_spec(p.id), 4)));
  }
  set(name, value, tauMs = -1) {
    this.e.engine_set(PARAM_ID[name], value, tauMs);
  }
  jump(name, value) {
    this.e.engine_jump(PARAM_ID[name], value);
  }
  apply(patch, tauMs = -1) {
    for (const [k, v] of Object.entries(patch)) if (typeof v === "number") this.set(k, v, tauMs);
  }
  jumpAll(patch) {
    for (const [k, v] of Object.entries(patch)) if (typeof v === "number") this.jump(k, v);
  }
  /** Render up to 4096 frames; returns views into WASM memory (copy before next call). */
  render(frames) {
    const n2 = this.e.engine_render(Math.max(0, Math.min(4096, frames | 0)));
    return [this.f32(this.e.engine_out_left(), n2), this.f32(this.e.engine_out_right(), n2)];
  }
  params() {
    return this.f32(this.e.engine_params(), PARAM_NAMES.length).slice();
  }
  areas() {
    return this.f32(this.e.engine_areas(), N_SECTIONS).slice();
  }
  state() {
    return this.f32(this.e.engine_state(), STATE_LEN).slice();
  }
  /** Smoothed sound-wave amplitude per section (oral 0..43, then nasal), for display. */
  energy() {
    return this.f32(this.e.engine_energy(), ENERGY_LEN).slice();
  }
  glottalShape(points = 96) {
    return this.f32(this.e.engine_glottal_shape(points), points).slice();
  }
  get scoreCapacity() {
    return this.e.score_capacity();
  }
  loadScore(score) {
    const capacity = this.scoreCapacity;
    const count = Math.min(capacity, score.events.length / 4);
    this.f32(this.e.score_staging(), count * 4).set(score.events.subarray(0, count * 4));
    return this.e.score_load(count, score.length);
  }
  play(loop = false) {
    this.e.score_play(loop ? 1 : 0);
  }
  stop() {
    this.e.score_stop();
  }
  /** Area function, nasal coupling and length for an arbitrary parameter set. */
  shapeFor(values) {
    const input = this.f32(this.e.analysis_input(), PARAM_NAMES.length);
    input.set(values);
    const out = this.f32(this.e.shape_from_params(), N_SECTIONS + 2);
    return { areas: out.slice(0, N_SECTIONS), nasal: out[N_SECTIONS], length: out[N_SECTIONS + 1] };
  }
  /** Modeled transfer function and resonances of a frozen tract shape. */
  analyze(areas, nasal, length) {
    this.f32(this.e.analysis_input(), N_SECTIONS).set(areas);
    const out = this.f32(this.e.analyze(nasal, length), RESPONSE_BINS + 10);
    const formants = [];
    for (let k = 0; k < 5; k++) {
      const f = out[RESPONSE_BINS + 2 * k];
      if (f > 0) formants.push({ frequency: f, bandwidth: out[RESPONSE_BINS + 2 * k + 1] });
    }
    return { magnitude: out.slice(0, RESPONSE_BINS), formants };
  }
  f32(ptr, len) {
    return new Float32Array(this.e.memory.buffer, ptr, len);
  }
};
function renderInto(engine, left2, right2, start, end) {
  for (let at = start; at < end; ) {
    const [l, r] = engine.render(Math.min(1024, end - at));
    left2.set(l, at);
    right2.set(r, at);
    at += l.length;
  }
}
function renderScore(engine, score, patch = {}, tail = 0.6) {
  engine.jumpAll(patch);
  engine.loadScore(score);
  engine.play(false);
  const total = Math.ceil((score.length + tail) * engine.sampleRate);
  const left2 = new Float32Array(total);
  const right2 = new Float32Array(total);
  renderInto(engine, left2, right2, 0, total);
  return [left2, right2];
}

// src/core/direction.ts
function wordKey(text) {
  return text.normalize("NFC").toLowerCase().replace(/^\[|\]$/g, "").replace(/[-.,!?:;“”"]/g, "");
}
function lyricWords(lyrics) {
  const counts = /* @__PURE__ */ new Map();
  return lyrics.trim().split(/\s+/).flatMap((label, index) => {
    const word = wordKey(label);
    if (!word || word === "_") return [];
    const occurrence = (counts.get(word) ?? 0) + 1;
    counts.set(word, occurrence);
    return [{ word, occurrence, label, index }];
  });
}
function sameWord(a, b) {
  return a.word === b.word && a.occurrence === b.occurrence;
}
function validateDirections(raw) {
  if (raw === void 0) return [];
  if (!Array.isArray(raw) || raw.length > 256) throw new TypeError("Expected up to 256 word directions");
  const out = [];
  for (const d of raw) {
    const occurrence = d?.occurrence === void 0 ? 1 : d.occurrence;
    if (!d || typeof d.word !== "string" || !wordKey(d.word) || d.word.length > 120 || /\s/.test(d.word) || !Number.isInteger(occurrence) || occurrence < 1 || occurrence > 2048 || Object.keys(d).some((k) => !["word", "occurrence", "slide", "swell", "vibratoAt"].includes(k))) throw new TypeError("Invalid word direction");
    const dir = { word: wordKey(d.word), occurrence };
    for (const k of ["slide", "swell"]) {
      if (d[k] !== void 0 && typeof d[k] !== "boolean") throw new TypeError(k + " must be boolean");
      if (d[k]) dir[k] = true;
    }
    if (d.vibratoAt !== void 0) {
      if (!Number.isFinite(d.vibratoAt) || d.vibratoAt < 0 || d.vibratoAt > 1) throw new RangeError("vibratoAt must be 0\u20131");
      dir.vibratoAt = d.vibratoAt;
    }
    if (out.some((x) => sameWord(x, dir))) throw new TypeError("Duplicate word direction");
    out.push(dir);
  }
  return out;
}

// src/core/vowels.generated.json
var vowels_generated_default = {
  IY: { params: { tongueX: 1, tongueY: 0.907, jaw: 0.246, lipOpen: 0.983, lipRound: 0, throat: 0.411 }, model: [424, 2617, 3020], target: [437, 2761, 3372] },
  IH: { params: { tongueX: 1, tongueY: 0.724, jaw: 0.371, lipOpen: 0.842, lipRound: 0, throat: 0.34 }, model: [478, 2341, 2916], target: [483, 2365, 3053] },
  EY: { params: { tongueX: 1, tongueY: 0.828, jaw: 0.481, lipOpen: 1, lipRound: 0, throat: 0.026 }, model: [519, 2415, 2860], target: [536, 2530, 3047] },
  EH: { params: { tongueX: 1, tongueY: 0.285, jaw: 0.715, lipOpen: 1, lipRound: 0, throat: 0 }, model: [689, 1921, 2948], target: [731, 2058, 2979] },
  AE: { params: { tongueX: 1, tongueY: 0.084, jaw: 0.913, lipOpen: 0.999, lipRound: 0, throat: 0 }, model: [773, 1797, 3032], target: [860, 2050, 2850] },
  AA: { params: { tongueX: 0.049, tongueY: 0, jaw: 0.967, lipOpen: 0.96, lipRound: 0, throat: 0 }, model: [877, 1309, 2745], target: [900, 1300, 2810] },
  AO: { params: { tongueX: 0, tongueY: 0.138, jaw: 0.785, lipOpen: 0.706, lipRound: 0.363, throat: 0 }, model: [759, 1153, 2761], target: [781, 1136, 2824] },
  OW: { params: { tongueX: 0.018, tongueY: 0.673, jaw: 0.52, lipOpen: 0.375, lipRound: 0.836, throat: 0 }, model: [553, 1041, 2834], target: [555, 1035, 2828] },
  UH: { params: { tongueX: 0.217, tongueY: 0.683, jaw: 0.417, lipOpen: 0.466, lipRound: 0.6, throat: 0.484 }, model: [519, 1241, 2827], target: [519, 1225, 2827] },
  UW: { params: { tongueX: 0.065, tongueY: 0.807, jaw: 0.355, lipOpen: 0.349, lipRound: 0.91, throat: 0.492 }, model: [459, 1105, 2716], target: [459, 1105, 2735] },
  AH: { params: { tongueX: 0.898, tongueY: 0, jaw: 0.659, lipOpen: 0.423, lipRound: 0.316, throat: 1e-3 }, model: [692, 1407, 2963], target: [690, 1400, 2900] },
  ER: { params: { tongueX: 0.109, tongueY: 0.972, jaw: 0.404, lipOpen: 0.535, lipRound: 0.36, throat: 0.011, rhotic: 0.827 }, model: [522, 1583, 1932], target: [523, 1588, 1929] }
};

// src/core/phonemes.ts
var V = vowels_generated_default;
var vowel = (s) => ({ ...V[s].params, rhotic: V[s].params.rhotic ?? 0 });
var SCHWA = { tongueX: 0.5, tongueY: 0.32, jaw: 0.5, lipOpen: 0.62, lipRound: 0.12, throat: 0.4, rhotic: 0 };
var PALATAL_BODY = { tongueX: 1, tongueY: 0.95 };
var P = (symbol, ipa, manner, voiced, duration, target, example, offglide) => ({ symbol, ipa, manner, voiced, duration, target, example, offglide });
var PHONEMES = Object.fromEntries([
  P("AA", "\u0251", "vowel", true, 150, vowel("AA"), "father"),
  P("AE", "\xE6", "vowel", true, 172, vowel("AE"), "cat"),
  P("AH", "\u028C", "vowel", true, 106, vowel("AH"), "cup"),
  P("AO", "\u0254", "vowel", true, 150, vowel("AO"), "thought"),
  P("EH", "\u025B", "vowel", true, 121, vowel("EH"), "bed"),
  P("ER", "\u025D", "vowel", true, 158, vowel("ER"), "bird"),
  P("IH", "\u026A", "vowel", true, 90, vowel("IH"), "sit"),
  P("IY", "i", "vowel", true, 130, vowel("IY"), "see"),
  P("UH", "\u028A", "vowel", true, 95, vowel("UH"), "book"),
  P("UW", "u", "vowel", true, 118, vowel("UW"), "blue"),
  // Plain vowels English lacks. [e] is the nucleus of EY without its glide. The back vowels
  // are further back and rounder than English's (shapes chosen with engine/src/bin/areas.rs,
  // modeled F1/F2 in Hz): [o] 421/915, [u] 394/981, Korean 어 644/1078. The close back vowel
  // with spread lips (Korean 으) comes out at 493/1446 only with the lips half rounded.
  P("E", "e", "vowel", true, 125, vowel("EY"), "Spanish mesa"),
  P("O", "o", "vowel", true, 125, { tongueX: 0, tongueY: 0.6, jaw: 0.5, lipOpen: 0.22, lipRound: 1, throat: 0.2, rhotic: 0 }, "Spanish como"),
  P("U", "u", "vowel", true, 115, { tongueX: 0.07, tongueY: 0.81, jaw: 0.35, lipOpen: 0.2, lipRound: 1, throat: 0.49, rhotic: 0 }, "Korean \uC6B0"),
  P("EO", "\u028C\u0339", "vowel", true, 125, { tongueX: 0, tongueY: 0.5, jaw: 0.6, lipOpen: 0.45, lipRound: 0.6, throat: 0, rhotic: 0 }, "Korean \uC5B4"),
  P("UU", "\u026F", "vowel", true, 110, { tongueX: 0.1, tongueY: 0.95, jaw: 0.28, lipOpen: 0.3, lipRound: 0.35, throat: 0.6, rhotic: 0 }, "Korean \uC73C"),
  P("EY", "e\u026A", "diphthong", true, 160, vowel("EY"), "day", vowel("IY")),
  P("OW", "o\u028A", "diphthong", true, 148, vowel("OW"), "go", vowel("UH")),
  P("AY", "a\u026A", "diphthong", true, 190, vowel("AA"), "my", vowel("IH")),
  P("AW", "a\u028A", "diphthong", true, 210, vowel("AA"), "now", vowel("UH")),
  P("OY", "\u0254\u026A", "diphthong", true, 200, vowel("AO"), "boy", vowel("IY")),
  P("P", "p", "stop", false, 70, { lipOpen: 0 }, "pen"),
  P("B", "b", "stop", true, 70, { lipOpen: 0 }, "bed"),
  P("T", "t", "stop", false, 60, { tipPlace: 0.38, tipClose: 1 }, "top"),
  P("D", "d", "stop", true, 60, { tipPlace: 0.38, tipClose: 1 }, "day"),
  P("DX", "\u027E", "stop", true, 31, { tipPlace: 0.38, tipClose: 1 }, "butter"),
  P("K", "k", "stop", false, 73, { dorsumClose: 1 }, "cat"),
  P("G", "g", "stop", true, 70, { dorsumClose: 1 }, "go"),
  P("M", "m", "nasal", true, 75, { lipOpen: 0, velum: 1 }, "me"),
  P("N", "n", "nasal", true, 65, { tipPlace: 0.38, tipClose: 1, velum: 1 }, "no"),
  P("NG", "\u014B", "nasal", true, 62, { dorsumClose: 1, velum: 1 }, "sing"),
  P("F", "f", "fricative", false, 100, { lipOpen: 0.098, lipRound: 0 }, "fine"),
  P("V", "v", "fricative", true, 58, { lipOpen: 0.107, lipRound: 0 }, "very"),
  P("TH", "\u03B8", "fricative", false, 100, { tipPlace: 0, tipClose: 0.8 }, "think"),
  P("DH", "\xF0", "fricative", true, 50, { tipPlace: 0, tipClose: 0.794 }, "this"),
  P("S", "s", "fricative", false, 110, { tipPlace: 0.18, tipClose: 0.834, jaw: 0.3 }, "see"),
  P("Z", "z", "fricative", true, 92, { tipPlace: 0.18, tipClose: 0.828, jaw: 0.3 }, "zoo"),
  P("SH", "\u0283", "fricative", false, 115, { tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55, jaw: 0.3 }, "she"),
  P("ZH", "\u0292", "fricative", true, 90, { tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55, jaw: 0.3 }, "vision"),
  P("CH", "t\u0283", "affricate", false, 115, { tipPlace: 0.7, tipClose: 1, lipRound: 0.5, jaw: 0.3 }, "chair"),
  P("JH", "d\u0292", "affricate", true, 112, { tipPlace: 0.7, tipClose: 1, lipRound: 0.5, jaw: 0.3 }, "joy"),
  P("L", "l", "approximant", true, 70, { tipPlace: 0.38, tipClose: 1, lateral: 1, tongueX: 0.3, tongueY: 0.5 }, "love"),
  // Non-English sounds (not in ARPABET): a glottal stop, ejectives (the larynx is the
  // piston) and clicks (the tongue body pulls a vacuum between two seals).
  P("Q", "\u0294", "stop", true, 60, { glottal: 1 }, "uh-oh"),
  P("PE", "p\u02BC", "stop", false, 95, { lipOpen: 0, glottal: 1, larynx: 1 }, "ejective p"),
  P("TE", "t\u02BC", "stop", false, 95, { tipPlace: 0.38, tipClose: 1, glottal: 1, larynx: 1 }, "ejective t"),
  P("KE", "k\u02BC", "stop", false, 95, { dorsumClose: 1, glottal: 1, larynx: 1 }, "ejective k"),
  P("CB", "\u0298", "click", false, 85, { lipOpen: 0, dorsumClose: 1, suction: 1 }, "kiss click"),
  P("CD", "\u01C0", "click", false, 85, { tipPlace: 0.05, tipClose: 1, dorsumClose: 1, suction: 1 }, "tsk"),
  P("CA", "\u01C3", "click", false, 85, { tipPlace: 0.42, tipClose: 1, dorsumClose: 1, suction: 1 }, "cork pop"),
  // Trills (not in ARPABET): a rolled tongue-tip r, a lip trill and a uvular r.
  P("RR", "r", "trill", true, 110, { tipPlace: 0.42, tipClose: 0.9, trill: 1, jaw: 0.35 }, "Spanish perro"),
  P("BR", "\u0299", "trill", true, 160, { lipOpen: 0.04, lipRound: 0.25, trill: 1 }, "brr"),
  P("RU", "\u0280", "trill", true, 110, { dorsumClose: 0.9, tongueX: 0.02, tongueY: 0.55, trill: 1 }, "French rouge"),
  P("R", "\u0279", "approximant", true, 70, { rhotic: 0.88, lipRound: 0.7, tongueX: 0.11, tongueY: 0.97, lipOpen: 0.5 }, "red"),
  P("W", "w", "approximant", true, 65, { lipOpen: 0.15, lipRound: 1, tongueX: 0, tongueY: 0.9 }, "we"),
  P("Y", "j", "approximant", true, 60, { tongueX: 1, tongueY: 1, jaw: 0.35 }, "yes"),
  P("HH", "h", "aspirate", false, 65, { voicing: 0 }, "hat"),
  // Sibilants made behind the alveolar ridge in two more ways (Korean, Mandarin, Polish,
  // Russian): alveolo-palatal, with the tongue body up at the hard palate and the lips spread,
  // and retroflex, further back with a larger space under the tongue. Each has its affricates.
  P("SC", "\u0255", "fricative", false, 115, { tipPlace: 0.6, tipClose: 0.82, lipRound: 0, jaw: 0.3, ...PALATAL_BODY }, "Mandarin \u897F"),
  P("ZC", "\u0291", "fricative", true, 90, { tipPlace: 0.6, tipClose: 0.815, lipRound: 0, jaw: 0.3, ...PALATAL_BODY }, "Polish ziemia"),
  P("CC", "t\u0255", "affricate", false, 110, { tipPlace: 0.55, tipClose: 1, lipRound: 0, jaw: 0.3, ...PALATAL_BODY }, "Korean \uC790"),
  P("JC", "d\u0291", "affricate", true, 105, { tipPlace: 0.55, tipClose: 1, lipRound: 0, jaw: 0.3, ...PALATAL_BODY }, "Japanese \u3058"),
  P("SR", "\u0282", "fricative", false, 115, { tipPlace: 1, tipClose: 0.815, lipRound: 0.3, jaw: 0.32, tongueX: 0.3, tongueY: 0.45 }, "Mandarin \u662F"),
  P("ZR", "\u0290", "fricative", true, 90, { tipPlace: 1, tipClose: 0.815, lipRound: 0.3, jaw: 0.32, tongueX: 0.3, tongueY: 0.45 }, "Polish \u017Cona"),
  P("CR", "t\u0282", "affricate", false, 115, { tipPlace: 0.95, tipClose: 1, lipRound: 0.3, jaw: 0.32, tongueX: 0.3, tongueY: 0.45 }, "Mandarin \u77E5"),
  P("JR", "d\u0290", "affricate", true, 110, { tipPlace: 0.95, tipClose: 1, lipRound: 0.3, jaw: 0.32, tongueX: 0.3, tongueY: 0.45 }, "Polish d\u017Cem"),
  // The glide of French huit and Mandarin 月: the tongue of [j] with the lips of [w].
  P("YW", "\u0265", "approximant", true, 60, { tongueX: 1, tongueY: 1, jaw: 0.35, lipOpen: 0.15, lipRound: 1 }, "French huit")
].map((p) => [p.symbol, p]));
var PALATAL = PALATAL_BODY;
var SOFT_EXAMPLES = {
  P: "Russian \u043F\u044F\u0442\u044C",
  B: "Russian \u0431\u0438\u0442\u044C",
  T: "Russian \u0442\u0451\u0442\u044F",
  D: "Russian \u0434\u044F\u0434\u044F",
  K: "Russian \u043A\u0438\u0442",
  G: "Russian \u0433\u0438\u0434",
  M: "Russian \u043C\u044F\u0442\u044C",
  N: "Russian \u043D\u0435\u0442",
  F: "Russian \u043A\u043E\u0444\u0435",
  V: "Russian \u0432\u0435\u0441",
  S: "Russian \u0441\u044F\u0434\u044C",
  Z: "Russian \u0437\u0438\u043C\u0430",
  L: "Russian \u043B\u0435\u0441",
  RR: "Russian \u0440\u0435\u043A\u0430"
};
for (const [base, example] of Object.entries(SOFT_EXAMPLES)) {
  const p = PHONEMES[base];
  const { tongueX: _x, tongueY: _y, ...target } = p.target;
  const duration = base === "T" || base === "D" ? p.duration + 35 : p.duration;
  PHONEMES[`${base}J`] = { ...p, symbol: `${base}J`, ipa: `${p.ipa}\u02B2`, target, duration, example, palatalized: true };
}
var PALATALIZABLE = Object.keys(SOFT_EXAMPLES);
var AFFRICATE_RELEASE = {
  TJ: { tipPlace: 0.5, tipClose: 0.83 },
  DJ: { tipPlace: 0.5, tipClose: 0.83 },
  CH: { tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55 },
  JH: { tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55 },
  CC: { tipPlace: 0.6, tipClose: 0.82 },
  JC: { tipPlace: 0.6, tipClose: 0.815 },
  CR: { tipPlace: 1, tipClose: 0.815 },
  JR: { tipPlace: 1, tipClose: 0.815 }
};
var VOWEL_SYMBOLS = Object.values(PHONEMES).filter((p) => p.manner === "vowel" || p.manner === "diphthong").map((p) => p.symbol);
var CONSONANT_SYMBOLS = Object.values(PHONEMES).filter((p) => !VOWEL_SYMBOLS.includes(p.symbol)).map((p) => p.symbol);
var isVowel = (symbol) => VOWEL_SYMBOLS.includes(symbol);
var MARK_KEYS = ["aspirated", "vot", "nasalized", "breathy", "unreleased"];
function marksOf(p) {
  const out = {};
  for (const k of MARK_KEYS) if (p[k] !== void 0) out[k] = p[k];
  return out;
}
function parsePhone(token) {
  const m = /^([A-Z]{1,3})([012])?([~^=%-]*)$/.exec(token.trim().toUpperCase());
  if (!m || !PHONEMES[m[1]]) return null;
  const phone = { symbol: m[1], stress: isVowel(m[1]) ? Number(m[2] ?? 1) : 0 };
  for (const c of m[3]) {
    if (c === "^") phone.aspirated = true;
    else if (c === "=") phone.aspirated = false;
    else if (c === "~") phone.nasalized = true;
    else if (c === "%") phone.breathy = true;
    else if (c === "-") phone.unreleased = true;
  }
  return phone;
}
function vowelTarget(phone) {
  if (phone.symbol === "AH" && phone.stress === 0) return SCHWA;
  if (phone.symbol === "ER" && phone.stress === 0) return { ...PHONEMES.ER.target, rhotic: 0.7 };
  return PHONEMES[phone.symbol].target;
}
var VOWEL_CALIBRATION = Object.entries(V).map(([symbol, row]) => ({ symbol, model: row.model, target: row.target }));

// src/core/russian.ts
var vowels = { \u0430: "AA", \u044F: "AA", \u043E: "O", \u0451: "O", \u0443: "U", \u044E: "U", \u044D: "EH", \u0435: "EH", \u0438: "IY", \u044B: "IH" };
var consonants = {
  \u0431: "B",
  \u0432: "V",
  \u0433: "G",
  \u0434: "D",
  \u0436: "ZR",
  \u0437: "Z",
  \u0439: "Y",
  \u043A: "K",
  \u043B: "L",
  \u043C: "M",
  \u043D: "N",
  \u043F: "P",
  \u0440: "RR",
  \u0441: "S",
  \u0442: "T",
  \u0444: "F",
  \u0445: "HH",
  \u0446: "T S",
  \u0447: "CC",
  \u0448: "SR",
  \u0449: "SC"
};
var final = { B: "P", V: "F", G: "K", D: "T", ZR: "SR", Z: "S" };
var isRussian = (word) => /[а-яё]/i.test(word);
function russianPhones(word) {
  const chars = [
    ...word.toLowerCase().normalize("NFC").replace(/[^а-яё\u0301]/g, "")
  ];
  const phones2 = [];
  const stressed = chars.some((c) => c === "\u0451" || c === "\u0301");
  const letters = chars.filter((c) => c !== "\u0301");
  let index = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === "\u0301") continue;
    const prev = letters[index - 1], next = letters[++index];
    if (vowels[c]) {
      if ("\u0435\u0451\u044E\u044F".includes(c) && (!prev || vowels[prev] || /[ъь]/.test(prev))) phones2.push({ symbol: "Y", stress: 0 });
      const strong = c === "\u0451" || chars[i + 1] === "\u0301";
      const symbol = stressed && !strong && c === "\u043E" ? "AH" : vowels[c];
      phones2.push({ symbol, stress: strong || !stressed ? 1 : 0 });
    } else if (consonants[c]) {
      for (let symbol of consonants[c].split(" ")) {
        if (!next || index + 1 === letters.length && next === "\u044C") symbol = final[symbol] ?? symbol;
        if (next && "\u0435\u0451\u0438\u044E\u044F\u044C".includes(next) && PALATALIZABLE.includes(symbol)) symbol += "J";
        phones2.push({ symbol, stress: 0 });
      }
    }
  }
  return phones2;
}

// src/core/korean.ts
var INITIALS = [..."\u3131\u3132\u3134\u3137\u3138\u3139\u3141\u3142\u3143\u3145\u3146\u3147\u3148\u3149\u314A\u314B\u314C\u314D\u314E"];
var MEDIALS = [..."\u314F\u3150\u3151\u3152\u3153\u3154\u3155\u3156\u3157\u3158\u3159\u315A\u315B\u315C\u315D\u315E\u315F\u3160\u3161\u3162\u3163"];
var FINALS = ["", "\u3131", "\u3132", "\u3131\u3145", "\u3134", "\u3134\u3148", "\u3134\u314E", "\u3137", "\u3139", "\u3139\u3131", "\u3139\u3141", "\u3139\u3142", "\u3139\u3145", "\u3139\u314C", "\u3139\u314D", "\u3139\u314E", "\u3141", "\u3142", "\u3142\u3145", "\u3145", "\u3146", "\u3147", "\u3148", "\u314A", "\u314B", "\u314C", "\u314D", "\u314E"];
var HANGUL = /[가-힣]/;
var isHangul = (text) => HANGUL.test(text);
function decompose(word) {
  const out = [];
  for (const ch of word) {
    const code = ch.charCodeAt(0) - 44032;
    if (code < 0 || code > 11171) continue;
    out.push({ initial: INITIALS[Math.floor(code / 588)], vowel: MEDIALS[Math.floor(code / 28) % 21], final: [...FINALS[code % 28]], text: ch });
  }
  return out;
}
var ASPIRATE = { \u3131: "\u314B", \u3137: "\u314C", \u3142: "\u314D", \u3148: "\u314A" };
var TENSE = { \u3131: "\u3132", \u3137: "\u3138", \u3142: "\u3143", \u3145: "\u3146", \u3148: "\u3149" };
var CODA = {
  \u3131: "\u3131",
  \u3132: "\u3131",
  \u314B: "\u3131",
  \u3137: "\u3137",
  \u314C: "\u3137",
  \u3145: "\u3137",
  \u3146: "\u3137",
  \u3148: "\u3137",
  \u314A: "\u3137",
  \u314E: "\u3137",
  \u3142: "\u3142",
  \u314D: "\u3142",
  \u3134: "\u3134",
  \u3141: "\u3141",
  \u3147: "\u3147",
  \u3139: "\u3139"
};
var CLUSTER = { \u3131\u3145: "\u3131", \u3134\u3148: "\u3134", \u3134\u314E: "\u3134", \u3139\u3131: "\u3131", \u3139\u3141: "\u3141", \u3139\u3142: "\u3139", \u3139\u3145: "\u3139", \u3139\u314C: "\u3139", \u3139\u314D: "\u3142", \u3139\u314E: "\u3139", \u3142\u3145: "\u3142" };
var NASAL_OF = { \u3131: "\u3147", \u3137: "\u3134", \u3142: "\u3141" };
var Y_VOWELS = /* @__PURE__ */ new Set([..."\u3163\u3151\u3152\u3155\u3156\u315B\u3160"]);
function soundRules(blocks) {
  for (let k = 0; k < blocks.length; k++) {
    const a = blocks[k];
    const b = blocks[k + 1];
    if (!b) {
      a.final = a.final.length ? [CODA[CLUSTER[a.final.join("")] ?? a.final[0]]] : [];
      continue;
    }
    if (!a.final.length) continue;
    const last = a.final[a.final.length - 1];
    if (b.initial === "\u3147") {
      if (last === "\u3147") continue;
      if (last === "\u314E") {
        a.final.pop();
        if (a.final.length) b.initial = a.final.pop();
      } else {
        a.final.pop();
        b.initial = b.vowel === "\u3163" && last === "\u3137" ? "\u3148" : b.vowel === "\u3163" && last === "\u314C" ? "\u314A" : last;
        if (a.final.length && b.initial === "\u3145" && CODA[a.final[0]] !== "\u3139" && CODA[a.final[0]] !== "\u3134") b.initial = "\u3146";
      }
      if (a.final.length) a.final = [CODA[a.final[0]]];
      continue;
    }
    if (last === "\u314E") {
      a.final.pop();
      if (ASPIRATE[b.initial]) b.initial = ASPIRATE[b.initial];
      else if (b.initial === "\u3145") b.initial = "\u3146";
      else if (!a.final.length && b.initial === "\u3134") a.final = ["\u3134"];
    }
    let coda = a.final.length ? CODA[CLUSTER[a.final.join("")] ?? a.final[0]] : "";
    const stop = coda === "\u3131" || coda === "\u3137" || coda === "\u3142";
    if (stop && b.initial === "\u314E") {
      const written = a.final.length === 1 && a.final[0] === "\u3148" ? "\u3148" : coda;
      b.initial = coda === "\u3137" && b.vowel === "\u3163" ? "\u314A" : ASPIRATE[written] ?? ASPIRATE[coda];
      coda = "";
    } else if (stop && TENSE[b.initial]) {
      b.initial = TENSE[b.initial];
    } else if (stop && (b.initial === "\u3134" || b.initial === "\u3141")) {
      coda = NASAL_OF[coda];
    } else if (b.initial === "\u3139" && (stop || coda === "\u3141" || coda === "\u3147")) {
      b.initial = "\u3134";
      if (stop) coda = NASAL_OF[coda];
    } else if (coda === "\u3134" && b.initial === "\u3139" || coda === "\u3139" && b.initial === "\u3134") {
      coda = "\u3139";
      b.initial = "\u3139";
    }
    a.final = coda ? [coda] : [];
  }
}
var VOWELS = {
  \u314F: ["AA"],
  \u3150: ["EH"],
  \u3151: ["Y", "AA"],
  \u3152: ["Y", "EH"],
  \u3153: ["EO"],
  \u3154: ["E"],
  \u3155: ["Y", "EO"],
  \u3156: ["Y", "E"],
  \u3157: ["O"],
  \u3158: ["W", "AA"],
  \u3159: ["W", "EH"],
  \u315A: ["W", "E"],
  \u315B: ["Y", "O"],
  \u315C: ["U"],
  \u315D: ["W", "EO"],
  \u315E: ["W", "E"],
  \u315F: ["W", "IY"],
  \u3160: ["Y", "U"],
  \u3161: ["UU"],
  \u3162: ["IY"],
  \u3163: ["IY"]
};
var PLACE = {
  // [voiceless symbol, voiced symbol]
  \u3131: ["K", "G"],
  \u3132: ["K", "G"],
  \u314B: ["K", "G"],
  \u3137: ["T", "D"],
  \u3138: ["T", "D"],
  \u314C: ["T", "D"],
  \u3142: ["P", "B"],
  \u3143: ["P", "B"],
  \u314D: ["P", "B"],
  \u3148: ["CC", "JC"],
  \u3149: ["CC", "JC"],
  \u314A: ["CC", "JC"]
};
var VOT = { lax: 0.03, tense: 8e-3, aspirated: 0.095 };
function initialPhones(letter, vowel2, voicedBefore, afterL) {
  const c = (symbol, marks = {}) => ({ symbol, stress: 0, ...marks });
  if (PLACE[letter]) {
    const [voiceless, voiced] = PLACE[letter];
    if ("\u3132\u3138\u3143\u3149".includes(letter)) return [c(voiceless, { aspirated: false, vot: VOT.tense })];
    if ("\u314B\u314C\u314D\u314A".includes(letter)) return [c(voiceless, { aspirated: true, vot: VOT.aspirated })];
    return voicedBefore ? [c(voiced)] : [c(voiceless, { aspirated: true, vot: VOT.lax })];
  }
  switch (letter) {
    case "\u3145":
    case "\u3146":
      return [c(Y_VOWELS.has(vowel2) || vowel2 === "\u315F" ? "SC" : "S")];
    case "\u3134":
      return [c("N")];
    case "\u3141":
      return [c("M")];
    case "\u314E":
      return [c("HH")];
    // ㄹ is a tap, and a long [l] after another ㄹ.
    case "\u3139":
      return [c(afterL ? "L" : "DX")];
    default:
      return [];
  }
}
var FINAL_PHONE = {
  \u3131: { symbol: "K", stress: 0, unreleased: true },
  \u3137: { symbol: "T", stress: 0, unreleased: true },
  \u3142: { symbol: "P", stress: 0, unreleased: true },
  \u3134: { symbol: "N", stress: 0 },
  \u3141: { symbol: "M", stress: 0 },
  \u3147: { symbol: "NG", stress: 0 },
  \u3139: { symbol: "L", stress: 0 }
};
function koreanSyllables(word) {
  const blocks = decompose(word);
  soundRules(blocks);
  return blocks.map((b, k) => {
    const before = blocks[k - 1];
    const beforeCoda = before?.final[0];
    const voicedBefore = !!before && (!beforeCoda || "\u3134\u3141\u3147\u3139".includes(beforeCoda));
    const vowel2 = VOWELS[b.vowel].map((symbol, i, all) => ({ symbol, stress: i === all.length - 1 ? k === 0 ? 1 : 2 : 0 }));
    const phones2 = [...initialPhones(b.initial, b.vowel, voicedBefore, beforeCoda === "\u3139"), ...vowel2, ...b.final.map((f) => ({ ...FINAL_PHONE[f] }))];
    return { text: b.text, phones: phones2 };
  });
}
function koreanPhones(word) {
  return koreanSyllables(word).flatMap((s) => s.phones);
}

// src/core/lexicon-codes.mjs
var VOWELS2 = ["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"];
var CONSONANTS = ["B", "CH", "D", "DH", "F", "G", "HH", "JH", "K", "L", "M", "N", "NG", "P", "R", "S", "SH", "T", "TH", "V", "W", "Y", "Z", "ZH"];
var PHONE_CODES = [...VOWELS2.flatMap((v) => [`${v}0`, `${v}1`, `${v}2`]), ...CONSONANTS];

// src/core/text.ts
function decodeLexicon(text) {
  const map = /* @__PURE__ */ new Map();
  let previous = "";
  for (const line of text.split("\n")) {
    const tab = line.indexOf("	");
    if (tab < 1) continue;
    const word = previous.slice(0, line.charCodeAt(0) - 48) + line.slice(1, tab);
    map.set(word, line.slice(tab + 1));
    previous = word;
  }
  return {
    size: map.size,
    lookup(word) {
      const code = map.get(word.toLowerCase());
      if (!code) return null;
      return Array.from(code, (c) => parsePhone(PHONE_CODES[c.charCodeAt(0) - 33]));
    }
  };
}
var ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen"
];
var TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function numberToWords(n2) {
  if (!Number.isFinite(n2)) return "";
  if (n2 < 0) return `minus ${numberToWords(-n2)}`;
  n2 = Math.floor(n2);
  if (n2 < 20) return ONES[n2];
  if (n2 < 100) return TENS[Math.floor(n2 / 10)] + (n2 % 10 ? ` ${ONES[n2 % 10]}` : "");
  if (n2 < 1e3) return `${ONES[Math.floor(n2 / 100)]} hundred${n2 % 100 ? ` ${numberToWords(n2 % 100)}` : ""}`;
  if (n2 < 1e6) return `${numberToWords(Math.floor(n2 / 1e3))} thousand${n2 % 1e3 ? ` ${numberToWords(n2 % 1e3)}` : ""}`;
  return n2.toString().split("").map((d) => ONES[Number(d)]).join(" ");
}
function tokenize(input) {
  const text = input.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/&/g, " and ").replace(/%/g, " percent ").replace(/\d+(\.\d+)?/g, (m2) => {
    const [whole, frac] = m2.split(".");
    return ` ${numberToWords(Number(whole))}${frac ? ` point ${frac.split("").map((d) => ONES[Number(d)]).join(" ")}` : ""} `;
  });
  const tokens = [];
  const re = /([A-Za-z]+(?:'[A-Za-z]+)*|[А-Яа-яЁё][А-Яа-яЁё\u0301]*|[\uAC00-\uD7A3]+)|([,;:—–-]+)|([.]+)|([?]+)|([!]+)/g;
  let m;
  while (m = re.exec(text)) {
    if (m[1]) tokens.push({ text: m[1].toLowerCase(), boundary: "word" });
    else if (tokens.length) {
      const last = tokens[tokens.length - 1];
      last.boundary = m[2] ? m[2].startsWith("-") && m[2].length === 1 ? last.boundary : "comma" : m[3] ? "period" : m[4] ? "question" : "exclaim";
    }
  }
  return tokens;
}
var RULES = [
  ["tion", "SH AH0 N"],
  ["sion", "ZH AH0 N"],
  ["ture", "CH ER0"],
  ["ough", "AO1"],
  ["augh", "AO1"],
  ["eigh", "EY1"],
  ["igh", "AY1"],
  ["tch", "CH"],
  ["dge", "JH"],
  ["sch", "S K"],
  ["ph", "F"],
  ["sh", "SH"],
  ["ch", "CH"],
  ["th", "TH"],
  ["wh", "W"],
  ["ck", "K"],
  ["ng$", "NG"],
  ["nk", "NG K"],
  ["qu", "K W"],
  ["kn", "N"],
  ["wr", "R"],
  ["gh", ""],
  ["ee", "IY1"],
  ["ea", "IY1"],
  ["oo", "UW1"],
  ["ou", "AW1"],
  ["ow$", "OW1"],
  ["ow", "AW1"],
  ["oa", "OW1"],
  ["oi", "OY1"],
  ["oy", "OY1"],
  ["ai", "EY1"],
  ["ay", "EY1"],
  ["au", "AO1"],
  ["aw", "AO1"],
  ["ie$", "IY0"],
  ["ey$", "IY0"],
  ["ew", "UW1"],
  ["ar", "AA1 R"],
  ["er", "ER0"],
  ["ir", "ER1"],
  ["ur", "ER1"],
  ["or", "AO1 R"],
  ["le$", "AH0 L"],
  ["es$", "Z"],
  ["ed$", "D"],
  ["y$", "IY0"],
  ["e$", ""],
  ["ss", "S"],
  ["ll", "L"],
  ["ff", "F"],
  ["tt", "T"],
  ["pp", "P"],
  ["mm", "M"],
  ["nn", "N"],
  ["rr", "R"],
  ["dd", "D"],
  ["bb", "B"],
  ["gg", "G"],
  ["zz", "Z"],
  ["c(?=[eiy])", "S"],
  ["g(?=[ei])", "JH"],
  ["x", "K S"],
  ["a", "AE1"],
  ["e", "EH1"],
  ["i", "IH1"],
  ["o", "AA1"],
  ["u", "AH1"],
  ["y", "Y"],
  ["b", "B"],
  ["c", "K"],
  ["d", "D"],
  ["f", "F"],
  ["g", "G"],
  ["h", "HH"],
  ["j", "JH"],
  ["k", "K"],
  ["l", "L"],
  ["m", "M"],
  ["n", "N"],
  ["p", "P"],
  ["q", "K"],
  ["r", "R"],
  ["s", "S"],
  ["t", "T"],
  ["v", "V"],
  ["w", "W"],
  ["z", "Z"],
  ["'", ""]
];
var COMPILED = RULES.map(([p, phones2]) => [new RegExp(`^(?:${p.replace("$", "(?![a-z])")})`), phones2]);
var LONG = { a: "EY1", e: "IY1", i: "AY1", o: "OW1", u: "UW1" };
function letterToSound(word) {
  const w = word.toLowerCase().replace(/[^a-z']/g, "");
  const out = [];
  const magic = /^(.*?)([aeiou])([bcdfgklmnprstvz])e$/.exec(w);
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    if (magic && i === magic[1].length && !/[aeiou]/.test(magic[1].slice(-1))) {
      out.push(LONG[magic[2]], ...letterToSound(magic[3]).map((p) => p.symbol));
      break;
    }
    const rule = COMPILED.find(([re]) => re.test(rest));
    if (!rule) {
      i += 1;
      continue;
    }
    const matched = rest.match(rule[0])[0].length || 1;
    if (rule[1]) out.push(...rule[1].split(" "));
    i += matched;
  }
  let phones2 = out.map((t) => parsePhone(t)).filter((p) => !!p);
  let seen = false;
  phones2 = phones2.map((p) => {
    if (!isVowel(p.symbol)) return p;
    if (p.stress === 1 && !seen) {
      seen = true;
      return p;
    }
    return { ...p, stress: p.stress === 1 ? 0 : p.stress };
  });
  return phones2;
}
function trillWord(word) {
  if (/^br{2,}$/.test(word)) return [{ symbol: "BR", stress: 0 }];
  if (/^r{3,}$/.test(word)) return [{ symbol: "RR", stress: 0 }];
  if (/^tsk$/.test(word)) return [{ symbol: "CD", stress: 0 }];
  return null;
}
function phonemize(text, lexicon2) {
  return tokenize(text).map((t) => {
    if (isRussian(t.text)) return { text: t.text, phones: russianPhones(t.text), source: "russian", boundary: t.boundary };
    if (isHangul(t.text)) return { text: t.text, phones: koreanPhones(t.text), source: "korean", boundary: t.boundary };
    const trill = trillWord(t.text);
    if (trill) return { text: t.text, phones: trill, source: "rules", boundary: t.boundary };
    const known = lexicon2.lookup(t.text);
    return known ? { text: t.text, phones: known, source: "dictionary", boundary: t.boundary } : { text: t.text, phones: letterToSound(t.text), source: "rules", boundary: t.boundary };
  }).filter((w) => w.phones.length > 0);
}
var WEAK = {
  a: "AH0",
  an: "AH0 N",
  the: "DH AH0",
  of: "AH0 V",
  to: "T AH0",
  for: "F ER0",
  from: "F R AH0 M",
  at: "AH0 T",
  and: "AH0 N D",
  as: "AH0 Z",
  but: "B AH0 T",
  or: "ER0",
  than: "DH AH0 N",
  that: "DH AH0 T",
  can: "K AH0 N",
  was: "W AH0 Z",
  were: "W ER0",
  are: "ER0",
  am: "AH0 M",
  has: "HH AH0 Z",
  had: "HH AH0 D",
  have: "HH AH0 V",
  some: "S AH0 M",
  them: "DH AH0 M",
  her: "HH ER0",
  his: "HH IH0 Z",
  him: "IH0 M",
  your: "Y ER0",
  you: "Y UW0",
  we: "W IY0",
  he: "HH IY0",
  she: "SH IY0",
  me: "M IY0",
  my: "M AY0",
  by: "B AY0",
  is: "IH0 Z",
  in: "IH0 N",
  on: "AA0 N",
  with: "W IH0 DH",
  be: "B IY0",
  do: "D UW0",
  does: "D AH0 Z",
  will: "W IH0 L",
  would: "W UH0 D",
  should: "SH UH0 D",
  could: "K UH0 D",
  there: "DH ER0",
  us: "AH0 S"
};
function reduceFunctionWords(words) {
  return words.map((w) => {
    const weak = WEAK[w.text.toLowerCase()];
    if (!weak || w.source !== "dictionary" || w.boundary !== "word") return w;
    return { ...w, phones: weak.split(" ").map((t) => parsePhone(t)) };
  });
}
var IPA = [
  // Palatalized consonants: the letter plus ʲ (tʲ, nʲ, rʲ).
  ...PALATALIZABLE.flatMap((s) => [[`${PHONEMES[s].ipa}\u02B2`, `${s}J`], ...s === "G" ? [["\u0261\u02B2", "GJ"]] : []]),
  ["t\u0255", "CC"],
  ["d\u0291", "JC"],
  ["t\u0282", "CR"],
  ["d\u0290", "JR"],
  ["t\u0283", "CH"],
  ["d\u0292", "JH"],
  ["a\u026A", "AY"],
  ["a\u028A", "AW"],
  ["\u0254\u026A", "OY"],
  ["e\u026A", "EY"],
  ["o\u028A", "OW"],
  ["p\u02BC", "PE"],
  ["t\u02BC", "TE"],
  ["k\u02BC", "KE"],
  ["i", "IY"],
  ["\u026A", "IH"],
  ["e", "E"],
  ["\u025B", "EH"],
  ["\xE6", "AE"],
  ["\u0251", "AA"],
  ["a", "AA"],
  ["\u0252", "AA"],
  ["\u0254", "AO"],
  ["o", "O"],
  ["\u026F", "UU"],
  ["\u028A", "UH"],
  ["u", "UW"],
  ["\u028C", "AH"],
  ["\u0259", "AH", 0],
  ["\u025D", "ER"],
  ["\u025C", "ER"],
  ["\u025A", "ER", 0],
  ["p", "P"],
  ["b", "B"],
  ["t", "T"],
  ["d", "D"],
  ["k", "K"],
  ["g", "G"],
  ["\u0261", "G"],
  ["f", "F"],
  ["v", "V"],
  ["\u03B8", "TH"],
  ["\xF0", "DH"],
  ["s", "S"],
  ["z", "Z"],
  ["\u0283", "SH"],
  ["\u0292", "ZH"],
  ["h", "HH"],
  ["m", "M"],
  ["n", "N"],
  ["\u014B", "NG"],
  ["l", "L"],
  ["\u0279", "R"],
  ["r", "RR"],
  ["\u027E", "DX"],
  ["w", "W"],
  ["j", "Y"],
  ["\u0294", "Q"],
  ["\u0299", "BR"],
  ["\u0280", "RU"],
  ["\u0298", "CB"],
  ["\u01C0", "CD"],
  ["\u01C3", "CA"],
  ["\u0255", "SC"],
  ["\u0291", "ZC"],
  ["\u0282", "SR"],
  ["\u0290", "ZR"],
  ["\u0265", "YW"]
];
var IPA_ONLY = /[ɪɛæɑɒɔʊʌəɝɜɚθðʃʒŋɹɾʔʙʀʘǀǃˈˌːɡʲɕʑʂʐɥɯʰʱ˭\u0303\u0324\u031a\u00e3\u00f5\u1ebd\u0129\u0169]/;
function isIpa(text) {
  return IPA_ONLY.test(text);
}
function parseIpaInput(text) {
  const words = [];
  const errors = [];
  const clean = text.trim().replace(/^[/[]|[/\]]$/g, "").normalize("NFD");
  for (const token of clean.split(/\s+/).filter(Boolean)) {
    const trail = token.match(/[,?!.]+$/)?.[0] ?? "";
    const body = token.slice(0, token.length - trail.length).replace(/[.ː‿\u0361\u035c]/g, "");
    const phones2 = [];
    const marked = /[ˈˌ]/.test(body);
    let stress = null;
    let firstFull = true;
    for (let i = 0; i < body.length; ) {
      if (body[i] === "\u02C8" || body[i] === "\u02CC") {
        stress = body[i] === "\u02C8" ? 1 : 2;
        i++;
        continue;
      }
      const hit = IPA.find(([ipa2]) => body.startsWith(ipa2, i));
      if (!hit) {
        errors.push(body[i]);
        i++;
        continue;
      }
      const [ipa, symbol, fixed] = hit;
      let phone;
      if (isVowel(symbol)) {
        const s = fixed ?? (marked ? stress ?? 0 : firstFull ? 1 : 0);
        if (fixed === void 0) firstFull = false;
        phone = { symbol, stress: s };
        stress = null;
      } else {
        phone = { symbol, stress: 0 };
      }
      i += ipa.length;
      for (; i < body.length; i++) {
        const c = body[i];
        if (c === "\u02B0") phone.aspirated = true;
        else if (c === "\u02ED") phone.aspirated = false;
        else if (c === "\u0303") phone.nasalized = true;
        else if (c === "\u02B1" || c === "\u0324") phone.breathy = true;
        else if (c === "\u031A") phone.unreleased = true;
        else if (c === "\u02B2" && PHONEMES[`${phone.symbol}J`]) phone.symbol = `${phone.symbol}J`;
        else break;
      }
      phones2.push(phone);
    }
    if (!phones2.length) continue;
    const boundary = trail.includes("?") ? "question" : trail.includes("!") ? "exclaim" : trail.includes(".") ? "period" : trail.includes(",") ? "comma" : "word";
    words.push({ text: body, phones: phones2, source: "phonemes", boundary });
  }
  if (words.length && words[words.length - 1].boundary === "word") words[words.length - 1].boundary = "period";
  return { words, errors };
}
function parsePhonemeInput(text) {
  if (isIpa(text)) return parseIpaInput(text);
  const words = [];
  const errors = [];
  let current = [];
  const flush = (boundary) => {
    if (current.length) words.push({ text: current.map((p) => p.symbol).join(" "), phones: current, source: "phonemes", boundary });
    else if (words.length && boundary !== "word") words[words.length - 1].boundary = boundary;
    current = [];
  };
  for (const raw of text.replace(/([,.?!/|])/g, " $1 ").split(/\s+/).filter(Boolean)) {
    if (raw === "/" || raw === "|") flush("word");
    else if (raw === ",") flush("comma");
    else if (raw === ".") flush("period");
    else if (raw === "?") flush("question");
    else if (raw === "!") flush("exclaim");
    else {
      const p = parsePhone(raw);
      if (p) current.push(p);
      else errors.push(raw);
    }
  }
  flush("period");
  return { words, errors };
}
function syllabify(phones2) {
  const nuclei = phones2.map((p, i) => isVowel(p.symbol) ? i : -1).filter((i) => i >= 0);
  if (nuclei.length <= 1) return [phones2];
  const ONSETS = /* @__PURE__ */ new Set([
    "P R",
    "P L",
    "B R",
    "B L",
    "T R",
    "T W",
    "D R",
    "D W",
    "K R",
    "K L",
    "K W",
    "G R",
    "G L",
    "F R",
    "F L",
    "TH R",
    "SH R",
    "S P",
    "S T",
    "S K",
    "S M",
    "S N",
    "S L",
    "S W",
    "S P R",
    "S T R",
    "S K R",
    "S P L",
    "S K W",
    "P Y",
    "B Y",
    "K Y",
    "M Y",
    "F Y",
    "V Y",
    "HH Y"
  ]);
  const cuts = [];
  for (let k = 0; k < nuclei.length - 1; k++) {
    const a = nuclei[k];
    const b = nuclei[k + 1];
    const cluster = phones2.slice(a + 1, b).map((p) => p.symbol);
    let onset = 0;
    for (let n2 = cluster.length; n2 >= 1; n2--) {
      const tail = cluster.slice(cluster.length - n2).join(" ");
      if (n2 === 1 && tail !== "NG") {
        onset = 1;
        break;
      }
      if (ONSETS.has(tail)) {
        onset = n2;
        break;
      }
    }
    cuts.push(b - onset);
  }
  const out = [];
  let start = 0;
  for (const c of cuts) {
    out.push(phones2.slice(start, c));
    start = c;
  }
  out.push(phones2.slice(start));
  return out;
}

// src/core/planner.ts
var WEAK_NOTE = 0.35;
var VOWEL_REACH = 0.06;
var CORONAL_BURST = { T: { gap: 0.84, hold: 0.022 }, D: { gap: 0.84, hold: 0.012 } };
var NASAL_VOWEL = 0.6;
var BREATHY = 0.6;
var CORONAL_SHAPE = { tongueX: 0.85, tongueY: 0.6, jaw: 0.4 };
var CORONAL_BODY = { T: 0.7, D: 0.7, N: 0.7, S: 0.7, Z: 0.7 };
var CORONAL_SLIDE = 22;
var INITIAL_CLOSURE = 0.85;
function voiceDefaults(voice) {
  const all = { ...defaultPatch(), ...voice };
  return all;
}
function preamble(voice) {
  const all = voiceDefaults(voice);
  const ev = [];
  for (const name of VOICE_PARAMS) ev.push([0, name, all[name], 0]);
  const rest = { ...SCHWA, tipClose: 0, dorsumClose: 0, velum: 0, lateral: 0, voicing: 1, gate: 0, tipPlace: 0.38, creature: 0, harmony: 0 };
  for (const [k, v] of Object.entries(rest)) ev.push([0, k, v, 0]);
  return ev;
}
function articulate(segments, voice, withPreamble = true) {
  const tagged = [];
  const at = (t, name, value, tau, seg = -1) => tagged.push({ t: Math.max(0, t), name, value: clampParam(name, value), tau, seg, order: tagged.length });
  const holds = [];
  const vowelIdx = segments.map((s, i) => isVowel(s.symbol) ? i : -1).filter((i) => i >= 0);
  const nextVowel = (i) => segments[vowelIdx.find((v) => v > i) ?? -1];
  const prevVowel = (i) => segments[[...vowelIdx].reverse().find((v) => v < i) ?? -1];
  let inPhrase = false;
  segments.forEach((s, i) => {
    if (s.symbol === "SIL") {
      const tail = segments[i - 1]?.sungFinalD ? Math.min(s.end - s.start, 0.022) : 0;
      if (inPhrase) at(s.start + tail, "gate", 0, 20);
      inPhrase = false;
    } else if (!inPhrase) {
      at(s.start - 0.03, "gate", 1, 10);
      inPhrase = true;
    }
    if (i === segments.length - 1 && inPhrase && !s.held) at(s.end, "gate", 0, 40);
  });
  const anchors = [];
  segments.forEach((s, i) => {
    if (s.symbol === "SIL") return;
    const ph = PHONEMES[s.symbol];
    const dur = s.end - s.start;
    if (isVowel(s.symbol)) {
      let target = vowelTarget({ symbol: s.symbol, stress: s.stress });
      const soft = [segments[i - 1], segments[i + 1]].filter((n2) => n2 && PHONEMES[n2.symbol]?.palatalized).length;
      if (soft) {
        const k = soft === 2 ? 0.6 : 0.15;
        const toward = (name) => (target[name] ?? 0.5) + k * (PALATAL[name] - (target[name] ?? 0.5));
        target = { ...target, tongueX: toward("tongueX"), tongueY: toward("tongueY") };
      }
      if (s.held) {
        anchors.push({ time: s.start + Math.min(0.06, 0.38 * dur), target, seg: i });
      } else if (ph.offglide) {
        const long = dur > 0.4;
        anchors.push({ time: s.start + (long ? Math.min(0.22 * dur, 0.1) : 0.22 * dur), target, seg: i });
        anchors.push({ time: long ? s.end - 0.1 : s.start + 0.8 * dur, target: { ...ph.offglide, rhotic: 0 }, seg: i });
      } else {
        anchors.push({ time: s.start + Math.min(0.38 * dur, VOWEL_REACH), target, seg: i });
      }
      return;
    }
    if (s.symbol === "HH") {
      const v = nextVowel(i);
      if (v) anchors.push({ time: s.start + 0.2 * dur, target: vowelTarget({ symbol: v.symbol, stress: v.stress }), seg: i });
      return;
    }
    const t = ph.target;
    const body = {};
    for (const k of ["tongueX", "tongueY", "rhotic", "jaw"]) if (t[k] !== void 0) body[k] = t[k];
    if (ph.palatalized) {
      const next = segments[i + 1];
      const prevocalic = next && isVowel(next.symbol);
      anchors.push({ time: prevocalic ? s.start + 0.9 * dur : s.start - 0.03, target: { ...body, ...PALATAL }, tau: 18, lead: 4, seg: i });
    } else if (CORONAL_BODY[s.symbol] !== void 0) {
      const k = CORONAL_BODY[s.symbol];
      const near = segments[i + 1] && isVowel(segments[i + 1].symbol) ? segments[i + 1] : segments[i - 1] && isVowel(segments[i - 1].symbol) ? segments[i - 1] : nextVowel(i) ?? prevVowel(i);
      const v = near ? vowelTarget({ symbol: near.symbol, stress: near.stress }) : SCHWA;
      const mix = (name) => (v[name] ?? 0.5) + k * (CORONAL_SHAPE[name] - (v[name] ?? 0.5));
      const prevocalic = segments[i + 1] && isVowel(segments[i + 1].symbol);
      anchors.push({ time: prevocalic ? s.end - 5e-3 : s.start + 0.4 * dur, target: { tongueX: mix("tongueX"), tongueY: mix("tongueY"), jaw: body.jaw ?? mix("jaw") }, tau: 18, lead: 4, seg: i, coronal: true });
    } else if (Object.keys(body).length) {
      if (s.symbol === "R") body.jaw = 0.55;
      const r = s.symbol === "R";
      anchors.push({ time: s.start + (r ? 0.25 : 0.5) * dur, target: body, tau: r ? 12 : 18, lead: 4, seg: i, hold: r ? s.start + 0.75 * dur : void 0 });
    }
  });
  anchors.sort((a, b) => a.time - b.time);
  anchors.forEach((a, k) => {
    const gap = k ? a.time - anchors[k - 1].time : 0.15;
    const tau = a.tau ?? Math.min(24, Math.max(k && anchors[k - 1].coronal ? CORONAL_SLIDE : 12, gap * 1e3 * 0.18));
    const start = Math.max(k ? anchors[k - 1].hold ?? anchors[k - 1].time : 0, a.time - (a.lead ?? 4) * tau / 1e3);
    for (const [name, value] of Object.entries(a.target)) {
      if (["tongueX", "tongueY", "jaw", "throat", "rhotic", "lipOpen", "lipRound"].includes(name)) at(start, name, value, tau, a.seg);
    }
  });
  segments.forEach((s, i) => {
    if (s.symbol === "SIL") return;
    if (isVowel(s.symbol)) {
      const after = segments[i + 1];
      if (s.nasalized) {
        at(s.start - 0.02, "velum", NASAL_VOWEL, 14, i);
        const obstruent = after && ["stop", "fricative", "affricate"].includes(PHONEMES[after.symbol]?.manner);
        if (!(after && PHONEMES[after.symbol]?.target.velum)) at(obstruent ? s.end - 0.035 : s.end - 0.01, "velum", 0, obstruent ? 9 : 20, i);
      }
      if (s.breathy) {
        at(s.start, "voicing", BREATHY, 15, i);
        at(s.end - 0.01, "voicing", 1, 12, i);
      }
      return;
    }
    const ph = PHONEMES[s.symbol];
    const t = ph.target;
    const dur = s.end - s.start;
    const next = segments[i + 1];
    const nv = nextVowel(i) ?? prevVowel(i);
    const vowelLips = nv ? vowelTarget({ symbol: nv.symbol, stress: nv.stress }) : SCHWA;
    const complete = ph.manner === "stop" || ph.manner === "nasal" || ph.manner === "affricate" || ph.manner === "click";
    const closeTau = s.symbol === "DX" ? 4 : complete ? 9 : 14;
    const prevSeg = segments[i - 1];
    const phraseInitial = !prevSeg || prevSeg.symbol === "SIL";
    const onset = phraseInitial ? Math.max(prevSeg?.start ?? 0, s.start - 0.1) : s.start - (complete ? 4.2 : 3.5) * closeTau / 1e3;
    const releaseTau = ph.manner === "click" ? 3 : ph.manner === "stop" ? 6 : ph.manner === "fricative" ? 14 : 12;
    const nextIsSame = (param) => next && next.symbol !== "SIL" && !isVowel(next.symbol) && PHONEMES[next.symbol].target[param] !== void 0;
    const afterCoronalFricative = prevSeg && PHONEMES[prevSeg.symbol]?.manner === "fricative" && PHONEMES[prevSeg.symbol].target.tipPlace !== void 0;
    if (t.tipPlace !== void 0) at(afterCoronalFricative ? Math.max(s.start - 0.07, prevSeg.end - 0.02) : s.start - 0.07, "tipPlace", t.tipPlace, 18, i);
    if (t.jaw !== void 0 && ph.manner !== "approximant") at(onset - 0.02, "jaw", t.jaw, 22, i);
    if (t.lipRound !== void 0) at(onset - 0.03, "lipRound", t.lipRound, 25, i);
    const closures = ["lipOpen", "tipClose", "dorsumClose"];
    for (const param of closures) {
      if (t[param] === void 0) continue;
      const stopped = s.symbol === "DH" && param === "tipClose" && (phraseInitial || ["stop", "nasal"].includes(PHONEMES[prevSeg.symbol]?.manner));
      at(onset, param, stopped ? 1 : t[param], closeTau, i);
      if (stopped) at(s.start + 0.45 * dur, param, t[param], 6, i);
      holds.push({ seg: i, name: param, start: onset, end: s.end, tau: releaseTau, value: t[param] });
      if (param === "tipClose" && AFFRICATE_RELEASE[s.symbol]) {
        const r = AFFRICATE_RELEASE[s.symbol];
        const hiss = ph.manner === "affricate" ? 0.42 : 0.45;
        at(s.start + hiss * dur, "tipClose", r.tipClose, 6, i);
        at(s.start + (hiss - 0.1) * dur, "tipPlace", r.tipPlace, 10, i);
      }
      if (!nextIsSame(param)) {
        const rest = param === "lipOpen" ? vowelLips.lipOpen ?? 0.6 : 0;
        const late = ph.manner === "click" && param === "dorsumClose" ? 0.03 : 0;
        const lastFricative = ph.voiced && ph.manner === "fricative" && (!next || next.symbol === "SIL");
        const held = s.unreleased && complete ? !next || next.symbol === "SIL" ? 0.12 : isVowel(next.symbol) ? 0 : 0.03 : lastFricative ? 0.08 : 0;
        const hiss = param === "tipClose" && !held ? CORONAL_BURST[s.symbol] : void 0;
        if (hiss) at(s.end - 2e-3, param, hiss.gap, 4, i);
        at(s.end - (param === "lipOpen" ? 4e-3 : 2e-3) + late + held + (hiss?.hold ?? 0), param, rest, held ? 25 : late ? 12 : releaseTau, i);
      }
    }
    if (t.glottal) {
      at(onset - 5e-3, "glottal", 1, 5, i);
      at(s.end + (t.larynx ? 0.035 : 0), "glottal", 0, 6, i);
    }
    if (t.larynx) {
      at(onset + 0.01, "larynx", 1, 18, i);
      at(s.end + 0.01, "larynx", 0, 25, i);
    }
    if (t.suction) {
      at(onset + 0.015, "suction", 1, 10, i);
      at(s.end + 0.045, "suction", 0, 20, i);
    }
    if (t.trill) {
      at(Math.max(onset, s.start - 0.01), "trill", 1, 8, i);
      at(s.end, "trill", 0, 8, i);
    }
    if (t.lateral) {
      at(Math.max(onset, s.start - 0.012), "lateral", 1, 10, i);
      at(s.end, "lateral", 0, 15, i);
    }
    if (t.lipRound !== void 0 && (!next || isVowel(next.symbol) || next.symbol === "SIL")) {
      at(s.end, "lipRound", vowelLips.lipRound ?? 0.1, 30, i);
    }
    if (t.velum) {
      const afterObstruent = prevSeg && ["stop", "fricative", "affricate"].includes(PHONEMES[prevSeg.symbol]?.manner);
      at(afterObstruent ? s.start - 0.012 : s.start - 0.035, "velum", 1, afterObstruent ? 10 : 12, i);
      if (!(next && PHONEMES[next.symbol]?.target.velum)) {
        const obstruent = next && ["stop", "fricative", "affricate"].includes(PHONEMES[next.symbol]?.manner);
        if (obstruent) at(s.end - 0.035, "velum", 0, 9, i);
        else at(s.end + 0.01, "velum", 0, 25, i);
      }
    }
    if (!ph.voiced) {
      const closing = ph.manner === "stop" || ph.manner === "affricate";
      at(phraseInitial ? onset : closing ? s.start : s.start - 0.02, "voicing", 0, 7, i);
      const afterS = prevSeg && prevSeg.word === s.word && prevSeg.symbol === "S";
      const byRule = ph.manner === "stop" && !ph.palatalized && !afterS && next && (isVowel(next.symbol) ? next.stress > 0 : next.symbol === "SIL" || ["R", "L", "W", "Y"].includes(next.symbol));
      const closure = ph.manner === "stop" || ph.manner === "affricate";
      const aspirated = closure && s.aspirated !== void 0 ? s.aspirated : byRule;
      const vot = closure && s.vot !== void 0 ? s.vot : ph.manner === "stop" ? aspirated ? 0.055 : 0.015 : ph.manner === "affricate" ? s.aspirated ? 0.06 : 0.02 : 0;
      const following = next && next.symbol !== "SIL" && !isVowel(next.symbol) && !PHONEMES[next.symbol].voiced;
      const final2 = !next || next.symbol === "SIL";
      if (final2) at(s.end + 0.09, "voicing", 1, 20, i);
      else if (!following) at(s.end + (ph.manner === "fricative" ? 5e-3 : ph.manner === "aspirate" ? -0.02 : vot - 0.012), "voicing", 1, 8, i);
    } else if (phraseInitial && (ph.manner === "stop" || ph.manner === "affricate")) {
      at(onset, "voicing", INITIAL_CLOSURE, 10, i);
      if (s.breathy) {
        at(s.end - 0.015, "voicing", BREATHY, 8, i);
        at(s.end + 0.1, "voicing", 1, 18, i);
      } else at(s.end - 6e-3, "voicing", 1, 6, i);
    } else if (ph.manner === "fricative" || ph.manner === "stop" || ph.manner === "affricate") {
      at(s.start - 0.01, "voicing", ph.manner === "stop" ? 0.85 : 0.66, 10, i);
      if (s.breathy && ph.manner !== "fricative") {
        at(s.end - 0.015, "voicing", BREATHY, 8, i);
        at(s.end + 0.1, "voicing", 1, 18, i);
      } else if (!next || next.symbol === "SIL") {
        if (ph.manner === "fricative") at(s.start + 0.5 * dur, "voicing", 0.15, 12, i);
        else at(s.end - 4e-3, "voicing", s.sungFinalD ? 0.22 : 0.55, 6, i);
        at(s.end + 0.09, "voicing", 1, 20, i);
      } else at(s.end, "voicing", 1, 10, i);
    }
  });
  return resolveGestures(tagged, holds, withPreamble ? preamble(voice) : []);
}
function resolveGestures(tagged, holds, ev) {
  holds.sort((a, b) => a.start - b.start);
  for (const e of tagged) {
    if (e.seg < 0) continue;
    for (const h of holds) {
      const opens = h.name === "lipOpen" ? e.value > h.value : e.value < h.value;
      if (h.name === e.name && h.seg < e.seg && opens && e.t >= h.start && e.t < h.end) {
        e.t = h.end;
        e.tau = Math.min(e.tau, h.tau);
      }
    }
  }
  tagged.sort((a, b) => a.t - b.t || a.seg - b.seg || a.order - b.order);
  const latest = /* @__PURE__ */ new Map();
  for (const e of tagged) {
    if (e.seg >= 0) {
      const owner = latest.get(e.name) ?? -1;
      if (e.seg < owner) continue;
      latest.set(e.name, e.seg);
    }
    ev.push([e.t, e.name, e.value, e.tau]);
  }
  ev.sort((a, b) => a[0] - b[0]);
  return ev;
}
var TEMPO = 1.25;
var ASPIRATED_GLIDE = 0.04;
var afterAspirated = (seg, prev) => !!prev && ["P", "T", "K"].includes(prev.symbol) && ["R", "L", "W", "Y"].includes(seg.symbol);
function durationOf(seg, prev, next, final2, rate2) {
  const ph = PHONEMES[seg.symbol];
  let d = ph.duration;
  if (isVowel(seg.symbol)) {
    d *= seg.stress === 1 ? 1 : seg.stress === 2 ? 0.85 : 0.6;
    if (seg.symbol === "AH" && seg.stress === 0) d = 55;
    if (final2) d *= 1.4;
    if (next && !isVowel(next.symbol) && !PHONEMES[next.symbol].voiced && !final2) d *= 0.85;
  } else {
    const cluster = prev && !isVowel(prev.symbol) || next && !isVowel(next.symbol);
    if (cluster) d *= 0.8;
    if (final2) d *= 1.15;
    if (afterAspirated(seg, prev)) d += ASPIRATED_GLIDE * 1e3;
  }
  return TEMPO * d / 1e3 / rate2;
}
function planWords(words, opts = {}) {
  const rate2 = Math.min(2.5, Math.max(0.4, opts.rate ?? 1));
  const expression = Math.min(1, Math.max(0, opts.expression ?? 0.6));
  const voice = { ...defaultPatch(), ...opts.voice ?? {} };
  const segments = [];
  let t = 0.08;
  segments.push({ symbol: "SIL", stress: 0, start: 0, end: t, word: -1 });
  words.forEach((w, wi) => {
    const syll = syllabify(w.phones);
    const lastSyll = syll[syll.length - 1];
    w.phones.forEach((p, pi) => {
      const final2 = w.boundary !== "word" && lastSyll.includes(p);
      const prev = pi > 0 ? w.phones[pi - 1] : wi > 0 && words[wi - 1].boundary === "word" ? words[wi - 1].phones.at(-1) : void 0;
      const crossWord = pi === w.phones.length - 1;
      const next = !crossWord ? w.phones[pi + 1] : w.boundary === "word" ? words[wi + 1]?.phones[0] : void 0;
      if (w.source !== "korean" && w.source !== "russian" && p.aspirated === void 0 && (p.symbol === "T" || p.symbol === "D") && pi > 0 && prev && isVowel(prev.symbol) && next && isVowel(next.symbol) && (crossWord || next.stress === 0)) {
        p = { symbol: "DX", stress: 0 };
      }
      const d = durationOf(p, w.phones[pi - 1], w.phones[pi + 1], final2, rate2);
      segments.push({ symbol: p.symbol, stress: p.stress, start: t, end: t + d, word: wi, ...marksOf(p) });
      t += d;
    });
    if (w.boundary !== "word") {
      segments[segments.length - 1].boundary = w.boundary;
      const pause = (w.boundary === "comma" ? 0.18 : 0.38) / rate2;
      segments.push({ symbol: "SIL", stress: 0, start: t, end: t + pause, word: -1 });
      t += pause;
    }
  });
  if (segments[segments.length - 1].symbol !== "SIL") {
    segments[segments.length - 1].boundary = "period";
    segments.push({ symbol: "SIL", stress: 0, start: t, end: t + 0.25, word: -1 });
    t += 0.25;
  }
  const events = articulate(segments, voice, true);
  events.push(...intonation(segments, voice.pitch, expression), ...dynamics(segments, voice.loudness));
  events.sort((a, b) => a[0] - b[0]);
  return { score: compileScore(events, t + 0.1), segments, words, warnings: [] };
}
var INTONATION_SCALE = 2.6;
function intonation(segments, base, expressionSetting) {
  const expression = expressionSetting * INTONATION_SCALE;
  const ev = [];
  const st = (semitones) => base * 2 ** (semitones / 12);
  let phraseStart = 0;
  const phrases2 = [];
  segments.forEach((s, i) => {
    if (s.symbol === "SIL") {
      if (i > phraseStart) phrases2.push([phraseStart, i]);
      phraseStart = i + 1;
    }
  });
  for (const [a, b] of phrases2) {
    const seg = segments.slice(a, b);
    const vowels2 = seg.filter((s) => isVowel(s.symbol));
    if (!vowels2.length) continue;
    const t0 = seg[0].start;
    const t1 = seg[seg.length - 1].end;
    const end = seg[seg.length - 1].boundary ?? "period";
    const accents = vowels2.filter((v) => v.stress === 1);
    const firstAccent = accents[0];
    ev.push([t0 - 0.05, "pitch", st(1 * expression), 0]);
    vowels2.forEach((v, k) => {
      const pos = (v.start - t0) / Math.max(0.2, t1 - t0);
      const declination = 1.2 * expression - 3.5 * expression * pos;
      const isLast = k === vowels2.length - 1;
      let semis = declination;
      if (v.stress === 1) semis += (v === firstAccent ? 3.2 : 2) * expression;
      if (v.stress === 0) semis -= 0.8 * expression;
      if (isLast && end === "question") semis = 4.5 * expression + 1;
      else if (isLast && end === "exclaim") semis += 1.5 * expression;
      const peakTime = v.start + 0.3 * (v.end - v.start);
      ev.push([peakTime - 0.06, "pitch", st(semis), 45]);
      if (isLast) {
        const fin = end === "question" ? semis + 3 * expression : end === "comma" ? semis - 0.5 : -4.5 * expression - 1;
        ev.push([v.start + 0.55 * (v.end - v.start), "pitch", st(fin), 70]);
      }
    });
  }
  return ev;
}
function dynamics(segments, loudness) {
  const ev = [];
  for (const s of segments) {
    if (!isVowel(s.symbol)) continue;
    const delta = s.stress === 1 ? 0.06 : s.stress === 0 ? -0.07 : 0;
    ev.push([s.start - 0.02, "loudness", clampParam("loudness", loudness + delta), 30]);
  }
  return ev;
}
function planSpeech(input, lexicon2, opts = {}) {
  if (opts.phonemes) {
    const { words: words2, errors } = parsePhonemeInput(input);
    const plan2 = planWords(words2, opts);
    if (errors.length) plan2.warnings.push(`Unknown phoneme tokens ignored: ${errors.slice(0, 8).join(", ")}`);
    return plan2;
  }
  const words = reduceFunctionWords(phonemize(input, lexicon2));
  const plan = planWords(words, opts);
  const guessed = words.filter((w) => w.source === "rules").map((w) => w.text);
  if (guessed.length) plan.warnings.push(`Pronunciation guessed by rules: ${guessed.slice(0, 8).join(", ")}`);
  return plan;
}
function lyricSyllables(lyrics, lexicon2) {
  const out = [];
  const parts = lyrics.trim().split(/\s+/).filter(Boolean);
  parts.forEach((part, wi) => {
    if (part === "-" || part === "_") {
      out.push({ phones: [], text: "\u2013", word: wi });
      return;
    }
    const bracket = /^\[([A-Za-z0-9+~^=%-]+)\]([!?.,]*)$/.exec(part);
    if (bracket) {
      const phones2 = bracket[1].split("+").map((t) => parsePhone(t.toUpperCase())).filter((p) => !!p);
      if (phones2.length) out.push({ phones: phones2, text: phones2.map((p) => PHONEMES[p.symbol].ipa).join(""), word: wi });
      return;
    }
    if (isRussian(part)) {
      const letters = part.replace(/[^а-яёА-ЯЁ\u0301-]/g, "").split("-").filter(Boolean);
      const units = syllabify(russianPhones(letters.join("")));
      const trail2 = part.match(/[!?.,]+$/)?.[0] ?? "";
      units.forEach((phones2, i) => out.push({ phones: phones2, word: wi, text: (letters.length === units.length ? letters[i] : i === 0 ? letters.join("") : "\xB7") + (i === units.length - 1 ? trail2 : "") }));
      return;
    }
    if (isHangul(part)) {
      const trail2 = part.match(/[!?.,]+$/)?.[0] ?? "";
      const syl2 = koreanSyllables(part);
      syl2.forEach((unit, k) => out.push({ phones: unit.phones, text: k === syl2.length - 1 ? unit.text + trail2 : unit.text, word: wi }));
      return;
    }
    const spelled = part.replace(/[^A-Za-z'-]/g, "").split("-").filter(Boolean);
    const word = phonemize(spelled.join(""), lexicon2)[0];
    if (!word) return;
    const syl = syllabify(word.phones);
    const trail = part.match(/[!?.,]+$/)?.[0] ?? "";
    syl.forEach((phones2, k) => {
      const text = spelled.length === syl.length ? spelled[k] : k === 0 ? spelled.join("") : "\xB7";
      out.push({ phones: phones2, text: k === syl.length - 1 && text !== "\xB7" ? text + trail : text, word: wi });
    });
  });
  return out;
}
var BREATH = 0.13;
function singingVoice(voice) {
  return { ...voice, loudness: clampParam("loudness", voice.loudness + 0.1) };
}
function sungConsonant(p, cluster) {
  return Math.min(0.14, PHONEMES[p.symbol].duration / 1e3 * (cluster ? 1 : 1.2));
}
function yieldPreviousVowel(segments, cues, cursor, onsetStart) {
  if (onsetStart >= cursor) return cursor;
  let i = segments.length - 1;
  while (i > 0 && segments[i].symbol !== "SIL" && !isVowel(segments[i].symbol)) i--;
  const vowel2 = segments[i];
  if (!vowel2 || !isVowel(vowel2.symbol)) return cursor;
  const coda = segments.slice(i + 1);
  const codaLength = coda.reduce((a, s) => a + (s.end - s.start), 0);
  const floor = vowel2.start + Math.max(0.05, 0.4 * (vowel2.end - vowel2.start));
  const vowelEnd = Math.max(floor, Math.min(vowel2.end, onsetStart - codaLength));
  const shift = vowel2.end - vowelEnd;
  if (shift <= 0) return cursor;
  vowel2.end = vowelEnd;
  for (const s of coda) {
    s.start -= shift;
    s.end -= shift;
  }
  const end = cursor - shift;
  const cue = cues[cues.length - 1];
  if (cue && Math.abs(cue.end - cursor) < 0.02) cue.end = end;
  return end;
}
function directWords(events, directions, lyrics, syllables, assignments, notes, segments, voice, cartoon) {
  const words = lyricWords(lyrics);
  for (const direction of directions) {
    const word = words.find((w) => sameWord(w, direction));
    if (!word) continue;
    const vowels2 = segments.filter((s) => isVowel(s.symbol) && syllables[assignments[s.word]?.syllable]?.word === word.index);
    if (!vowels2.length) continue;
    const held = vowels2.reduce((a, b) => b.end - b.start > a.end - a.start ? b : a);
    const limit = (s) => Math.min(s.end, (segments.find((v) => v.word > s.word && isVowel(v.symbol))?.start ?? Infinity) - 0.065);
    if (direction.slide) {
      const first = vowels2[0], start2 = first.start;
      const end2 = Math.min(limit(first), start2 + 0.14);
      const hz = midiToHz(notes[assignments[first.word].note].midi);
      if (end2 - start2 > 0.025) events.push([start2, "pitch", hz * 2 ** (-2 / 12), 8], [start2 + 0.2 * (end2 - start2), "pitch", hz, (end2 - start2) * 160]);
    }
    const start = held.start, end = limit(held), duration = end - start;
    if (duration < 0.035) continue;
    const override = (param, value, enter, target, tau) => {
      let restore = voice[param], latest = -Infinity;
      for (let i = events.length - 1; i >= 0; i--) {
        const [time, name, v] = events[i];
        if (name !== param || time >= end) continue;
        if (time > latest) {
          latest = time;
          restore = v;
        }
        if (time >= start) events.splice(i, 1);
      }
      events.push([start, param, value, 8]);
      if (enter < end) events.push([enter, param, target, tau]);
      events.push([end - 1e-5, param, restore, 12]);
    };
    if (direction.swell) {
      const level = voice.loudness;
      override("loudness", clampParam("loudness", level - 0.26), start + duration * 0.12, clampParam("loudness", level + 0.14), duration * 160);
    }
    if (direction.vibratoAt !== void 0) {
      const depth = cartoon ? 0.62 : voice.vibratoDepth;
      override("vibratoDepth", 0, start + duration * direction.vibratoAt, depth, Math.min(65, duration * 90));
    }
  }
}
var SONG_LEAD = 0.25;
function planSong(notes, lyrics, lexicon2, opts) {
  const bpm = Math.min(240, Math.max(30, opts.bpm));
  const beat = 60 / bpm;
  const voice = singingVoice({ ...defaultPatch(), ...opts.voice ?? {} });
  const syllables = lyricSyllables(lyrics, lexicon2);
  const sorted = notes.map((n2, i) => ({ ...n2, index: i })).sort((a, b) => a.start - b.start || a.midi - b.midi);
  const lead = SONG_LEAD;
  const segments = [{ symbol: "SIL", stress: 0, start: 0, end: lead, word: -1 }];
  const pitchEvents = [];
  const assignments = [];
  const cues = [];
  const hum = [{ symbol: opts.hum ?? "AA", stress: 1 }];
  const cartoon = opts.style === "cartoon";
  const yodel = opts.style === "yodel";
  const breakMidi = sorted.length ? (Math.min(...sorted.map((n2) => n2.midi)) + Math.max(...sorted.map((n2) => n2.midi))) / 2 : 0;
  let register = voice.register;
  let syl = 0;
  let cursor = lead;
  sorted.forEach((n2, k) => {
    const start = lead + n2.start * beat;
    const end = lead + (n2.start + n2.length) * beat;
    const nextStart = k + 1 < sorted.length ? lead + sorted[k + 1].start * beat : Infinity;
    const legato = k > 0 && start - (lead + (sorted[k - 1].start + sorted[k - 1].length) * beat) < 0.02;
    let unit = syllables[syl];
    const melisma = unit && unit.phones.length === 0;
    if (unit) syl++;
    if (melisma && segments.length > 1) {
      const lastVowel = [...segments].reverse().find((s) => isVowel(s.symbol));
      if (lastVowel) {
        const trailing = segments.slice(segments.indexOf(lastVowel) + 1);
        const shift = Math.min(end, nextStart) - (trailing.length ? trailing[trailing.length - 1].end : lastVowel.end);
        lastVowel.end += shift;
        trailing.forEach((s) => {
          s.start += shift;
          s.end += shift;
        });
        cursor = Math.max(cursor, lastVowel.end);
        if (cues.length) cues[cues.length - 1].end = lastVowel.end;
      }
      pitchEvents.push([start - 0.01, "pitch", midiToHz(n2.midi), cartoon ? 110 : 40]);
      assignments.push({ note: n2.index, syllable: syl - 1, text: "\u2013" });
      return;
    }
    const phones2 = unit && unit.phones.length ? unit.phones : hum;
    assignments.push({ note: n2.index, syllable: unit ? syl - 1 : -1, text: unit?.text ?? "ah" });
    if (unit && unit.phones.length && !unit.phones.some((p) => isVowel(p.symbol))) {
      const stop2 = (p) => ["stop", "affricate"].includes(PHONEMES[p.symbol].manner);
      const length = Math.max(0.05, Math.min(end, nextStart - 0.01) - start);
      const durs = unit.phones.map((p, i) => i === 0 && stop2(p) ? 0.045 : ["nasal", "trill"].includes(PHONEMES[p.symbol].manner) ? length * 0.9 : stop2(p) ? 0.04 : Math.min(0.11, length * 0.7));
      const lead2 = stop2(unit.phones[0]) ? durs[0] : 0;
      const last = segments[segments.length - 1];
      const floor = last && last.symbol === "SIL" && last.end >= cursor - 1e-6 ? last.start + 0.02 : cursor;
      let t2 = Math.max(floor, start - lead2);
      if (t2 - cursor > 0.06) segments.push({ symbol: "SIL", stress: 0, start: cursor, end: t2, word: -1 });
      else if (segments.length) segments[segments.length - 1].end = t2;
      cues.push({ text: unit.text, start: t2, vowel: start, end: t2 + durs.reduce((a, b) => a + b, 0), midi: n2.midi });
      unit.phones.forEach((p, i) => {
        segments.push({ symbol: p.symbol, stress: 0, start: t2, end: t2 + durs[i], word: k, ...marksOf(p) });
        t2 += durs[i];
      });
      cursor = t2;
      pitchEvents.push([start - 0.04, "pitch", midiToHz(n2.midi), 20]);
      return;
    }
    const v = phones2.findIndex((p) => isVowel(p.symbol));
    const onset = v > 0 ? phones2.slice(0, v) : [];
    const nucleus = v >= 0 ? phones2[v] : hum[0];
    const coda = v >= 0 ? phones2.slice(v + 1) : [];
    const onsetDur = onset.map((p, i) => sungConsonant(p, onset.length > 1) + (afterAspirated(p, onset[i - 1]) ? ASPIRATED_GLIDE : 0));
    const onsetStart = start - onsetDur.reduce((a, b) => a + b, 0);
    cursor = yieldPreviousVowel(segments, cues, cursor, onsetStart);
    const before = segments[segments.length - 1];
    if (before && before.symbol === "SIL" && before.end >= cursor - 1e-6 && onsetStart < cursor) {
      cursor = Math.max(before.start + 0.02, onsetStart);
      before.end = cursor;
    }
    const available = Math.max(0.03, start - cursor);
    const squeeze = Math.min(1, available / Math.max(1e-3, onsetDur.reduce((a, b) => a + b, 0)));
    let t = start - onsetDur.reduce((a, b) => a + b, 0) * squeeze;
    if (t - cursor > 0.06) {
      segments.push({ symbol: "SIL", stress: 0, start: cursor, end: t, word: -1 });
    } else if (segments.length) {
      segments[segments.length - 1].end = t;
    }
    onset.forEach((p, i) => {
      const d = onsetDur[i] * squeeze;
      segments.push({ symbol: p.symbol, stress: 0, start: t, end: t + d, word: k, ...marksOf(p) });
      t += d;
    });
    const noteSeconds = Math.min(end, nextStart) - start;
    const breath = unit && /[,.!?;:]$/.test(unit.text) && nextStart - end < BREATH && Math.min(end, nextStart) - start > 0.3;
    const stop = breath ? nextStart - BREATH : Math.min(end, nextStart - 5e-3);
    const codaDur = coda.map((p) => sungConsonant(p, coda.length > 1));
    const codaTotal = Math.min(codaDur.reduce((a, b) => a + b, 0), (stop - start) * 0.45);
    const vowelEnd = stop - codaTotal;
    if (unit) cues.push({ text: unit.text, start: onset.length ? segments[segments.length - onset.length].start : t, vowel: t, end: stop, midi: n2.midi });
    const weak = nucleus.stress === 0 && noteSeconds < WEAK_NOTE;
    segments.push({ symbol: nucleus.symbol, stress: weak ? 0 : Math.max(1, nucleus.stress), start: t, end: vowelEnd, word: k, label: unit?.text, ...marksOf(nucleus) });
    let c = vowelEnd;
    coda.forEach((p, i) => {
      const d = codaTotal * (codaDur[i] / Math.max(1e-3, codaDur.reduce((a, b) => a + b, 0)));
      segments.push({
        symbol: p.symbol,
        stress: 0,
        start: c,
        end: c + d,
        word: k,
        ...marksOf(p),
        ...p.symbol === "D" && !p.unreleased && i === coda.length - 1 ? { sungFinalD: true } : {}
      });
      c += d;
    });
    cursor = c;
    const hz = midiToHz(n2.midi);
    const onsetAt = onset.length ? segments[segments.length - coda.length - 1 - onset.length].start : start - 0.05;
    const noteLength = Math.min(end, nextStart) - start;
    if (cartoon) {
      const scoop = end - start > 0.4 ? 4 : 2;
      pitchEvents.push([Math.min(start - 0.1, onsetAt), "pitch", hz * 2 ** (-scoop / 12), 12]);
      pitchEvents.push([start - 0.055, "pitch", hz, 30]);
      if (end - start > 0.4 && nextStart - end > 0.15) pitchEvents.push([end - 0.17, "pitch", hz * 0.72, 70]);
    } else {
      const glide = Math.min(legato ? 45 : 20, Math.max(8, 150 * noteLength), Math.max(8, 400 * (start - onsetAt)));
      pitchEvents.push([Math.min(onsetAt, start - 0.03), "pitch", hz, yodel ? 6 : glide]);
    }
    if (yodel) {
      const r = n2.midi > breakMidi ? 1 : 0;
      if (r !== register) pitchEvents.push([start - 0.02, "register", r, 8]);
      register = r;
    }
    if (end - start > 0.45) {
      pitchEvents.push([start - 0.06, "vibratoDepth", 0, 60]);
      pitchEvents.push([start + (cartoon ? 0.12 : 0.22), "vibratoDepth", cartoon ? 0.62 : voice.vibratoDepth, cartoon ? 120 : 180]);
      if (cartoon) pitchEvents.push([start, "vibratoRate", 6.6, 0]);
    }
    const level = voice.loudness - (weak ? 0.07 : 0);
    pitchEvents.push([start - 0.02, "loudness", clampParam("loudness", level + (cartoon ? 0.12 : 0.04)), 25]);
    pitchEvents.push([start + 0.12, "loudness", clampParam("loudness", level), 120]);
  });
  segments.push({ symbol: "SIL", stress: 0, start: cursor, end: cursor + 0.3, word: -1, boundary: "period" });
  const events = articulate(segments, voice);
  if (cartoon) {
    for (const e of events) {
      if (e[1] === "jaw") e[2] = clampParam("jaw", 0.12 + e[2] * 1.35);
      else if (e[1] === "lipOpen" && e[2] > 0.05) e[2] = clampParam("lipOpen", e[2] * 1.2);
      else if (e[1] === "lipRound") e[2] = clampParam("lipRound", e[2] * 1.3);
    }
  }
  if (sorted.length) events.push([0, "pitch", midiToHz(sorted[0].midi), 0]);
  if (opts.directions?.length) directWords(pitchEvents, opts.directions, lyrics, syllables, assignments, notes, segments, voice, cartoon);
  events.push(...pitchEvents);
  events.sort((a, b) => a[0] - b[0]);
  let wordIndex;
  for (const a of assignments) {
    const syllable = syllables[a.syllable];
    if (syllable?.phones.length) wordIndex = syllable.word;
    a.wordIndex = syllable ? wordIndex : void 0;
  }
  return { score: compileScore(events, cursor + 0.4), segments, words: [], warnings: [], assignments, cues };
}
function planSustain(shape2, voice, seconds) {
  const ev = preamble(voice);
  for (const [k, v] of Object.entries(shape2)) ev.push([0, k, v, 0]);
  ev.push([0.02, "gate", 1, 15], [Math.max(0.1, seconds), "gate", 0, 60]);
  return compileScore(ev, seconds + 0.5);
}

// src/core/face-expression.ts
var EXPRESSIONS = ["earnest", "dreamy", "wry"];
var defaultExpression = (index) => EXPRESSIONS[index % EXPRESSIONS.length];
function planFaceNotes(notes, segments, bpm) {
  if (!notes.length) return [];
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const pitches = sorted.map((n2) => n2.midi);
  const low = Math.min(...pitches), high = Math.max(...pitches);
  const beat = 60 / bpm;
  const onsets = /* @__PURE__ */ new Map(), vowels2 = /* @__PURE__ */ new Map();
  for (const s of segments) {
    if (s.word < 0 || s.end <= s.start) continue;
    if (!onsets.has(s.word)) onsets.set(s.word, s);
    if (isVowel(s.symbol) && !vowels2.has(s.word)) vowels2.set(s.word, s);
  }
  return sorted.map((n2, i) => {
    const at = SONG_LEAD + n2.start * beat;
    const onset = onsets.get(i), vowel2 = vowels2.get(i);
    const previous = sorted[i - 1];
    const entrance = !previous || (n2.start - previous.start - previous.length) * beat > 0.2;
    const leap = previous && !entrance ? Math.min(1, Math.abs(n2.midi - previous.midi) / 7) : 0;
    return {
      start: Math.max(previous ? SONG_LEAD + previous.start * beat : 0, Math.min(at, onset?.start ?? at) - 0.05),
      attack: Math.max(at, vowel2?.start ?? at),
      end: SONG_LEAD + (n2.start + n2.length) * beat,
      pitch: 0.5 + (n2.midi - (high + low) / 2) / Math.max(8, high - low),
      accent: Math.min(1, 0.2 + (vowel2?.stress ? 0.38 : 0) + 0.25 * Number(entrance) + 0.3 * leap)
    };
  });
}

// src/core/ensemble-gaze.ts
function phrases(part, bpm) {
  const spans = [];
  if (part.muted || part.level <= 0) return spans;
  const breath = Math.min(0.38, 0.6 * 60 / bpm);
  for (const n2 of part.faceNotes) {
    const last = spans[spans.length - 1];
    if (last && n2.start - last.end <= breath) last.end = Math.max(last.end, n2.end);
    else spans.push({ start: n2.start, end: n2.end });
  }
  return spans;
}
function planGlances(parts, bpm) {
  const spans = parts.map((p) => phrases(p, bpm));
  return spans.map((own, index) => {
    const result = [];
    if (!own.length) return result;
    const events = spans.flatMap(
      (phrases2, singer) => phrases2.flatMap((p, i) => {
        const entrance = !i || p.start - phrases2[i - 1].end >= 0.72;
        return [
          { time: p.start + (singer === index ? 0 : 0.1), singer, on: true, entrance, end: p.end },
          { time: p.end + (singer === index ? 0.1 : 0.16), singer, on: false, entrance: false, end: p.end }
        ];
      })
    ).sort((a, b) => a.time - b.time);
    const active = parts.map(() => false);
    let target = -1, since = 0, ownIndex = -1, lastAcknowledgment = -Infinity;
    for (let i = 0; i < events.length; ) {
      const time = events[i].time;
      let entering;
      do {
        const event = events[i++];
        active[event.singer] = event.on;
        if (event.singer === index && event.on) ownIndex++;
        if (event.entrance && event.singer < index && (!entering || event.singer < entering.singer)) entering = event;
      } while (i < events.length && events[i].time === time);
      const singing = active[index];
      const current = own[ownIndex];
      if (entering && singing && time - current.start > 1.15 && time - lastAcknowledgment > 2.4) {
        const end = Math.min(time + 0.86, entering.end + 0.08, current.end - 0.08);
        if (end - time >= 0.48) {
          result.push({ start: time, end, target: entering.singer });
          lastAcknowledgment = time;
        }
      }
      const next = singing ? -1 : active.findIndex((on, singer) => on && singer !== index);
      if (next === target) continue;
      if (target >= 0 && time - since >= 0.34) {
        const answer = singing ? current : own[ownIndex + 1];
        const answerAt = answer && answer.start - time <= 0.65 && next < 0 ? answer.start : void 0;
        result.push({ start: since, end: time, target, answerAt });
      }
      since = time;
      target = next;
    }
    return result.sort((a, b) => a.start - b.start);
  });
}

// src/core/visemes.ts
function shape(open, spread, round, teeth = 0, bite = 0, tip = 0) {
  return { open, spread, round, teeth, bite, tip };
}
var shapes = {
  rest: shape(0, 0.34, 0),
  seal: shape(0, 0.23, 0.08),
  aa: shape(0.97, 0.65, 0.05, 0.3),
  ae: shape(0.79, 0.93, 0, 0.48),
  ee: shape(0.3, 1, 0, 0.86),
  eh: shape(0.53, 0.82, 0.04, 0.55),
  mid: shape(0.52, 0.53, 0.15, 0.3),
  oh: shape(0.78, 0.28, 0.84, 0.12),
  oo: shape(0.41, 0.08, 1, 0.06),
  rhotic: shape(0.37, 0.4, 0.55, 0.29),
  bite: shape(0.3, 0.68, 0.01, 1, 1),
  dental: shape(0.42, 0.69, 0, 0.61, 0, 1),
  ridge: shape(0.38, 0.66, 0.04, 0.58, 0, 0.73),
  hiss: shape(0.17, 0.85, 0.01, 1),
  hush: shape(0.31, 0.33, 0.7, 0.76),
  back: shape(0.47, 0.56, 0.08, 0.33)
};
var phones = {};
function assign(symbols, pose) {
  for (const symbol of symbols.split(" ")) phones[symbol] = pose;
}
assign("P B M PE CB BR", "seal");
assign("F V", "bite");
assign("TH DH", "dental");
assign("L N D T RR DX TE CD CA", "ridge");
assign("S Z SC ZC CC JC", "hiss");
assign("SH ZH CH JH SR ZR CR JR", "hush");
assign("K G NG KE RU Q", "back");
assign("IY IH Y UU", "ee");
assign("E EH EY", "eh");
assign("AA AY AW", "aa");
assign("AE", "ae");
assign("AO O OW OY", "oh");
assign("U UW UH W YW", "oo");
assign("R ER", "rhotic");
var glides = { EY: "ee", AY: "ee", OY: "ee", AW: "oo", OW: "oo" };
function symbolPose(symbol) {
  const base = PHONEMES[symbol]?.palatalized ? symbol.slice(0, -1) : symbol;
  return symbol === "SIL" ? "rest" : phones[base] ?? "mid";
}
function planVisemes(segments) {
  const keys = [{ time: 0, pose: "rest" }];
  for (const [i, s] of segments.entries()) {
    const duration = s.end - s.start;
    if (duration <= 0) continue;
    while (keys.length && keys[keys.length - 1].time > s.start) keys.pop();
    const next = segments[i + 1];
    const pose = symbolPose(s.symbol === "HH" && next ? next.symbol : s.symbol);
    const attack = Math.min(duration * 0.25, pose === "seal" ? 0.012 : 0.034);
    const release = Math.min(duration * 0.25, next && symbolPose(next.symbol) === "seal" ? 0.044 : 0.03);
    keys.push({ time: s.start + attack, pose });
    const glide = glides[s.symbol];
    if (glide) {
      const end = duration > 0.4 ? s.end - 0.1 : s.start + duration * 0.8;
      keys.push({ time: Math.max(s.start + attack, end - Math.min(0.13, duration * 0.55)), pose });
      keys.push({ time: end, pose: glide });
    }
    keys.push({ time: Math.max(keys[keys.length - 1].time, s.end - release), pose: glide ?? pose });
  }
  return keys;
}

// src/core/presets.ts
var SIGNATURE = {
  pitch: 212,
  loudness: 0.72,
  tenseness: 0.4,
  breath: 0.15,
  vibratoDepth: 0.18,
  vibratoRate: 5.4,
  tractLength: 14.2,
  throat: 0.5,
  gain: 0.7,
  humanize: 0.45,
  space: 0.18,
  register: 0,
  fry: 0,
  growl: 0,
  twang: 0,
  pharynx: 1,
  // A +3 dB lift at 1.6 kHz: against real speakers (TSP) it lowered the mel-cepstral distance by
  // 0.53 dB; the voice itself is weak in the 1–4 kHz presence region.
  mic: 0.4,
  eqLow: 0,
  eqMid: 3,
  eqHigh: 0,
  comp: 0,
  drive: 0
};
var VOICE_PRESETS = [
  { id: "signature", name: "Signature", description: "Clear and warm, lightly breathy \u2014 the default character voice.", voice: SIGNATURE },
  { id: "warm", name: "Warm", description: "Lower, rounder and softer, with a wider throat.", voice: { ...SIGNATURE, pitch: 194, tenseness: 0.2, breath: 0.3, tractLength: 14.8, throat: 0.72, space: 0.22 } },
  { id: "bright", name: "Bright", description: "Higher and firmer with a shorter tract.", voice: { ...SIGNATURE, pitch: 238, tenseness: 0.5, breath: 0.14, tractLength: 13.6, throat: 0.34 } },
  { id: "airy", name: "Airy", description: "Soft and breathy, close to the microphone.", voice: { ...SIGNATURE, pitch: 222, tenseness: 0.1, breath: 0.62, humanize: 0.5, space: 0.12 } },
  { id: "lyric", name: "Lyric", description: "Singing voice with fuller vibrato and a little hall.", voice: { ...SIGNATURE, pitch: 330, tenseness: 0.42, breath: 0.18, vibratoDepth: 0.34, vibratoRate: 5.6, space: 0.38, loudness: 0.8 } },
  { id: "head", name: "Head voice", description: "Light falsetto: thin folds that never quite close, high and airy.", voice: { ...SIGNATURE, pitch: 440, register: 1, tenseness: 0.3, breath: 0.2, vibratoDepth: 0.22 } },
  { id: "gravel", name: "Gravel", description: "Low and rough: the ventricular folds growl, with a little fry.", voice: { ...SIGNATURE, pitch: 165, growl: 0.55, fry: 0.15, tenseness: 0.5, breath: 0.12, loudness: 0.82, tractLength: 14.8 } },
  { id: "twang", name: "Twang", description: "Bright and ringing: a narrowed epilarynx, firm and forward.", voice: { ...SIGNATURE, pitch: 250, twang: 0.8, tenseness: 0.48, breath: 0.12, throat: 0.3 } },
  { id: "child", name: "Child", description: "A child body: a 12.6 cm tract and a high, light voice.", voice: { ...SIGNATURE, pitch: 280, tractLength: 12.6, pharynx: 1.1, tenseness: 0.32, breath: 0.2, vibratoDepth: 0.12 } },
  { id: "tenor", name: "Tenor", description: "An adult male body (16.4 cm tract), singing high and bright.", voice: { ...SIGNATURE, pitch: 196, tractLength: 16.4, pharynx: 1, tenseness: 0.42, breath: 0.12, throat: 0.45, vibratoDepth: 0.22 } },
  { id: "baritone", name: "Baritone", description: "An adult male body (16.4 cm tract) with a low, warm voice.", voice: { ...SIGNATURE, pitch: 120, tractLength: 16.4, pharynx: 1, tenseness: 0.35, breath: 0.14, throat: 0.6, humanize: 0.4 } },
  { id: "alto", name: "Alto", description: "Darker, lower feminine voice.", voice: { ...SIGNATURE, pitch: 176, tenseness: 0.3, breath: 0.22, tractLength: 15.2, throat: 0.62 } }
];
var closed = { tipClose: 0, dorsumClose: 0, velum: 0, lateral: 0, voicing: 1 };
var VOWEL_PRESETS = [
  ...["IY", "IH", "EY", "EH", "AE", "AA", "AO", "OW", "UH", "UW", "AH", "ER"].map((s) => ({
    id: s.toLowerCase(),
    label: s,
    ipa: PHONEMES[s].ipa.replace("\u026A", "\u026A"),
    example: PHONEMES[s].example,
    shape: { ...closed, rhotic: 0, ...PHONEMES[s].target }
  })),
  { id: "schwa", label: "AX", ipa: "\u0259", example: "about", shape: { ...closed, ...SCHWA } },
  { id: "hum", label: "M", ipa: "m", example: "hum", shape: { ...closed, ...SCHWA, lipOpen: 0, velum: 1 } }
];

// src/core/ensemble.ts
var AVATAR_COLORS = ["original", "rose", "jade", "violet"];
var defaultAvatarColor = (index) => AVATAR_COLORS[index % AVATAR_COLORS.length];
var MOVEMENTS = ["nod", "sway", "bounce", "still"];
var defaultMovement = (index) => MOVEMENTS[index % 3];
function validateEnsemble(input, checkNotes) {
  const e = input;
  if (!e || typeof e.title !== "string" || !e.title.trim() || e.title.length > 120)
    throw new Error("Give the arrangement a title of 1\u2013120 characters.");
  if (!Number.isFinite(e.bpm) || e.bpm < 30 || e.bpm > 240) throw new Error("Tempo must be 30\u2013240 BPM.");
  if (!Array.isArray(e.singers) || e.singers.length < 1 || e.singers.length > 3) throw new Error("Choose one to three singers.");
  const singers = e.singers.map((s, i) => {
    if (!s || typeof s.name !== "string" || !s.name.trim() || s.name.length > 40 || !VOICE_PRESETS.some((v) => v.id === s.voice))
      throw new Error("Each singer needs a name and a voice preset.");
    if (typeof s.lyrics !== "string" || s.lyrics.length > 8e3 || typeof s.muted !== "boolean")
      throw new Error("Invalid lyrics or mute setting.");
    if (!Number.isFinite(s.level) || s.level < 0 || s.level > 1 || !Number.isFinite(s.pan) || Math.abs(s.pan) > 1)
      throw new Error("Invalid singer mix.");
    const notes = checkNotes(s.notes).sort((a, b) => a.start - b.start);
    if (notes.some(
      (n2, i2) => n2.start + n2.length > e.bpm * 6 || i2 > 0 && n2.start < notes[i2 - 1].start + notes[i2 - 1].length - 1e-6
    ))
      throw new Error("Each part must fit six minutes and play one note at a time.");
    const avatarColor = s.avatarColor === void 0 ? defaultAvatarColor(i) : s.avatarColor;
    if (!AVATAR_COLORS.includes(avatarColor)) throw new Error("Unknown Nous Girl avatar color.");
    const movement = s.movement === void 0 ? defaultMovement(i) : s.movement;
    if (!MOVEMENTS.includes(movement)) throw new Error("Unknown singer movement.");
    const expression = s.expression === void 0 ? defaultExpression(i) : s.expression;
    if (!EXPRESSIONS.includes(expression)) throw new Error("Unknown singer expression.");
    return { name: s.name, voice: s.voice, avatarColor, movement, expression, lyrics: s.lyrics, level: s.level, pan: s.pan, muted: s.muted, notes };
  });
  let excerpt;
  if (e.excerpt !== void 0) {
    const { start, end } = e.excerpt ?? {};
    const lastBeat = Math.max(0, ...singers.flatMap((s) => s.notes.map((n2) => n2.start + n2.length)));
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 362 || start >= lastBeat * 60 / e.bpm + 0.65)
      throw new Error("Choose an excerpt that starts inside the arrangement and ends after it starts.");
    excerpt = { start, end };
  }
  return { title: e.title, bpm: e.bpm, singers, ...excerpt ? { excerpt } : {} };
}
var STAGE_FPS = 25;
function planEnsemble(e, lexicon2) {
  const parts = e.singers.map((s) => {
    const voice = VOICE_PRESETS.find((v) => v.id === s.voice).voice;
    const text = s.lyrics.trim() || "[UW]";
    const vamp = !/\s/.test(text) && lyricSyllables(text, lexicon2).length === 1;
    const lyrics = vamp ? s.notes.map(() => text).join(" ") : text;
    const { score, cues, segments } = planSong(s.notes, lyrics, lexicon2, { bpm: e.bpm, voice });
    return { score, cues, visemes: planVisemes(segments), faceNotes: planFaceNotes(s.notes, segments, e.bpm), level: s.level, pan: s.pan, muted: s.muted || !s.notes.length };
  });
  const glances = planGlances(parts, e.bpm);
  return parts.map((part, index) => ({ ...part, glances: glances[index] }));
}
var POSE_SIZE = 5;
function renderEnsemble(module2, parts, rate2, seed2 = 1) {
  const frames = Math.ceil((Math.max(...parts.map((p) => p.score.length)) + 0.6) * rate2);
  const left2 = new Float32Array(frames), right2 = new Float32Array(frames);
  const poses = [];
  let resets2 = 0;
  for (const [i, part] of parts.entries()) {
    const pose = new Float32Array(Math.ceil(frames / rate2 * STAGE_FPS) * POSE_SIZE);
    poses.push(pose);
    if (part.muted || part.level === 0) continue;
    const engine = new Engine(module2, rate2, seed2 + i);
    const score = part.score;
    const paged = score.events.length / 4 > engine.scoreCapacity;
    let event = 0;
    if (!paged) {
      engine.loadScore(score);
      engine.play();
    }
    const pan = (part.pan + 1) * Math.PI / 4;
    const l = part.level * Math.cos(pan), r = part.level * Math.sin(pan);
    const end = Math.ceil((part.score.length + 0.6) * rate2);
    let at = 0;
    for (let f = 0; at < end; f++) {
      if (paged && f % STAGE_FPS === 0) {
        const second = f / STAGE_FPS, start2 = event;
        while (event < score.events.length && Math.round(score.events[event] * rate2) < (second + 1) * rate2) event += 4;
        const events = score.events.slice(start2, event);
        for (let j = 0; j < events.length; j += 4) events[j] = Math.max(0, Math.round(events[j] * rate2) / rate2 - second);
        if (events.length / 4 > engine.scoreCapacity) throw new Error("Too many simultaneous vocal gestures.");
        engine.loadScore({ events, length: Math.max(1e-3, score.length - second) });
        engine.play();
      }
      const next = Math.min(end, Math.round((f + 1) * rate2 / STAGE_FPS));
      let power = 0;
      const start = at;
      while (at < next) {
        const [a, b] = engine.render(Math.min(4096, next - at));
        for (let j = 0; j < a.length; j++) {
          left2[at + j] += a[j] * l;
          right2[at + j] += b[j] * r;
          power += a[j] * a[j];
        }
        at += a.length;
      }
      const p = engine.params(), state = engine.state();
      pose.set(
        [p[PARAM_ID.jaw], p[PARAM_ID.lipOpen], p[PARAM_ID.lipRound], Math.sqrt(power / (at - start)), state[STATE.f0]],
        f * POSE_SIZE
      );
    }
    resets2 += engine.state()[STATE.resets];
  }
  let peak = 0;
  for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(left2[i]), Math.abs(right2[i]));
  if (peak > 0.94)
    for (let i = 0; i < frames; i++) {
      left2[i] *= 0.94 / peak;
      right2[i] *= 0.94 / peak;
    }
  return { left: left2, right: right2, poses, rate: rate2, resets: resets2 };
}
function clipSamples(mix, excerpt) {
  const start = excerpt ? Math.min(mix.left.length, Math.round(excerpt.start * mix.rate)) : 0;
  const end = excerpt ? Math.min(mix.left.length, Math.round(excerpt.end * mix.rate)) : mix.left.length;
  return { start, end };
}

// src/core/beat.ts
var BEAT_SOUNDS = [
  { id: "kick", label: "Kick", phones: "PE", length: 0.25, midi: 48, help: "p\u2032, an ejective: the larynx is the piston" },
  { id: "snare", label: "Snare", phones: "P+F", length: 0.25, midi: 48, help: "pf: a lip burst into a hiss" },
  { id: "hat", label: "Hat", phones: "T+S", length: 0.125, midi: 48, help: "ts: a tip burst into a short hiss" },
  { id: "open", label: "Open hat", phones: "T+S", length: 0.5, midi: 48, help: "tss: the hiss held" },
  { id: "click", label: "Click", phones: "CA", length: 0.25, midi: 48, help: "\u01C3, a click: the tongue pulls a vacuum" },
  { id: "bass", label: "Bass", phones: "BR", length: 0.5, midi: 41, help: "brr: a lip trill at a low pitch" },
  { id: "hum", label: "Hum", phones: "M", length: 0.5, midi: 48, help: "mm: a hummed note" }
];
var pattern = (s) => s.trim().split(/\s+/).map((t) => t === "." ? "" : t);
var BEAT_PRESETS = [
  { id: "boots", name: "Boots", steps: pattern("kick . hat . snare . hat . kick kick hat . snare . hat .") },
  { id: "four", name: "Four on the floor", steps: pattern("kick . hat . kick . hat . kick . hat . kick . open .") },
  { id: "bounce", name: "Bounce", steps: pattern("kick . . click snare . bass . . kick hat . snare . hum .") }
];
function newBeat() {
  return { bpm: 92, steps: [...BEAT_PRESETS[0].steps], loop: true };
}
function validateBeat(input) {
  const base = newBeat();
  if (input === void 0) return base;
  if (!input || typeof input !== "object") throw new TypeError("beat must be an object");
  const b = { ...base, ...input };
  if (typeof b.bpm !== "number" || !Number.isFinite(b.bpm) || b.bpm < 50 || b.bpm > 200) throw new RangeError("beat.bpm must be a number from 50 to 200");
  if (!Array.isArray(b.steps) || b.steps.length !== 16 && b.steps.length !== 32) throw new TypeError("beat.steps must be a list of 16 or 32 steps");
  const ids = new Set(BEAT_SOUNDS.map((s) => s.id));
  const steps = b.steps.map((s, i) => {
    if (s === "" || s === null) return "";
    if (typeof s !== "string" || !ids.has(s)) throw new TypeError(`beat step ${i} must be one of ${[...ids].join(", ")} or empty`);
    return s;
  });
  if (typeof b.loop !== "boolean") throw new TypeError("beat.loop must be true or false");
  return { bpm: b.bpm, steps, loop: b.loop };
}
function beatSong(beat) {
  const notes = [];
  const words = [];
  beat.steps.forEach((id, i) => {
    const sound = BEAT_SOUNDS.find((s) => s.id === id);
    if (!sound) return;
    let next = i + 1;
    while (next < beat.steps.length && !beat.steps[next]) next++;
    const room = (next - i) * 0.25;
    notes.push({ start: i * 0.25, length: Math.max(0.0625, Math.min(sound.length, room) - 0.02), midi: sound.midi });
    words.push(`[${sound.phones}]`);
  });
  return { notes, lyrics: words.join(" ") };
}

// src/core/duet.ts
var DUET_PARTS = [["off", "Off"], ["octaveBelow", "Octave below"], ["fifthBelow", "Fifth below"], ["thirdAbove", "Third above"], ["custom", "Written part"]];
function newDuet() {
  return { part: "off", voice: "baritone", notes: [], lyrics: "" };
}
var MAJOR = [0, 2, 4, 5, 7, 9, 11];
function duetNotes(melody, duet) {
  if (duet.part === "off") return [];
  if (duet.part === "custom") return duet.notes;
  const sorted = [...melody].sort((a, b) => a.start - b.start);
  const tonic = sorted.length ? (sorted[sorted.length - 1].midi % 12 + 12) % 12 : 0;
  const shift = (m) => {
    if (duet.part === "octaveBelow") return m - 12;
    if (duet.part === "fifthBelow") return m - 7;
    const degree = MAJOR.indexOf(((m - tonic) % 12 + 12) % 12);
    if (degree < 0) return m + 4;
    const up = MAJOR[(degree + 2) % 7] + (degree + 2 >= 7 ? 12 : 0) - MAJOR[degree];
    return m + up;
  };
  return melody.map((n2) => ({ ...n2, midi: Math.min(96, Math.max(36, shift(n2.midi))) }));
}
function duetVoice(duet) {
  return (VOICE_PRESETS.find((v) => v.id === duet.voice) ?? VOICE_PRESETS.find((v) => v.id === "baritone")).voice;
}
function validateDuet(input, validateNotes) {
  const base = newDuet();
  if (input === void 0) return base;
  if (!input || typeof input !== "object") throw new TypeError("song.duet must be an object");
  const d = { ...base, ...input };
  if (!DUET_PARTS.some(([id]) => id === d.part)) throw new TypeError(`song.duet.part must be one of ${DUET_PARTS.map((p) => p[0]).join(", ")}`);
  if (typeof d.voice !== "string" || !VOICE_PRESETS.some((v) => v.id === d.voice)) throw new TypeError(`song.duet.voice must be a voice preset id (${VOICE_PRESETS.map((v) => v.id).join(", ")})`);
  if (typeof d.lyrics !== "string" || d.lyrics.length > 2e3) throw new TypeError("song.duet.lyrics must be text up to 2000 characters");
  return { part: d.part, voice: d.voice, notes: validateNotes(d.notes), lyrics: d.lyrics };
}

// src/core/takes.ts
var MAX_TAKES = 12;
function validateTakes(raw, checkNotes) {
  if (raw === void 0) return [];
  if (!Array.isArray(raw) || raw.length > MAX_TAKES) throw new TypeError("Expected up to 12 jam takes");
  const ids = /* @__PURE__ */ new Set();
  const part = (p) => {
    if (!p || !Number.isFinite(p.bpm) || p.bpm < 30 || p.bpm > 240 || typeof p.lyrics !== "string" || p.lyrics.length > 8e3 || !["natural", "cartoon", "yodel"].includes(p.style)) throw new TypeError("Invalid jam take part");
    const notes = checkNotes(p.notes);
    if (notes.some((n2) => (n2.start + n2.length) * 60 / p.bpm > 360)) throw new RangeError("Take part exceeds six minutes");
    const directions = validateDirections(p.directions);
    return {
      notes,
      lyrics: p.lyrics,
      bpm: p.bpm,
      style: p.style,
      voice: validatePatch(p.voice),
      ...p.shape ? { shape: validatePatch(p.shape) } : {},
      ...directions.length ? { directions } : {}
    };
  };
  return raw.map((t) => {
    if (!t || typeof t.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(t.id) || ids.has(t.id)) throw new TypeError("Invalid or duplicate jam take ID");
    ids.add(t.id);
    const call = part(t.call), reply = part(t.reply);
    const length = (side) => side.notes.reduce((end, n2) => Math.max(end, n2.start + n2.length), 0) * 60 / side.bpm;
    if (call.notes.length + reply.notes.length > 2048 || length(call) + length(reply) > 360) throw new RangeError("A take can contain up to 2,048 notes and six minutes of music");
    return { id: t.id, call, reply };
  });
}

// src/core/show.ts
function planShow(items, lexicon2, voice) {
  const events = [];
  const cues = [];
  const sections = [];
  let t0 = 0;
  for (const item of items) {
    const v = { ...voice, ...item.voice ?? {} };
    let score;
    let local = [];
    let beat = 0;
    if (item.kind === "say") {
      const plan = planSpeech(item.text, lexicon2, { voice: v, rate: item.rate ?? 1, expression: item.expression ?? 0.8 });
      score = plan.score;
      const byWord = /* @__PURE__ */ new Map();
      for (const s of plan.segments) {
        if (s.symbol === "SIL" || s.word < 0) continue;
        const w = byWord.get(s.word) ?? { start: s.start, vowel: Infinity, end: s.end };
        w.start = Math.min(w.start, s.start);
        w.end = Math.max(w.end, s.end);
        if (isVowel(s.symbol)) w.vowel = Math.min(w.vowel, s.start);
        byWord.set(s.word, w);
      }
      local = [...byWord.entries()].map(([k, w]) => {
        const word = plan.words[k];
        const text = word.text + (word.boundary === "question" ? "?" : word.boundary === "exclaim" ? "!" : word.boundary === "period" ? "." : word.boundary === "comma" ? "," : "");
        return { text, start: w.start, vowel: Number.isFinite(w.vowel) ? w.vowel : w.start, end: w.end, midi: 0 };
      });
    } else if (item.shape && !item.lyrics.trim()) {
      const keyEvents = [];
      for (const [param, value] of Object.entries({ ...defaultPatch(), ...v, ...item.shape })) keyEvents.push([0, param, value, 0]);
      beat = 60 / item.bpm;
      keyEvents.push([0, "gate", 0, 0]);
      let end = 0;
      const notes = [...item.notes].sort((a, b) => a.start - b.start);
      for (const [i, note] of notes.entries()) {
        const start = note.start * beat;
        end = Math.min((note.start + note.length) * beat, (notes[i + 1]?.start ?? Infinity) * beat);
        keyEvents.push([start, "pitch", midiToHz(note.midi), 20], [start, "gate", 1, 12]);
        if (!notes[i + 1] || end < notes[i + 1].start * beat) keyEvents.push([end, "gate", 0, 40]);
      }
      score = compileScore(keyEvents, end + 0.18);
    } else {
      const plan = planSong(item.notes, item.lyrics, lexicon2, { bpm: item.bpm, voice: v, style: item.style ?? "cartoon", directions: item.directions });
      score = plan.score;
      local = plan.cues;
      beat = 60 / item.bpm;
    }
    for (let i = 0; i < score.events.length; i += 4) {
      events.push([score.events[i] + t0, PARAM_NAMES[score.events[i + 1]], score.events[i + 2], score.events[i + 3]]);
    }
    for (const c of local) cues.push({ ...c, start: c.start + t0, vowel: c.vowel + t0, end: c.end + t0 });
    sections.push({ kind: item.kind, start: t0, end: t0 + score.length, beat });
    t0 += score.length + (item.pause ?? 0.15);
  }
  return { score: compileScore(events, t0), cues, sections, length: t0 };
}
var SWING = 2 / 3;
var n = (start, length, midi) => ({ start, length, midi });
var LOUNGE_SET = [
  { kind: "say", text: "Hello, hello! Is this thing on?", rate: 0.95, expression: 1, pause: 0.35 },
  { kind: "say", text: "I'm just a tube, with a tongue. Hit it!", rate: 0.82, expression: 1, pause: 0.1 },
  {
    kind: "sing",
    bpm: 150,
    lyrics: "doo bee doo bee doo wah - shoo bop shoo bop bah!",
    notes: [
      n(0, 0.35, 67),
      n(SWING, 0.3, 70),
      n(1, 0.35, 67),
      n(1 + SWING, 0.3, 70),
      n(2, 0.35, 72),
      n(2 + SWING, 0.9, 74),
      n(3 + SWING, 0.3, 69),
      n(4, 0.35, 65),
      n(4 + SWING, 0.3, 67),
      n(5, 0.35, 65),
      n(5 + SWING, 0.3, 67),
      n(6, 1.4, 50)
    ]
  },
  {
    // The verse is slower and straight, with the body part held: the words must land.
    kind: "sing",
    bpm: 132,
    lyrics: "my tongue goes la la la! my lips go boop boop boop! my nose goes hmm hmm! my jaw goes wah wah wah!",
    notes: [
      n(0, 0.45, 64),
      n(0.5, 0.9, 67),
      n(1.5, 0.45, 65),
      n(2, 0.4, 72),
      n(2.5, 0.4, 74),
      n(3, 0.9, 76),
      n(4, 0.45, 64),
      n(4.5, 0.9, 67),
      n(5.5, 0.45, 65),
      n(6, 0.4, 60),
      n(6.5, 0.4, 55),
      n(7, 0.9, 50),
      n(8, 0.45, 64),
      n(8.5, 0.9, 67),
      n(9.5, 0.45, 65),
      n(10, 0.8, 71),
      n(11, 0.9, 67),
      n(12, 0.45, 64),
      n(12.5, 0.9, 67),
      n(13.5, 0.45, 65),
      n(14, 0.4, 72),
      n(14.5, 0.4, 70),
      n(15, 1.4, 67)
    ],
    pause: 0.3
  },
  { kind: "say", text: "No samples. No auto tune. Just physics!", rate: 0.9, expression: 1, pause: 0.25 },
  {
    kind: "sing",
    bpm: 150,
    lyrics: "boom tss kh tss boom boom tss kh tss boom tk pff!",
    notes: [
      n(0, 0.3, 45),
      n(0.5, 0.2, 60),
      n(1, 0.2, 60),
      n(1.5, 0.2, 60),
      n(2, 0.3, 45),
      n(2.5, 0.3, 45),
      n(3, 0.2, 60),
      n(3.5, 0.2, 60),
      n(4, 0.2, 60),
      n(4.5, 0.3, 45),
      n(5, 0.2, 60),
      n(5.5, 0.4, 60)
    ],
    pause: 0.2
  },
  {
    kind: "sing",
    bpm: 150,
    lyrics: "bee bop bee boop hey! ho! hey! ho! yay - -",
    notes: [
      n(0, 0.35, 72),
      n(SWING, 0.3, 67),
      n(1, 0.35, 74),
      n(1 + SWING, 0.3, 67),
      n(2, 0.6, 76),
      n(3, 0.6, 55),
      n(4, 0.6, 76),
      n(5, 0.6, 50),
      n(6, 1.5, 72),
      n(7.5, 1, 76),
      n(8.5, 1.5, 79)
    ],
    pause: 0.45
  },
  { kind: "say", text: "Thank you! Thank you! Tip your physicist!", rate: 0.8, expression: 1 }
];

// src/core/project.ts
var LIMITS = { notes: 2048, text: 1e3, lyrics: 8e3, seconds: 360, name: 120 };
var DEMO_PHRASE = "Hello there! I shape every sound with my tongue, my lips and a little breath. Shall we sing?";
var DEMO_LYRICS = "Ev-ery qui-et sig-nal finds a way to sing, o-pen up the morn-ing light";
var DEMO_NOTES = [
  // An original 4/4 melody in C major (beats).
  [0, 0.5, 64],
  [0.5, 0.5, 67],
  [1, 0.5, 69],
  [1.5, 0.5, 67],
  [2, 1, 72],
  [3, 0.5, 71],
  [3.5, 0.5, 69],
  [4, 0.5, 67],
  [4.5, 0.5, 64],
  [5, 1, 62],
  [6, 2, 64],
  [8.5, 0.5, 60],
  [9, 0.5, 62],
  [9.5, 0.5, 64],
  [10, 1, 67],
  [11, 0.5, 69],
  [11.5, 0.5, 71],
  [12, 3, 72]
].map(([start, length, midi]) => ({ start, length, midi }));
var SILLY = [
  // [syllable, start beat, length beats, MIDI]
  ["doo", 0, 0.5, 67],
  ["bee", 0.5, 0.5, 69],
  ["doo", 1, 0.5, 67],
  ["bee", 1.5, 0.5, 64],
  ["wah", 2, 1, 72],
  ["-", 3, 1, 65],
  ["shoo", 4, 0.5, 60],
  ["bop", 4.5, 0.5, 64],
  ["shoo", 5, 0.5, 62],
  ["bop", 5.5, 0.5, 65],
  ["bah!", 6, 1.5, 67],
  ["my", 8, 0.5, 64],
  ["tongue", 8.5, 0.5, 65],
  ["goes", 9, 0.5, 67],
  ["la", 9.5, 0.5, 72],
  ["la", 10, 0.5, 74],
  ["la!", 10.5, 1, 76],
  ["my", 12, 0.5, 64],
  ["lips", 12.5, 0.5, 65],
  ["go", 13, 0.5, 67],
  ["boop", 13.5, 0.5, 60],
  ["boop", 14, 0.5, 60],
  ["boop!", 14.5, 1, 55],
  ["my", 16, 0.5, 64],
  ["nose", 16.5, 0.5, 65],
  ["goes", 17, 0.5, 67],
  ["hum", 17.5, 0.5, 71],
  ["hum!", 18, 1.5, 67],
  ["my", 20, 0.5, 64],
  ["jaw", 20.5, 0.5, 65],
  ["goes", 21, 0.5, 67],
  ["wah", 21.5, 0.5, 72],
  ["wah", 22, 0.5, 70],
  ["woo", 22.5, 1, 67],
  ["-", 23.5, 0.5, 60],
  ["bee", 24, 0.5, 72],
  ["bop", 24.5, 0.5, 67],
  ["bee", 25, 0.5, 74],
  ["boop", 25.5, 0.5, 67],
  ["hey!", 26, 0.75, 76],
  ["ho!", 27, 0.75, 64],
  ["yay", 28, 1.5, 72],
  ["-", 29.5, 2.5, 76]
];
var SILLY_SONG = {
  bpm: 132,
  lyrics: SILLY.map((s) => s[0]).join(" "),
  notes: SILLY.map(([, start, length, midi]) => ({ start, length, midi })),
  loop: false,
  style: "cartoon",
  duet: newDuet()
};
function newProject(name = "Untitled voice") {
  return {
    version: 2,
    name,
    mode: "play",
    voice: { ...SIGNATURE },
    shape: { ...VOWEL_PRESETS.find((v) => v.id === "aa").shape },
    speech: { text: DEMO_PHRASE, phonemes: false, rate: 1, expression: 0.6 },
    song: { bpm: 96, lyrics: DEMO_LYRICS, notes: DEMO_NOTES.map((n2) => ({ ...n2 })), loop: false, style: "natural", duet: newDuet() },
    beat: newBeat(),
    sustain: 2
  };
}
var num = (v, lo, hi, label) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) throw new RangeError(`${label} must be a number from ${lo} to ${hi}`);
  return v;
};
function validateProject(input) {
  if (!input || typeof input !== "object") throw new TypeError("Project must be an object");
  const p = input;
  const base = newProject();
  const allowed = /* @__PURE__ */ new Set(["version", "name", "mode", "voice", "shape", "speech", "song", "beat", "sustain", "takes", "activeTake", "ensemble"]);
  for (const k of Object.keys(p)) if (!allowed.has(k)) throw new TypeError(`Unknown project field "${k}"`);
  if (p.version !== void 0 && p.version !== 2) throw new TypeError("Unsupported project version");
  const name = p.name ?? base.name;
  if (typeof name !== "string" || name.length > LIMITS.name) throw new TypeError(`name must be text up to ${LIMITS.name} characters`);
  const mode2 = p.mode ?? base.mode;
  if (!["play", "speak", "sing", "beat", "ensemble"].includes(mode2)) throw new TypeError("mode must be play, speak, sing, beat or ensemble");
  const speech = { ...base.speech, ...p.speech ?? {} };
  if (typeof speech.text !== "string" || speech.text.length > LIMITS.text) throw new TypeError(`speech.text must be up to ${LIMITS.text} characters`);
  if (typeof speech.phonemes !== "boolean") throw new TypeError("speech.phonemes must be true or false");
  num(speech.rate, 0.4, 2.5, "speech.rate");
  num(speech.expression, 0, 1, "speech.expression");
  const song = { ...base.song, ...p.song ?? {} };
  num(song.bpm, 30, 240, "song.bpm");
  if (typeof song.lyrics !== "string" || song.lyrics.length > LIMITS.lyrics) throw new TypeError(`song.lyrics must be up to ${LIMITS.lyrics} characters`);
  if (typeof song.loop !== "boolean") throw new TypeError("song.loop must be true or false");
  if (!["natural", "cartoon", "yodel"].includes(song.style)) throw new TypeError("song.style must be natural, cartoon or yodel");
  if (!Array.isArray(song.notes) || song.notes.length > LIMITS.notes) throw new TypeError(`song.notes must be a list of at most ${LIMITS.notes}`);
  const checkNotes = (list, maxStart = 1024) => {
    if (!Array.isArray(list) || list.length > LIMITS.notes) throw new TypeError(`song.notes must be a list of at most ${LIMITS.notes}`);
    return list.map((n2, i) => {
      if (!n2 || typeof n2 !== "object") throw new TypeError(`note ${i} must be an object`);
      return { start: num(n2.start, 0, maxStart, `note ${i} start`), length: num(n2.length, 0.0625, 64, `note ${i} length`), midi: Math.round(num(n2.midi, 36, 96, `note ${i} midi`)) };
    });
  };
  const notes = checkNotes(song.notes);
  const ensemble = p.ensemble === void 0 ? void 0 : validateEnsemble(p.ensemble, (list) => checkNotes(list, 1440));
  if (mode2 === "ensemble" && !ensemble) throw new Error("The clip needs an arrangement.");
  const takes = validateTakes(p.takes, checkNotes);
  if (p.activeTake !== void 0 && !takes.some((t) => t.id === p.activeTake)) throw new TypeError("Unknown active take");
  const directions = validateDirections(song.directions);
  const duet = validateDuet(song.duet, checkNotes);
  const seconds = notes.reduce((m, n2) => Math.max(m, (n2.start + n2.length) * 60 / song.bpm), 0);
  if (seconds > LIMITS.seconds) throw new RangeError(`Song is longer than ${LIMITS.seconds} seconds`);
  return {
    version: 2,
    name,
    mode: mode2,
    voice: { ...SIGNATURE, ...validatePatch(p.voice ?? base.voice, "voice") },
    shape: { ...validatePatch(p.shape ?? base.shape, "shape") },
    speech,
    song: { bpm: song.bpm, lyrics: song.lyrics, loop: song.loop, style: song.style, notes, duet, ...directions.length ? { directions } : {} },
    ...ensemble ? { ensemble } : {},
    ...takes.length ? { takes } : {},
    ...p.activeTake ? { activeTake: p.activeTake } : {},
    beat: validateBeat(p.beat),
    sustain: num(p.sustain ?? base.sustain, 0.2, 30, "sustain")
  };
}
function songFromScore(score, maxStart = 1024) {
  const messages = [...score.warnings];
  let bpm = score.bpm;
  let scale = 1;
  while (bpm * scale > 240) scale /= 2;
  while (bpm * scale < 30) scale *= 2;
  bpm = Math.round(bpm * scale * 1e3) / 1e3;
  const beats = LIMITS.seconds * bpm / 60;
  let notes = score.notes.map((n2) => ({ start: n2.start * scale, length: Math.min(64, Math.max(0.0625, n2.length * scale)), midi: n2.midi }));
  const kept = notes.filter((n2) => n2.start + n2.length <= Math.min(beats, maxStart + 64) && n2.start <= maxStart).slice(0, LIMITS.notes);
  if (kept.length < notes.length) messages.push(`The score is longer than a song can be (${LIMITS.seconds / 60} minutes, ${LIMITS.notes} notes): the first ${kept.length} of ${notes.length} notes were imported.`);
  notes = kept;
  let lyrics = score.lyrics;
  if (lyrics.length > LIMITS.lyrics) lyrics = lyrics.slice(0, lyrics.lastIndexOf(" ", LIMITS.lyrics));
  return { song: { bpm, notes, lyrics }, messages };
}
function duetScore(project2, lexicon2) {
  if (project2.activeTake) return null;
  const duet = project2.song.duet;
  const notes = duetNotes(project2.song.notes, duet);
  if (!notes.length) return null;
  const voice = { ...SIGNATURE, ...duetVoice(duet) };
  const plan = planSong(notes, duet.part === "custom" && duet.lyrics ? duet.lyrics : project2.song.lyrics, lexicon2, { bpm: project2.song.bpm, voice, style: project2.song.style, directions: duet.part === "custom" && duet.lyrics ? void 0 : project2.song.directions });
  return { score: plan.score, voice };
}
function projectScore(project2, lexicon2, mode2 = project2.mode) {
  if (mode2 === "ensemble") throw new Error("Use planEnsemble for a multi-singer arrangement.");
  if (mode2 === "speak") {
    const plan = planSpeech(project2.speech.text, lexicon2, { voice: project2.voice, rate: project2.speech.rate, expression: project2.speech.expression, phonemes: project2.speech.phonemes });
    return { score: plan.score, warnings: plan.warnings };
  }
  if (mode2 === "sing") {
    const take = project2.takes?.find((t) => t.id === project2.activeTake);
    if (take) return { score: planTake(take, lexicon2).score, warnings: [] };
    const plan = planSong(project2.song.notes, project2.song.lyrics, lexicon2, { bpm: project2.song.bpm, voice: project2.voice, style: project2.song.style, directions: project2.song.directions });
    return { score: plan.score, warnings: plan.warnings };
  }
  if (mode2 === "beat") {
    const { notes, lyrics } = beatSong(project2.beat);
    const plan = planSong(notes, lyrics, lexicon2, { bpm: project2.beat.bpm, voice: project2.voice });
    return { score: plan.score, warnings: plan.warnings };
  }
  return { score: planSustain(project2.shape, project2.voice, project2.sustain), warnings: [] };
}
function planTake(take, lexicon2) {
  return planShow([take.call, take.reply].map((part) => ({ ...part, kind: "sing", pause: 0 })), lexicon2, {});
}

// src/core/score-import.ts
var MAX_BYTES = 20 * 1024 * 1024;
var MAX_NOTES = 2e4;
var MAX_RAW = 2e5;
var MAX_MEASURES = 5e4;
var MAX_ELEMENTS = 3e6;
var MAX_REPEAT_TIMES = 32;
var MAX_ZIP_ENTRIES = 1e4;
var MIN_LEN = 0.0625;
var MAX_LEN = 64;
var GRID = 960;
var LOW = 36;
var HIGH = 96;
var MAX_DURATION = 4096;
function cleanSyllable(raw) {
  const hangul = raw.normalize("NFC").match(/[\uAC00-\uD7A3]+/)?.[0];
  if (hangul) return { text: hangul, trail: /[!?.,]+$/.exec(raw.trim())?.[0] ?? "" };
  const russian = raw.normalize("NFC").match(/[А-Яа-яЁё][А-Яа-яЁё\u0301]*/)?.[0];
  if (russian) return { text: russian, trail: /[!?.,]+$/.exec(raw.trim())?.[0] ?? "" };
  const plain = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[‘’ʼ]/g, "'");
  const word = plain.split(/[\s_]+/).find((w) => /[A-Za-z]/.test(w));
  if (!word) return null;
  return { text: word.replace(/[^A-Za-z']/g, ""), trail: /[!?.,]+$/.exec(word)?.[0] ?? "" };
}
function buildLyrics(evs, warnings2) {
  if (!evs.some((e) => e.lyric)) {
    if (evs.length) warnings2.push("This part has no lyrics; it will be hummed.");
    return "";
  }
  const tokens = [];
  let word = null;
  let inWord = false;
  let sung = false;
  let split = 0;
  const flush = () => {
    if (word) tokens.push(word.map((l) => l.text).join("-") + word[word.length - 1].trail);
    word = null;
  };
  for (const e of evs) {
    const l = e.lyric;
    if (!l) {
      flush();
      tokens.push(sung ? "-" : "la");
      continue;
    }
    const continues = inWord && (l.kind === "middle" || l.kind === "end");
    if (continues && word) word.push(l);
    else {
      if (continues) split++;
      flush();
      word = [l];
    }
    inWord = l.kind === "begin" || l.kind === "middle";
    sung = true;
  }
  flush();
  if (split) warnings2.push(`${split} word${split === 1 ? " has" : "s have"} a melisma inside and ${split === 1 ? "was" : "were"} split there.`);
  return tokens.join(" ");
}
function finish(input, bpm, parts, part, warnings2, preserveStart = false) {
  const round = (x) => Math.round(x * GRID) / GRID;
  let bad = 0;
  const sorted = [];
  for (const e of input) {
    if (Number.isFinite(e.start) && Number.isFinite(e.end) && Number.isFinite(e.midi) && e.start >= 0 && e.midi >= 0 && e.midi <= 127) {
      sorted.push({ ...e, start: round(e.start), midi: Math.round(e.midi) });
    } else bad++;
  }
  if (bad) warnings2.push(`${bad} malformed note${bad === 1 ? " was" : "s were"} skipped.`);
  sorted.sort((a, b) => a.start - b.start || b.midi - a.midi);
  const line = [];
  let dropped = 0;
  for (const e of sorted) {
    let last = line[line.length - 1];
    if (last && e.start === last.start) {
      last.lyric ??= e.lyric;
      dropped++;
      continue;
    }
    while (last && e.start - last.start < MIN_LEN) {
      line.pop();
      dropped++;
      e.lyric ??= last.lyric;
      last = line[line.length - 1];
    }
    if (last && last.end > e.start) last.end = e.start;
    line.push(e);
  }
  if (dropped) warnings2.push(`${dropped} overlapping note${dropped === 1 ? " was" : "s were"} dropped to keep one note at a time.`);
  if (line.length > MAX_NOTES) {
    warnings2.push(`Only the first ${MAX_NOTES} notes were imported.`);
    line.length = MAX_NOTES;
  }
  if (line.length) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of line) {
      lo = Math.min(lo, e.midi);
      hi = Math.max(hi, e.midi);
    }
    if (lo < LOW || hi > HIGH) {
      const k = lo < LOW ? 12 * Math.ceil((LOW - lo) / 12) : -12 * Math.ceil((hi - HIGH) / 12);
      if (lo + k >= LOW && hi + k <= HIGH) {
        for (const e of line) e.midi += k;
        warnings2.push(`The melody was transposed ${Math.abs(k) / 12} octave${Math.abs(k) === 12 ? "" : "s"} ${k > 0 ? "up" : "down"} to fit the singer's range.`);
      } else {
        let moved = 0;
        for (const e of line) {
          const m = e.midi < LOW ? e.midi + 12 * Math.ceil((LOW - e.midi) / 12) : e.midi > HIGH ? e.midi - 12 * Math.ceil((e.midi - HIGH) / 12) : e.midi;
          if (m !== e.midi) moved++;
          e.midi = m;
        }
        warnings2.push(`${moved} note${moved === 1 ? "" : "s"} outside the singer's range ${moved === 1 ? "was" : "were"} moved by octaves into it.`);
      }
    }
    if (!preserveStart && line[0].start > 4) {
      const shift = Math.floor(line[0].start);
      for (const e of line) {
        e.start = round(e.start - shift);
        e.end -= shift;
      }
      warnings2.push(`${shift} beats of silence before the first note were removed.`);
    }
  }
  const notes = line.map((e) => ({ start: e.start, length: Math.min(MAX_LEN, Math.max(MIN_LEN, round(e.end - e.start))), midi: e.midi }));
  return { bpm, notes, lyrics: buildLyrics(line, warnings2), parts, part, warnings: warnings2 };
}
var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\xA0" };
function decodeEntities(s) {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,8});/g, (all, body) => {
    if (body[0] !== "#") return ENTITIES[body] ?? all;
    const code = body[1] === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code > 0 && code <= 1114111 && !(code >= 55296 && code <= 57343) ? String.fromCodePoint(code) : "";
  });
}
function parseXml(src) {
  const root = { name: "#document", attrs: "", kids: [], text: "" };
  const stack = [root];
  const n2 = src.length;
  let i = 0;
  let count = 0;
  const local = (name) => name.slice(name.lastIndexOf(":") + 1);
  while (i < n2) {
    const lt = src.indexOf("<", i);
    const top = stack[stack.length - 1];
    if (lt < 0) break;
    if (lt > i && !top.kids.length) top.text += src.slice(i, lt);
    if (src.startsWith("<!--", lt)) {
      const e = src.indexOf("-->", lt + 4);
      i = e < 0 ? n2 : e + 3;
    } else if (src.startsWith("<![CDATA[", lt)) {
      const e = src.indexOf("]]>", lt + 9);
      top.text += src.slice(lt + 9, e < 0 ? n2 : e).replace(/&/g, "&amp;");
      i = e < 0 ? n2 : e + 3;
    } else if (src.startsWith("<?", lt)) {
      const e = src.indexOf("?>", lt + 2);
      i = e < 0 ? n2 : e + 2;
    } else if (src.startsWith("<!", lt)) {
      let e = lt + 2;
      let depth = 0;
      for (; e < n2; e++) {
        const c = src.charCodeAt(e);
        if (c === 91) depth++;
        else if (c === 93) depth--;
        else if (c === 62 && depth <= 0) break;
      }
      i = e + 1;
    } else if (src.charCodeAt(lt + 1) === 47) {
      const e = src.indexOf(">", lt);
      const name = local(src.slice(lt + 2, e < 0 ? n2 : e).trim());
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = e < 0 ? n2 : e + 1;
    } else {
      let e = lt + 1;
      let quote = 0;
      for (; e < n2; e++) {
        const c = src.charCodeAt(e);
        if (quote) {
          if (c === quote) quote = 0;
        } else if (c === 34 || c === 39) quote = c;
        else if (c === 62) break;
      }
      const body = src.slice(lt + 1, e);
      i = e + 1;
      const selfClosing = body.endsWith("/");
      const m = /^([^\s/]+)/.exec(body);
      if (!m) continue;
      if (++count > MAX_ELEMENTS) throw new Error("The score is too large to import (too many XML elements).");
      const el = { name: local(m[1]), attrs: body.slice(m[1].length, selfClosing ? -1 : void 0), kids: [], text: "" };
      top.kids.push(el);
      if (!selfClosing) stack.push(el);
    }
  }
  return root;
}
var kid = (el, name) => el?.kids.find((k) => k.name === name);
var kidsOf = (el, name) => el ? el.kids.filter((k) => k.name === name) : [];
var textOf = (el) => el ? decodeEntities(el.text).trim() : "";
var ATTR_CACHE = /* @__PURE__ */ new Map();
function attr(el, name) {
  if (!el || !el.attrs) return void 0;
  let re = ATTR_CACHE.get(name);
  if (!re) ATTR_CACHE.set(name, re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  const m = re.exec(el.attrs);
  return m ? decodeEntities(m[1] ?? m[2]) : void 0;
}
function walk(el, visit) {
  const stack = [el];
  while (stack.length) {
    const e = stack.pop();
    visit(e);
    for (let k = e.kids.length - 1; k >= 0; k--) stack.push(e.kids[k]);
  }
}
function num2(s) {
  if (s === void 0) return NaN;
  const t = s.trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}
var STEPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
var BEAT_UNITS = { long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5, "16th": 0.25, "32nd": 0.125, "64th": 0.0625 };
var isSounded = (note) => !!kid(note, "pitch") && !kid(note, "grace") && !kid(note, "cue");
function verseOf(lyric, index) {
  const v = parseInt(attr(lyric, "number") ?? "", 10);
  return Number.isFinite(v) ? v : index + 1;
}
function lyricOf(note, verse) {
  const lyrics = kidsOf(note, "lyric");
  for (let k = 0; k < lyrics.length; k++) {
    if (verseOf(lyrics[k], k) !== verse) continue;
    const clean = cleanSyllable(textOf(kid(lyrics[k], "text")));
    if (!clean) continue;
    const syllabic = textOf(kid(lyrics[k], "syllabic"));
    const kind = syllabic === "begin" || syllabic === "middle" || syllabic === "end" ? syllabic : "single";
    return { ...clean, kind };
  }
  return void 0;
}
function surveyPart(part) {
  const measures = kidsOf(part, "measure");
  let notes = 0;
  let verse = Infinity;
  for (const m of measures) {
    for (const note of m.kids) {
      if (note.name !== "note" || !isSounded(note)) continue;
      notes++;
      const lyrics = kidsOf(note, "lyric");
      for (let k = 0; k < lyrics.length; k++) {
        if (cleanSyllable(textOf(kid(lyrics[k], "text")))) verse = Math.min(verse, verseOf(lyrics[k], k));
      }
    }
  }
  return { measures, notes, verse };
}
function marksOf2(measure2) {
  const marks = { forward: false, back: 0, endingStart: null, endingStop: false };
  for (const barline of kidsOf(measure2, "barline")) {
    const repeat = kid(barline, "repeat");
    const direction = attr(repeat, "direction");
    if (direction === "forward") marks.forward = true;
    if (direction === "backward") {
      const times = parseInt(attr(repeat, "times") ?? "", 10);
      marks.back = Number.isFinite(times) && times >= 1 ? Math.min(times, MAX_REPEAT_TIMES) : 2;
    }
    for (const ending of kidsOf(barline, "ending")) {
      const type = attr(ending, "type");
      if (type === "start") {
        const numbers = (attr(ending, "number") ?? "").split(/[,\s]+/).map((s) => parseInt(s, 10)).filter((v) => Number.isFinite(v) && v >= 1 && v <= MAX_REPEAT_TIMES);
        marks.endingStart = numbers.length ? numbers : [1];
      } else if (type === "stop" || type === "discontinue") marks.endingStop = true;
    }
  }
  return marks;
}
function unroll(marks) {
  const n2 = marks.length;
  const ending = [];
  let open = null;
  for (const m of marks) {
    if (m.endingStart) open = m.endingStart;
    ending.push(open);
    if (m.endingStop) open = null;
  }
  const groupMax = new Array(n2).fill(0);
  for (let i2 = 0; i2 < n2; ) {
    if (!ending[i2]) {
      i2++;
      continue;
    }
    let j = i2;
    let max = 0;
    for (; j < n2 && ending[j]; j++) max = Math.max(max, ...ending[j]);
    for (let k = i2; k < j; k++) groupMax[k] = max;
    i2 = j;
  }
  const order = [];
  let i = 0;
  let start = 0;
  let pass = 1;
  while (i < n2) {
    if (order.length >= MAX_MEASURES) return { order, capped: true };
    const m = marks[i];
    if (m.forward && i !== start) {
      start = i;
      pass = 1;
    }
    const e = ending[i];
    const leavesEndings = !!e && (i + 1 >= n2 || !ending[i + 1]);
    if (e && !e.includes(pass)) {
      if (leavesEndings) {
        start = i + 1;
        pass = 1;
      }
      i++;
      continue;
    }
    order.push(i);
    if (m.back) {
      if (pass < (e ? Math.max(groupMax[i], m.back) : m.back)) {
        pass++;
        i = start;
        continue;
      }
      if (!e) {
        start = i + 1;
        pass = 1;
      }
    }
    if (leavesEndings) {
      start = i + 1;
      pass = 1;
    }
    i++;
  }
  return { order, capped: false };
}
function temposOf(root) {
  const out = [];
  const add = (bpm) => {
    if (bpm >= 5 && bpm <= 1e3) out.push(bpm);
  };
  walk(root, (e) => {
    if (e.name === "sound") add(num2(attr(e, "tempo")));
    else if (e.name === "metronome") {
      const perMinute = /\d+(\.\d+)?/.exec(textOf(kid(e, "per-minute")))?.[0];
      if (!perMinute) return;
      const unit = BEAT_UNITS[textOf(kid(e, "beat-unit"))] ?? 1;
      let dots = 0;
      for (const k of e.kids) {
        if (k.name === "per-minute") break;
        if (k.name === "beat-unit-dot") dots++;
      }
      add(Number(perMinute) * unit * (2 - Math.pow(0.5, Math.min(dots, 4))));
    }
  });
  return out;
}
function partsOfTimewise(root) {
  const parts = /* @__PURE__ */ new Map();
  for (const measure2 of kidsOf(root, "measure")) {
    for (const p of kidsOf(measure2, "part")) {
      const id = attr(p, "id") ?? "";
      let part = parts.get(id);
      if (!part) parts.set(id, part = { name: "part", attrs: p.attrs, kids: [], text: "" });
      part.kids.push({ name: "measure", attrs: measure2.attrs, kids: p.kids, text: "" });
    }
  }
  return [...parts.values()];
}
function playPart(measures, verse, warnings2) {
  const divisionsAt = [];
  let divisions = 1;
  let jumps = false;
  for (const m of measures) {
    divisionsAt.push(divisions);
    for (const k of m.kids) {
      if (k.name === "attributes") {
        const d = num2(textOf(kid(k, "divisions")));
        if (d > 0) divisions = d;
      } else if (k.name === "direction" || k.name === "sound") {
        walk(k, (e) => {
          if (e.name === "segno" || e.name === "coda" || e.name === "sound" && /(?:^|\s)(dacapo|dalsegno|tocoda|fine|segno|coda)\s*=/.test(e.attrs)) jumps = true;
        });
      }
    }
  }
  if (jumps) warnings2.push("D.C., D.S., segno and coda jumps are not followed; the score is read straight through.");
  const { order, capped } = unroll(measures.map(marksOf2));
  if (capped) warnings2.push(`Repeats were cut off after ${MAX_MEASURES} measures.`);
  const out = [];
  let skipped = 0;
  let measureStart = 0;
  const duration = (el, div) => {
    const d = num2(textOf(kid(el, "duration"))) / div;
    return d >= 0 && d <= MAX_DURATION ? d : NaN;
  };
  play: for (const index of order) {
    let div = divisionsAt[index];
    let pos = 0;
    let reach = 0;
    let lastStart = 0;
    for (const k of measures[index].kids) {
      if (k.name === "attributes") {
        const d = num2(textOf(kid(k, "divisions")));
        if (d > 0) div = d;
      } else if (k.name === "backup") {
        const d = duration(k, div);
        if (d >= 0) pos = Math.max(0, pos - d);
      } else if (k.name === "forward") {
        const d = duration(k, div);
        if (d >= 0) pos += d;
        reach = Math.max(reach, pos);
      } else if (k.name === "note") {
        if (kid(k, "grace")) continue;
        const d = duration(k, div);
        if (Number.isNaN(d)) {
          skipped++;
          continue;
        }
        const chord = !!kid(k, "chord");
        const start = chord ? lastStart : pos;
        if (!chord) {
          lastStart = pos;
          pos += d;
          reach = Math.max(reach, pos);
        }
        const pitch = kid(k, "pitch");
        if (!pitch || kid(k, "rest") || kid(k, "cue")) continue;
        const step = STEPS[textOf(kid(pitch, "step")).toUpperCase()];
        const octave = num2(textOf(kid(pitch, "octave")));
        const alter = kid(pitch, "alter") ? num2(textOf(kid(pitch, "alter"))) : 0;
        const midi = 12 * (octave + 1) + step + Math.round(Number.isNaN(alter) ? 0 : alter);
        if (!Number.isInteger(midi) || midi < 0 || midi > 127 || d === 0) {
          skipped++;
          continue;
        }
        let ties = kidsOf(k, "tie").map((t) => attr(t, "type"));
        if (!ties.length) ties = kidsOf(kid(k, "notations"), "tied").map((t) => attr(t, "type"));
        out.push({
          start: measureStart + start,
          end: measureStart + start + d,
          midi,
          lyric: lyricOf(k, verse),
          voice: textOf(kid(k, "voice")) || "1",
          chord,
          tieStart: ties.includes("start") || ties.includes("continue"),
          tieStop: ties.includes("stop") || ties.includes("continue")
        });
        if (out.length >= MAX_RAW) {
          warnings2.push(`Only the first ${MAX_RAW} notes of the part were read.`);
          break play;
        }
      }
    }
    measureStart += reach;
  }
  if (skipped) warnings2.push(`${skipped} malformed note${skipped === 1 ? " was" : "s were"} skipped.`);
  return out;
}
function reduceVoice(raw, warnings2) {
  const voices = /* @__PURE__ */ new Map();
  for (const n2 of raw) {
    let v = voices.get(n2.voice);
    if (!v) voices.set(n2.voice, v = { notes: 0, lyrics: 0 });
    v.notes++;
    if (n2.lyric) v.lyrics++;
  }
  let voice = "";
  let best = { notes: -1, lyrics: -1 };
  for (const [name, v] of voices) {
    if (v.lyrics > best.lyrics || v.lyrics === best.lyrics && v.notes > best.notes) {
      voice = name;
      best = v;
    }
  }
  if (voices.size > 1) warnings2.push(`The part has ${voices.size} voices; voice ${voice} was kept and the rest dropped.`);
  const single = [];
  let chords = 0;
  for (const n2 of raw) {
    if (n2.voice !== voice) continue;
    const head = single[single.length - 1];
    if (n2.chord && head && head.start === n2.start) {
      if (!chords++) warnings2.push("Chords were reduced to their highest note.");
      if (n2.midi > head.midi) single[single.length - 1] = { ...n2, lyric: head.lyric ?? n2.lyric, chord: false };
      else head.lyric ??= n2.lyric;
    } else single.push({ ...n2, chord: false });
  }
  single.sort((a, b) => a.start - b.start);
  const out = [];
  const tied = /* @__PURE__ */ new Map();
  for (const n2 of single) {
    const from = tied.get(n2.midi);
    if (n2.tieStop && from && Math.abs(n2.start - from.end) < 0.01) {
      from.end = n2.end;
      if (!n2.tieStart) tied.delete(n2.midi);
      continue;
    }
    out.push(n2);
    if (n2.tieStart) tied.set(n2.midi, n2);
    else tied.delete(n2.midi);
  }
  return out;
}
function importMusicXml(xml, opts = {}) {
  if (typeof xml !== "string") throw new Error("MusicXML import needs the file as text.");
  if (xml.length > MAX_BYTES) throw new Error("The score is too large to import (over 20 MB).");
  if (!/<(?:[\w.-]+:)?score-(?:partwise|timewise)[\s>/]/.test(xml)) {
    throw new Error("This is not a MusicXML score (no <score-partwise> element).");
  }
  let root;
  walk(parseXml(xml), (e) => {
    if (!root && (e.name === "score-partwise" || e.name === "score-timewise")) root = e;
  });
  if (!root) throw new Error("This is not a MusicXML score (no <score-partwise> element).");
  const warnings2 = [];
  const names = /* @__PURE__ */ new Map();
  walk(kid(root, "part-list") ?? { name: "", attrs: "", kids: [], text: "" }, (e) => {
    if (e.name === "score-part") names.set(attr(e, "id") ?? "", textOf(kid(e, "part-name")));
  });
  const partEls = root.name === "score-timewise" ? partsOfTimewise(root) : kidsOf(root, "part");
  const surveyed = partEls.map((el, k) => {
    const id = attr(el, "id") ?? `P${k + 1}`;
    return { id, name: names.get(id) || id, ...surveyPart(el) };
  });
  const parts = surveyed.map((p) => ({ id: p.id, name: p.name, notes: p.notes }));
  const tempos = temposOf(root);
  const bpm = tempos.length ? Math.round(tempos[0] * 1e3) / 1e3 : 120;
  if (tempos.some((t) => Math.abs(t - tempos[0]) > 0.01)) warnings2.push(`The tempo changes during the score; the first tempo (${bpm} bpm) is used throughout.`);
  if (!surveyed.length) {
    warnings2.push("The score has no parts.");
    return { bpm, notes: [], lyrics: "", parts, part: "", warnings: warnings2 };
  }
  let chosen = opts.part !== void 0 ? surveyed.find((p) => p.id === opts.part) : void 0;
  if (opts.part !== void 0 && !chosen) warnings2.push(`The score has no part "${opts.part}"; another was chosen.`);
  chosen ??= surveyed.find((p) => Number.isFinite(p.verse) && p.notes > 0) ?? surveyed[0];
  const line = reduceVoice(playPart(chosen.measures, chosen.verse, warnings2), warnings2);
  return finish(line, bpm, parts, chosen.id, warnings2, opts.preserveStart);
}
function decodeBytes(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return s;
  }
}
function readTrack(b, from, to, budget) {
  const track = { name: "", notes: [], lyrics: [], texts: [], tempos: [] };
  const open = /* @__PURE__ */ new Map();
  let p = from;
  let tick = 0;
  let status = 0;
  const varlen = () => {
    let v = 0;
    for (let k = 0; k < 4 && p < to; k++) {
      const c = b[p++];
      v = v * 128 + (c & 127);
      if (!(c & 128)) break;
    }
    return v;
  };
  const noteOff = (key) => {
    const n2 = open.get(key)?.shift();
    if (n2) n2.end = tick;
  };
  while (p < to) {
    tick += varlen();
    if (p >= to) break;
    let s = b[p];
    if (s & 128) p++;
    else if (status) s = status;
    else break;
    if (s === 255) {
      const type = b[p++];
      const length = varlen();
      const data = b.subarray(p, Math.min(to, p + length));
      p += length;
      if (type === 47) break;
      if (type === 81 && data.length >= 3) {
        const micros = data[0] << 16 | data[1] << 8 | data[2];
        if (micros > 0) track.tempos.push({ tick, bpm: 6e7 / micros });
      } else if (type === 3 && !track.name) track.name = decodeBytes(data).trim().slice(0, 200);
      else if ((type === 5 || type === 1) && data.length <= 1024 && track.lyrics.length + track.texts.length < MAX_RAW) {
        (type === 5 ? track.lyrics : track.texts).push({ tick, text: decodeBytes(data) });
      }
    } else if (s === 240 || s === 247) {
      p += varlen();
    } else if (s >= 240) {
      break;
    } else {
      status = s;
      const kind = s & 240;
      const channel = s & 15;
      const d1 = b[p++] & 127;
      const d2 = kind === 192 || kind === 208 ? 0 : b[p++] & 127;
      if (p > to) break;
      const key = channel * 128 + d1;
      if (kind === 144 && d2 > 0) {
        if (budget.notes <= 0) continue;
        budget.notes--;
        const n2 = { tick, end: -1, midi: d1, channel };
        track.notes.push(n2);
        const stack = open.get(key);
        if (stack) stack.push(n2);
        else open.set(key, [n2]);
      } else if (kind === 128 || kind === 144) noteOff(key);
    }
  }
  for (const n2 of track.notes) if (n2.end < 0) n2.end = tick;
  return track;
}
function midiSyllables(events) {
  const items = [];
  let pendingBreak = false;
  for (const ev of events) {
    const raw = ev.text;
    const clean = cleanSyllable(raw.replace(/^[\s/\\]+/, ""));
    if (!clean) {
      pendingBreak = true;
      continue;
    }
    items.push({ tick: ev.tick, ...clean, lead: /^[\s/\\]/.test(raw), space: /\s$/.test(raw), hyphen: /-\s*$/.test(raw), breakBefore: pendingBreak });
    pendingBreak = false;
  }
  const spaced = items.some((it) => it.lead || it.space);
  const starts = items.map((it, k) => {
    if (k === 0 || it.breakBefore) return true;
    const prev = items[k - 1];
    if (prev.hyphen) return false;
    return spaced ? it.lead || prev.space : true;
  });
  return items.map((it, k) => {
    const more = k + 1 < items.length && !starts[k + 1];
    const kind = starts[k] ? more ? "begin" : "single" : more ? "middle" : "end";
    return { tick: it.tick, lyric: { text: it.text, trail: it.trail, kind } };
  });
}
function lyricEventsOf(track) {
  if (track.lyrics.length) return track.lyrics;
  const texts = track.texts.filter((t) => !t.text.startsWith("@"));
  return texts.filter((t) => t.tick > 0).length >= 2 ? texts : [];
}
function importMidi(bytes, opts = {}) {
  if (!(bytes instanceof Uint8Array)) throw new Error("MIDI import needs the file as bytes.");
  if (bytes.length > MAX_BYTES) throw new Error("The MIDI file is too large to import (over 20 MB).");
  const tag = (at2) => String.fromCharCode(bytes[at2], bytes[at2 + 1], bytes[at2 + 2], bytes[at2 + 3]);
  const u32 = (at2) => bytes[at2] * 16777216 + (bytes[at2 + 1] << 16) + (bytes[at2 + 2] << 8) + bytes[at2 + 3];
  const u16 = (at2) => bytes[at2] << 8 | bytes[at2 + 1];
  let head = -1;
  for (let k = 0; k + 14 <= bytes.length && k < 256; k++) {
    if (bytes[k] === 77 && tag(k) === "MThd") {
      head = k;
      break;
    }
  }
  if (head < 0) throw new Error("This is not a MIDI file (no MThd header).");
  const warnings2 = [];
  const format = u16(head + 8);
  const division = u16(head + 12);
  let ticksPerBeat = division;
  let timecode = false;
  if (division & 32768) {
    timecode = true;
    ticksPerBeat = (256 - (division >> 8)) * (division & 255) / 2;
    warnings2.push("The file is timed in seconds, not beats; it is read as 120 bpm.");
  }
  if (!(ticksPerBeat > 0)) throw new Error("This MIDI file has no usable time division.");
  if (format === 2) warnings2.push("The file holds independent patterns (format 2); each is listed as a track.");
  const tracks = [];
  const budget = { notes: MAX_RAW };
  for (let p = head + 8 + u32(head + 4); p + 8 <= bytes.length && tracks.length < 1024; ) {
    const end = Math.min(bytes.length, p + 8 + u32(p + 4));
    if (tag(p) === "MTrk") tracks.push(readTrack(bytes, p + 8, end, budget));
    p = end;
  }
  if (budget.notes <= 0) warnings2.push(`Only the first ${MAX_RAW} notes of the file were read.`);
  const pitched = tracks.map((t) => t.notes.filter((n2) => n2.channel !== 9));
  const parts = tracks.map((t, k) => ({ id: String(k), name: t.name || `Track ${k + 1}`, notes: pitched[k].length }));
  const tempos = tracks.flatMap((t) => t.tempos).sort((a, b) => a.tick - b.tick);
  const bpm = timecode || !tempos.length ? 120 : Math.round(tempos[0].bpm * 1e3) / 1e3;
  if (!timecode && tempos.some((t) => Math.abs(t.bpm - tempos[0].bpm) > 0.01)) warnings2.push(`The tempo changes during the file; the first tempo (${bpm} bpm) is used throughout.`);
  if (!tracks.length) {
    warnings2.push("The MIDI file has no tracks.");
    return { bpm, notes: [], lyrics: "", parts, part: "", warnings: warnings2 };
  }
  let chosen = -1;
  if (opts.track !== void 0) {
    if (Number.isInteger(opts.track) && opts.track >= 0 && opts.track < tracks.length) chosen = opts.track;
    else warnings2.push(`The file has no track ${opts.track}; another was chosen.`);
  }
  if (chosen < 0) chosen = tracks.findIndex((t, k) => pitched[k].length > 0 && lyricEventsOf(t).length > 0);
  if (chosen < 0) chosen = pitched.reduce((best, notes2, k) => notes2.length > pitched[best].length ? k : best, 0);
  let notes = pitched[chosen];
  if (!notes.length && tracks[chosen].notes.length) warnings2.push("The chosen track only has percussion; nothing was imported.");
  const channels = /* @__PURE__ */ new Map();
  for (const n2 of notes) channels.set(n2.channel, (channels.get(n2.channel) ?? 0) + 1);
  if (channels.size > 1) {
    const keep = [...channels].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    notes = notes.filter((n2) => n2.channel === keep);
    warnings2.push(`The track uses ${channels.size} channels; channel ${keep + 1} was kept and the rest dropped.`);
  }
  notes = [...notes].sort((a, b) => a.tick - b.tick || b.midi - a.midi);
  const line = notes.filter((n2, k) => k === 0 || n2.tick !== notes[k - 1].tick);
  const chords = notes.length - line.length;
  if (chords) warnings2.push(`${chords} simultaneous note${chords === 1 ? " was" : "s were"} dropped; the highest of each chord is kept.`);
  let events = lyricEventsOf(tracks[chosen]);
  if (!events.length) events = tracks.filter((t, k) => !pitched[k].length).map(lyricEventsOf).find((e) => e.length) ?? [];
  const slack = Math.max(1, ticksPerBeat / 16);
  let at = 0;
  let unplaced = 0;
  for (const s of midiSyllables([...events].sort((a, b) => a.tick - b.tick))) {
    while (at < line.length && line[at].tick < s.tick - slack) at++;
    if (at < line.length && line[at].tick - s.tick <= ticksPerBeat) line[at++].lyric = s.lyric;
    else unplaced++;
  }
  if (unplaced) warnings2.push(`${unplaced} lyric syllable${unplaced === 1 ? " was" : "s were"} not on a note and ${unplaced === 1 ? "was" : "were"} left out.`);
  const evs = line.map((n2) => ({ start: n2.tick / ticksPerBeat, end: n2.end / ticksPerBeat, midi: n2.midi, lyric: n2.lyric }));
  return finish(evs, bpm, parts, String(chosen), warnings2, opts.preserveStart);
}
function decodeXmlBytes(bytes) {
  let label = "utf-8";
  if (bytes[0] === 255 && bytes[1] === 254) label = "utf-16le";
  else if (bytes[0] === 254 && bytes[1] === 255) label = "utf-16be";
  else if (bytes[0] === 60 && bytes[1] === 0) label = "utf-16le";
  else if (bytes[0] === 0 && bytes[1] === 60) label = "utf-16be";
  else {
    let headText = "";
    for (let k = 0; k < Math.min(200, bytes.length); k++) headText += String.fromCharCode(bytes[k]);
    const declared = /^(?:ï»¿)?<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(headText)?.[1];
    if (declared) label = declared;
  }
  let text;
  try {
    text = new TextDecoder(label).decode(bytes);
  } catch {
    text = new TextDecoder("utf-8").decode(bytes);
  }
  return text.charCodeAt(0) === 65279 ? text.slice(1) : text;
}
async function inflateRaw(data, limit) {
  if (typeof DecompressionStream === "undefined") throw new Error("Compressed scores (.mxl) cannot be opened here: no DecompressionStream.");
  const reader = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const chunks = [];
  let total = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel().catch(() => {
        });
        throw new Error("The score is too large to import (over 20 MB unpacked).");
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("The score is too large")) throw err;
    throw new Error("The compressed score (.mxl) is damaged and could not be unpacked.");
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
async function readMxl(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const damaged = () => new Error("This is not a compressed MusicXML file (.mxl): the zip archive is damaged.");
  let eocd = -1;
  for (let p2 = bytes.length - 22; p2 >= 0 && p2 >= bytes.length - 22 - 65535; p2--) {
    if (view.getUint32(p2, true) === 101010256) {
      eocd = p2;
      break;
    }
  }
  if (eocd < 0) throw new Error("This is not a compressed MusicXML file (.mxl): no zip directory.");
  const count = Math.min(view.getUint16(eocd + 10, true), MAX_ZIP_ENTRIES);
  const entries = [];
  let p = view.getUint32(eocd + 16, true);
  for (let k = 0; k < count; k++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 33639248) break;
    const nameLength = view.getUint16(p + 28, true);
    entries.push({
      name: decodeBytes(bytes.subarray(p + 46, p + 46 + nameLength)),
      method: view.getUint16(p + 10, true),
      packed: view.getUint32(p + 20, true),
      size: view.getUint32(p + 24, true),
      header: view.getUint32(p + 42, true)
    });
    p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  const read = async (name) => {
    const e = entries.find((x) => x.name === name) ?? entries.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!e) return void 0;
    if (e.size > MAX_BYTES || e.packed > MAX_BYTES) throw new Error("The score is too large to import (over 20 MB unpacked).");
    if (e.header + 30 > bytes.length || view.getUint32(e.header, true) !== 67324752) throw damaged();
    const from = e.header + 30 + view.getUint16(e.header + 26, true) + view.getUint16(e.header + 28, true);
    if (from + e.packed > bytes.length) throw damaged();
    const data = bytes.subarray(from, from + e.packed);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateRaw(data, MAX_BYTES);
    throw new Error("The compressed score (.mxl) uses a compression method that is not supported.");
  };
  let rootfile;
  const container = await read("META-INF/container.xml");
  if (container) {
    const tagText = /<rootfile\b[^>]*>/.exec(decodeXmlBytes(container))?.[0] ?? "";
    const m = /\bfull-path\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(tagText);
    if (m) rootfile = decodeEntities(m[1] ?? m[2]).replace(/^\/+/, "");
  }
  let score = rootfile ? await read(rootfile) : void 0;
  if (!score) {
    const first = entries.find((e) => /\.(musicxml|xml)$/i.test(e.name) && !/^META-INF\//i.test(e.name));
    if (first) score = await read(first.name);
  }
  if (!score) throw new Error("The compressed score (.mxl) has no MusicXML file inside.");
  return decodeXmlBytes(score);
}
async function importScoreFile(name, bytes, opts = {}) {
  if (!(bytes instanceof Uint8Array)) throw new Error("Score import needs the file as bytes.");
  if (bytes.length > MAX_BYTES) throw new Error("The file is too large to import (over 20 MB).");
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1].toLowerCase() ?? "";
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  const kind = magic === "MThd" ? "midi" : magic === "PK" ? "mxl" : ext === "mid" || ext === "midi" || ext === "kar" || magic === "RIFF" ? "midi" : ext === "mxl" ? "mxl" : ext === "musicxml" || ext === "xml" ? "xml" : bytes.length && (bytes[0] === 60 || bytes[0] === 239 || bytes[0] === 255 || bytes[0] === 254) ? "xml" : "";
  if (kind === "midi") {
    const track = opts.part !== void 0 && /^\d+$/.test(opts.part) ? Number(opts.part) : void 0;
    if (opts.part !== void 0 && track === void 0) {
      const out = importMidi(bytes, { preserveStart: opts.preserveStart });
      out.warnings.unshift(`The file has no track "${opts.part}"; another was chosen.`);
      return out;
    }
    return importMidi(bytes, { track, preserveStart: opts.preserveStart });
  }
  if (kind === "mxl") return importMusicXml(await readMxl(bytes), opts);
  if (kind === "xml") return importMusicXml(decodeXmlBytes(bytes), opts);
  throw new Error(`"${name}" is not a score this can import: use MusicXML (.musicxml, .xml, .mxl) or MIDI (.mid).`);
}

// src/core/wav.ts
function encodeWav(channels, sampleRate) {
  const n2 = channels[0]?.length ?? 0;
  const ch = channels.length;
  const bytes = new Uint8Array(44 + n2 * ch * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + n2 * ch * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, n2 * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n2; i++) {
    for (let c = 0; c < ch; c++) {
      const v = channels[c][i];
      const s = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
      view.setInt16(o, Math.round(s * 32767), true);
      o += 2;
    }
  }
  return bytes;
}
function measure(x) {
  let peak = 0;
  let sum = 0;
  for (const v of x) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, x.length)) };
}

// src/cli/render.ts
var here = dirname(fileURLToPath(import.meta.url));
var args = /* @__PURE__ */ new Map();
var argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args.set(argv[i].replace(/^--/, ""), argv[i + 1] ?? "");
function fail(message) {
  process.stderr.write(`${message}
`);
  process.exit(2);
}
var output = args.get("output") || fail("--output is required");
var project = newProject();
if (args.has("project")) project = validateProject(JSON.parse(readFileSync(args.get("project"), "utf8")));
if (args.has("text")) project = { ...project, mode: "speak", speech: { ...project.speech, text: args.get("text"), phonemes: args.get("phonemes") === "1" } };
var scoreNotes = [];
if (args.has("score")) {
  const file = args.get("score");
  const { song, messages } = songFromScore(await importScoreFile(file, new Uint8Array(readFileSync(file)), { part: args.get("part") || void 0 }));
  scoreNotes.push(...messages);
  project = validateProject({ ...project, mode: "sing", song: { ...project.song, ...song } });
}
if (args.has("voice")) {
  const preset = VOICE_PRESETS.find((p) => p.id === args.get("voice"));
  if (!preset) fail(`unknown voice preset ${args.get("voice")}`);
  project = { ...project, voice: { ...project.voice, ...preset.voice } };
}
if (args.has("patch")) project = { ...project, voice: { ...project.voice, ...validatePatch(JSON.parse(args.get("patch")), "patch") } };
if (args.has("expression")) {
  const expression = Number(args.get("expression"));
  if (!(expression >= 0 && expression <= 1)) fail("expression must be 0\u20131");
  project = { ...project, speech: { ...project.speech, expression } };
}
if (args.has("speed")) {
  const speed = Number(args.get("speed"));
  if (!(speed >= 0.4 && speed <= 2.5)) fail("speed must be 0.4\u20132.5");
  project = { ...project, speech: { ...project.speech, rate: speed } };
}
var mode = args.get("mode") || project.mode;
if (!["play", "speak", "sing", "beat", "ensemble"].includes(mode)) fail("mode must be play, speak, sing, beat or ensemble");
var rate = Number(args.get("rate") || 48e3);
if (![8e3, 16e3, 22050, 24e3, 32e3, 44100, 48e3, 96e3].includes(rate)) fail("unsupported sample rate");
var lexicon = decodeLexicon(gunzipSync(readFileSync(join(here, "lexicon.txt.gz"))).toString("utf8"));
var module = new WebAssembly.Module(readFileSync(join(here, "voice_lab_engine.wasm")));
var seed = Number(args.get("seed") || 1);
var started = performance.now();
var left;
var right;
var resets;
var warnings = [];
if (mode === "ensemble") {
  if (!project.ensemble) fail("The project has no ensemble arrangement");
  const mix = renderEnsemble(module, planEnsemble(project.ensemble, lexicon), rate, seed);
  const range = clipSamples(mix, project.ensemble.excerpt);
  left = mix.left.subarray(range.start, range.end);
  right = mix.right.subarray(range.start, range.end);
  resets = mix.resets;
} else {
  const engine = new Engine(module, rate, seed);
  const plan = projectScore(project, lexicon, mode);
  warnings = plan.warnings;
  [left, right] = renderScore(engine, plan.score);
  resets = engine.state()[15];
  const second = mode === "sing" ? duetScore(project, lexicon) : null;
  if (second) {
    const [l2, r2] = renderScore(new Engine(module, rate, seed + 1), second.score, second.voice);
    const n2 = Math.max(left.length, l2.length);
    const mix = (a, b) => {
      const out = new Float32Array(n2);
      for (let i = 0; i < n2; i++) out[i] = 0.72 * ((a[i] ?? 0) + (b[i] ?? 0));
      return out;
    };
    [left, right] = [mix(left, l2), mix(right, r2)];
  }
}
var elapsed = (performance.now() - started) / 1e3;
var mono = args.get("channels") === "1";
writeFileSync(output, encodeWav(mono ? [left] : [left, right], rate));
var stats = measure(left);
process.stdout.write(JSON.stringify({
  ok: true,
  output,
  mode,
  sampleRate: rate,
  channels: mono ? 1 : 2,
  seconds: left.length / rate,
  peak: Number(stats.peak.toFixed(4)),
  rms: Number(stats.rms.toFixed(4)),
  renderSeconds: Number(elapsed.toFixed(3)),
  resets,
  warnings: [...scoreNotes, ...warnings],
  name: project.name
}) + "\n");
