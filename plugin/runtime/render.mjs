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
  tenseness: [0, 1, 0.28],
  breath: [0, 1, 0.25],
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
var PARAM_ID = Object.fromEntries(PARAM_NAMES.map((n, i) => [n, i]));
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
  constructor(module2, sampleRate, seed = 1) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8e3 || sampleRate > 192e3) throw new RangeError("Sample rate must be 8000\u2013192000 Hz");
    this.e = new WebAssembly.Instance(module2, {}).exports;
    this.sampleRate = sampleRate;
    this.e.engine_init(sampleRate, seed >>> 0 || 1);
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
    const n = this.e.engine_render(Math.max(0, Math.min(4096, frames | 0)));
    return [this.f32(this.e.engine_out_left(), n), this.f32(this.e.engine_out_right(), n)];
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
  loadScore(score2) {
    const capacity = this.e.score_capacity();
    const count = Math.min(capacity, score2.events.length / 4);
    this.f32(this.e.score_staging(), count * 4).set(score2.events.subarray(0, count * 4));
    return this.e.score_load(count, score2.length);
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
function renderScore(engine2, score2, patch = {}, tail = 0.6) {
  engine2.jumpAll(patch);
  engine2.loadScore(score2);
  engine2.play(false);
  const total = Math.ceil((score2.length + tail) * engine2.sampleRate);
  const left2 = new Float32Array(total);
  const right2 = new Float32Array(total);
  for (let at = 0; at < total; at += 1024) {
    const [l, r] = engine2.render(Math.min(1024, total - at));
    left2.set(l, at);
    right2.set(r, at);
  }
  return [left2, right2];
}

// src/core/vowels.generated.json
var vowels_generated_default = {
  IY: { params: { tongueX: 1, tongueY: 0.833, jaw: 0.132, lipOpen: 1, lipRound: 0, throat: 0.404 }, model: [419, 2553, 2941], target: [437, 2761, 3372] },
  IH: { params: { tongueX: 1, tongueY: 0.7, jaw: 0.377, lipOpen: 0.935, lipRound: 0, throat: 0.293 }, model: [477, 2330, 2874], target: [483, 2365, 3053] },
  EY: { params: { tongueX: 0.978, tongueY: 0.799, jaw: 0.549, lipOpen: 1, lipRound: 0, throat: 0.059 }, model: [509, 2371, 2791], target: [536, 2530, 3047] },
  EH: { params: { tongueX: 1, tongueY: 0.278, jaw: 0.775, lipOpen: 1, lipRound: 0, throat: 0 }, model: [673, 1880, 2915], target: [731, 2058, 2979] },
  AE: { params: { tongueX: 1, tongueY: 0.564, jaw: 0.951, lipOpen: 1, lipRound: 0, throat: 0 }, model: [604, 2097, 2785], target: [669, 2349, 2972] },
  AA: { params: { tongueX: 0.756, tongueY: 0, jaw: 0.998, lipOpen: 1, lipRound: 0, throat: 0 }, model: [788, 1542, 3185], target: [936, 1551, 2815] },
  AO: { params: { tongueX: 5e-3, tongueY: 0.126, jaw: 0.807, lipOpen: 0.756, lipRound: 0.299, throat: 0 }, model: [757, 1152, 2737], target: [781, 1136, 2824] },
  OW: { params: { tongueX: 0, tongueY: 0.71, jaw: 0.533, lipOpen: 0.372, lipRound: 0.776, throat: 3e-3 }, model: [551, 1042, 2867], target: [555, 1035, 2828] },
  UH: { params: { tongueX: 0.139, tongueY: 0.778, jaw: 0.359, lipOpen: 0.392, lipRound: 0.562, throat: 0.278 }, model: [518, 1226, 2839], target: [519, 1225, 2827] },
  UW: { params: { tongueX: 0.043, tongueY: 0.824, jaw: 0.257, lipOpen: 0.352, lipRound: 0.896, throat: 0.399 }, model: [458, 1105, 2737], target: [459, 1105, 2735] },
  AH: { params: { tongueX: 0.767, tongueY: 0, jaw: 0.762, lipOpen: 0.72, lipRound: 0.183, throat: 0 }, model: [736, 1437, 3108], target: [753, 1426, 2933] },
  ER: { params: { tongueX: 8e-3, tongueY: 1, jaw: 0.423, lipOpen: 0.574, lipRound: 0.37, throat: 0, rhotic: 0.85 }, model: [519, 1584, 1941], target: [523, 1588, 1929] }
};

// src/core/phonemes.ts
var V = vowels_generated_default;
var vowel = (s) => ({ ...V[s].params, rhotic: V[s].params.rhotic ?? 0 });
var SCHWA = { tongueX: 0.5, tongueY: 0.32, jaw: 0.5, lipOpen: 0.62, lipRound: 0.12, throat: 0.4, rhotic: 0 };
var P = (symbol, ipa, manner, voiced, duration, target, example, offglide) => ({ symbol, ipa, manner, voiced, duration, target, example, offglide });
var PHONEMES = Object.fromEntries([
  P("AA", "\u0251", "vowel", true, 150, vowel("AA"), "father"),
  P("AE", "\xE6", "vowel", true, 160, vowel("AE"), "cat"),
  P("AH", "\u028C", "vowel", true, 100, vowel("AH"), "cup"),
  P("AO", "\u0254", "vowel", true, 150, vowel("AO"), "thought"),
  P("EH", "\u025B", "vowel", true, 115, vowel("EH"), "bed"),
  P("ER", "\u025D", "vowel", true, 140, vowel("ER"), "bird"),
  P("IH", "\u026A", "vowel", true, 90, vowel("IH"), "sit"),
  P("IY", "i", "vowel", true, 130, vowel("IY"), "see"),
  P("UH", "\u028A", "vowel", true, 95, vowel("UH"), "book"),
  P("UW", "u", "vowel", true, 140, vowel("UW"), "blue"),
  P("EY", "e\u026A", "diphthong", true, 160, vowel("EY"), "day", vowel("IY")),
  P("OW", "o\u028A", "diphthong", true, 165, vowel("OW"), "go", vowel("UH")),
  P("AY", "a\u026A", "diphthong", true, 190, vowel("AA"), "my", vowel("IH")),
  P("AW", "a\u028A", "diphthong", true, 195, vowel("AA"), "now", vowel("UH")),
  P("OY", "\u0254\u026A", "diphthong", true, 200, vowel("AO"), "boy", vowel("IY")),
  P("P", "p", "stop", false, 85, { lipOpen: 0 }, "pen"),
  P("B", "b", "stop", true, 70, { lipOpen: 0 }, "bed"),
  P("T", "t", "stop", false, 75, { tipPlace: 0.38, tipClose: 1 }, "top"),
  P("D", "d", "stop", true, 60, { tipPlace: 0.38, tipClose: 1 }, "day"),
  P("DX", "\u027E", "stop", true, 28, { tipPlace: 0.38, tipClose: 1 }, "butter"),
  P("K", "k", "stop", false, 80, { dorsumClose: 1 }, "cat"),
  P("G", "g", "stop", true, 70, { dorsumClose: 1 }, "go"),
  P("M", "m", "nasal", true, 75, { lipOpen: 0, velum: 1 }, "me"),
  P("N", "n", "nasal", true, 65, { tipPlace: 0.38, tipClose: 1, velum: 1 }, "no"),
  P("NG", "\u014B", "nasal", true, 80, { dorsumClose: 1, velum: 1 }, "sing"),
  P("F", "f", "fricative", false, 100, { lipOpen: 0.098, lipRound: 0 }, "fine"),
  P("V", "v", "fricative", true, 65, { lipOpen: 0.107, lipRound: 0 }, "very"),
  P("TH", "\u03B8", "fricative", false, 100, { tipPlace: 0, tipClose: 0.8 }, "think"),
  P("DH", "\xF0", "fricative", true, 50, { tipPlace: 0, tipClose: 0.794 }, "this"),
  P("S", "s", "fricative", false, 110, { tipPlace: 0.18, tipClose: 0.834, jaw: 0.3 }, "see"),
  P("Z", "z", "fricative", true, 85, { tipPlace: 0.18, tipClose: 0.828, jaw: 0.3 }, "zoo"),
  P("SH", "\u0283", "fricative", false, 115, { tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55, jaw: 0.3 }, "she"),
  P("ZH", "\u0292", "fricative", true, 90, { tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55, jaw: 0.3 }, "vision"),
  P("CH", "t\u0283", "affricate", false, 115, { tipPlace: 0.7, tipClose: 1, lipRound: 0.5, jaw: 0.3 }, "chair"),
  P("JH", "d\u0292", "affricate", true, 95, { tipPlace: 0.7, tipClose: 1, lipRound: 0.5, jaw: 0.3 }, "joy"),
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
  P("R", "\u0279", "approximant", true, 70, { rhotic: 1, lipRound: 0.7, tongueX: 0.15, tongueY: 0.85, lipOpen: 0.6 }, "red"),
  P("W", "w", "approximant", true, 65, { lipOpen: 0.15, lipRound: 1, tongueX: 0, tongueY: 0.9 }, "we"),
  P("Y", "j", "approximant", true, 60, { tongueX: 1, tongueY: 1, jaw: 0.35 }, "yes"),
  P("HH", "h", "aspirate", false, 65, { voicing: 0 }, "hat")
].map((p) => [p.symbol, p]));
var AFFRICATE_RELEASE = {
  CH: { tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55 },
  JH: { tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55 }
};
var VOWEL_SYMBOLS = Object.values(PHONEMES).filter((p) => p.manner === "vowel" || p.manner === "diphthong").map((p) => p.symbol);
var CONSONANT_SYMBOLS = Object.values(PHONEMES).filter((p) => !VOWEL_SYMBOLS.includes(p.symbol)).map((p) => p.symbol);
var isVowel = (symbol) => VOWEL_SYMBOLS.includes(symbol);
function parsePhone(token) {
  const m = /^([A-Z]{1,2})([012])?$/.exec(token.trim().toUpperCase());
  if (!m || !PHONEMES[m[1]]) return null;
  return { symbol: m[1], stress: isVowel(m[1]) ? Number(m[2] ?? 1) : 0 };
}
function vowelTarget(phone) {
  if (phone.symbol === "AH" && phone.stress === 0) return SCHWA;
  if (phone.symbol === "ER" && phone.stress === 0) return { ...PHONEMES.ER.target, rhotic: 0.7 };
  return PHONEMES[phone.symbol].target;
}
var VOWEL_CALIBRATION = Object.entries(V).map(([symbol, row]) => ({ symbol, model: row.model, target: row.target }));

// src/core/lexicon-codes.mjs
var VOWELS = ["AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"];
var CONSONANTS = ["B", "CH", "D", "DH", "F", "G", "HH", "JH", "K", "L", "M", "N", "NG", "P", "R", "S", "SH", "T", "TH", "V", "W", "Y", "Z", "ZH"];
var PHONE_CODES = [...VOWELS.flatMap((v) => [`${v}0`, `${v}1`, `${v}2`]), ...CONSONANTS];

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
function numberToWords(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 0) return `minus ${numberToWords(-n)}`;
  n = Math.floor(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");
  if (n < 1e3) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberToWords(n % 100)}` : ""}`;
  if (n < 1e6) return `${numberToWords(Math.floor(n / 1e3))} thousand${n % 1e3 ? ` ${numberToWords(n % 1e3)}` : ""}`;
  return n.toString().split("").map((d) => ONES[Number(d)]).join(" ");
}
function tokenize(input) {
  const text = input.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/&/g, " and ").replace(/%/g, " percent ").replace(/\d+(\.\d+)?/g, (m2) => {
    const [whole, frac] = m2.split(".");
    return ` ${numberToWords(Number(whole))}${frac ? ` point ${frac.split("").map((d) => ONES[Number(d)]).join(" ")}` : ""} `;
  });
  const tokens = [];
  const re = /([A-Za-z]+(?:'[A-Za-z]+)*)|([,;:—–-]+)|([.]+)|([?]+)|([!]+)/g;
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
var COMPILED = RULES.map(([p, phones]) => [new RegExp(`^(?:${p.replace("$", "(?![a-z])")})`), phones]);
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
  let phones = out.map((t) => parsePhone(t)).filter((p) => !!p);
  let seen = false;
  phones = phones.map((p) => {
    if (!isVowel(p.symbol)) return p;
    if (p.stress === 1 && !seen) {
      seen = true;
      return p;
    }
    return { ...p, stress: p.stress === 1 ? 0 : p.stress };
  });
  return phones;
}
function trillWord(word) {
  if (/^br{2,}$/.test(word)) return [{ symbol: "BR", stress: 0 }];
  if (/^r{3,}$/.test(word)) return [{ symbol: "RR", stress: 0 }];
  if (/^tsk$/.test(word)) return [{ symbol: "CD", stress: 0 }];
  return null;
}
function phonemize(text, lexicon2) {
  return tokenize(text).map((t) => {
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
  ["e", "EY"],
  ["\u025B", "EH"],
  ["\xE6", "AE"],
  ["\u0251", "AA"],
  ["a", "AA"],
  ["\u0252", "AA"],
  ["\u0254", "AO"],
  ["o", "OW"],
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
  ["\u01C3", "CA"]
];
var IPA_ONLY = /[ɪɛæɑɒɔʊʌəɝɜɚθðʃʒŋɹɾʔʙʀʘǀǃˈˌːɡ]/;
function isIpa(text) {
  return IPA_ONLY.test(text);
}
function parseIpaInput(text) {
  const words = [];
  const errors = [];
  const clean = text.trim().replace(/^[/[]|[/\]]$/g, "").normalize("NFC");
  for (const token of clean.split(/\s+/).filter(Boolean)) {
    const trail = token.match(/[,?!.]+$/)?.[0] ?? "";
    const body = token.slice(0, token.length - trail.length).replace(/[.ː‿]/g, "");
    const phones = [];
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
      if (isVowel(symbol)) {
        const s = fixed ?? (marked ? stress ?? 0 : firstFull ? 1 : 0);
        if (fixed === void 0) firstFull = false;
        phones.push({ symbol, stress: s });
        stress = null;
      } else {
        phones.push({ symbol, stress: 0 });
      }
      i += ipa.length;
    }
    if (!phones.length) continue;
    const boundary = trail.includes("?") ? "question" : trail.includes("!") ? "exclaim" : trail.includes(".") ? "period" : trail.includes(",") ? "comma" : "word";
    words.push({ text: body, phones, source: "phonemes", boundary });
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
function syllabify(phones) {
  const nuclei = phones.map((p, i) => isVowel(p.symbol) ? i : -1).filter((i) => i >= 0);
  if (nuclei.length <= 1) return [phones];
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
    const cluster = phones.slice(a + 1, b).map((p) => p.symbol);
    let onset = 0;
    for (let n = cluster.length; n >= 1; n--) {
      const tail = cluster.slice(cluster.length - n).join(" ");
      if (n === 1 && tail !== "NG") {
        onset = 1;
        break;
      }
      if (ONSETS.has(tail)) {
        onset = n;
        break;
      }
    }
    cuts.push(b - onset);
  }
  const out = [];
  let start = 0;
  for (const c of cuts) {
    out.push(phones.slice(start, c));
    start = c;
  }
  out.push(phones.slice(start));
  return out;
}

// src/core/planner.ts
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
      if (inPhrase) at(s.start, "gate", 0, 20);
      inPhrase = false;
    } else if (!inPhrase) {
      at(s.start - 0.03, "gate", 1, 10);
      inPhrase = true;
    }
    if (i === segments.length - 1 && inPhrase) at(s.end, "gate", 0, 40);
  });
  const anchors = [];
  segments.forEach((s, i) => {
    if (s.symbol === "SIL") return;
    const ph = PHONEMES[s.symbol];
    const dur = s.end - s.start;
    if (isVowel(s.symbol)) {
      const target = vowelTarget({ symbol: s.symbol, stress: s.stress });
      if (ph.offglide) {
        anchors.push({ time: s.start + 0.22 * dur, target, seg: i });
        anchors.push({ time: s.start + 0.8 * dur, target: { ...ph.offglide, rhotic: 0 }, seg: i });
      } else {
        anchors.push({ time: s.start + 0.38 * dur, target, seg: i });
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
    if (Object.keys(body).length) {
      if (s.symbol === "R") body.jaw = 0.55;
      anchors.push({ time: s.start + 0.5 * dur, target: body, tau: 18, lead: 4, seg: i });
    }
  });
  anchors.sort((a, b) => a.time - b.time);
  anchors.forEach((a, k) => {
    const gap = k ? a.time - anchors[k - 1].time : 0.15;
    const tau = a.tau ?? Math.min(24, Math.max(12, gap * 1e3 * 0.18));
    const start = Math.max(k ? anchors[k - 1].time : 0, a.time - (a.lead ?? 4) * tau / 1e3);
    for (const [name, value] of Object.entries(a.target)) {
      if (["tongueX", "tongueY", "jaw", "throat", "rhotic", "lipOpen", "lipRound"].includes(name)) at(start, name, value, tau, a.seg);
    }
  });
  segments.forEach((s, i) => {
    if (s.symbol === "SIL" || isVowel(s.symbol)) return;
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
      if (ph.manner === "affricate" && AFFRICATE_RELEASE[s.symbol]) {
        const r = AFFRICATE_RELEASE[s.symbol];
        at(s.start + 0.55 * dur, "tipClose", r.tipClose, 6, i);
        at(s.start + 0.45 * dur, "tipPlace", r.tipPlace, 10, i);
      }
      if (!nextIsSame(param)) {
        const rest = param === "lipOpen" ? vowelLips.lipOpen ?? 0.6 : 0;
        const late = ph.manner === "click" && param === "dorsumClose" ? 0.03 : 0;
        at(s.end - (param === "lipOpen" ? 4e-3 : 2e-3) + late, param, rest, late ? 12 : releaseTau, i);
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
      const aspirated = ph.manner === "stop" && !afterS && next && (isVowel(next.symbol) ? next.stress > 0 : next.symbol === "SIL" || ["R", "L", "W", "Y"].includes(next.symbol));
      const vot = ph.manner === "stop" ? aspirated ? 0.055 : 0.015 : ph.manner === "affricate" ? 0.02 : 0;
      const following = next && next.symbol !== "SIL" && !isVowel(next.symbol) && !PHONEMES[next.symbol].voiced;
      const final = !next || next.symbol === "SIL";
      if (final) at(s.end + 0.09, "voicing", 1, 20, i);
      else if (!following) at(s.end + (ph.manner === "fricative" ? 5e-3 : ph.manner === "aspirate" ? -0.02 : vot - 0.012), "voicing", 1, 8, i);
    } else if (phraseInitial && (ph.manner === "stop" || ph.manner === "affricate")) {
      at(onset, "voicing", 0.15, 10, i);
      at(s.end - 6e-3, "voicing", 1, 6, i);
    } else if (ph.manner === "fricative" || ph.manner === "stop" || ph.manner === "affricate") {
      at(s.start - 0.01, "voicing", ph.manner === "stop" ? 0.85 : 0.66, 10, i);
      at(s.end, "voicing", 1, 10, i);
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
function durationOf(seg, prev, next, final, rate2) {
  const ph = PHONEMES[seg.symbol];
  let d = ph.duration;
  if (isVowel(seg.symbol)) {
    d *= seg.stress === 1 ? 1 : seg.stress === 2 ? 0.85 : 0.6;
    if (seg.symbol === "AH" && seg.stress === 0) d = 55;
    if (final) d *= 1.4;
    if (next && !isVowel(next.symbol) && !PHONEMES[next.symbol].voiced && !final) d *= 0.85;
  } else {
    const cluster = prev && !isVowel(prev.symbol) || next && !isVowel(next.symbol);
    if (cluster) d *= 0.8;
    if (final) d *= 1.15;
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
      const final = w.boundary !== "word" && lastSyll.includes(p);
      const prev = pi > 0 ? w.phones[pi - 1] : wi > 0 && words[wi - 1].boundary === "word" ? words[wi - 1].phones.at(-1) : void 0;
      const crossWord = pi === w.phones.length - 1;
      const next = !crossWord ? w.phones[pi + 1] : w.boundary === "word" ? words[wi + 1]?.phones[0] : void 0;
      if ((p.symbol === "T" || p.symbol === "D") && pi > 0 && prev && isVowel(prev.symbol) && next && isVowel(next.symbol) && (crossWord || next.stress === 0)) {
        p = { symbol: "DX", stress: 0 };
      }
      const d = durationOf(p, w.phones[pi - 1], w.phones[pi + 1], final, rate2);
      segments.push({ symbol: p.symbol, stress: p.stress, start: t, end: t + d, word: wi });
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
  const events = articulate(segments, voice);
  events.push(...intonation(segments, voice.pitch, expression), ...dynamics(segments, voice.loudness));
  events.sort((a, b) => a[0] - b[0]);
  return { score: compileScore(events, t + 0.1), segments, words, warnings: [] };
}
function intonation(segments, base, expression) {
  const ev = [];
  const st = (semitones) => base * 2 ** (semitones / 12);
  let phraseStart = 0;
  const phrases = [];
  segments.forEach((s, i) => {
    if (s.symbol === "SIL") {
      if (i > phraseStart) phrases.push([phraseStart, i]);
      phraseStart = i + 1;
    }
  });
  for (const [a, b] of phrases) {
    const seg = segments.slice(a, b);
    const vowels = seg.filter((s) => isVowel(s.symbol));
    if (!vowels.length) continue;
    const t0 = seg[0].start;
    const t1 = seg[seg.length - 1].end;
    const end = seg[seg.length - 1].boundary ?? "period";
    const accents = vowels.filter((v) => v.stress === 1);
    const firstAccent = accents[0];
    ev.push([t0 - 0.05, "pitch", st(1 * expression), 0]);
    vowels.forEach((v, k) => {
      const pos = (v.start - t0) / Math.max(0.2, t1 - t0);
      const declination = 1.2 * expression - 3.5 * expression * pos;
      const isLast = k === vowels.length - 1;
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
    const bracket = /^\[([A-Za-z0-9+]+)\]([!?.,]*)$/.exec(part);
    if (bracket) {
      const phones = bracket[1].split("+").map((t) => parsePhone(t.toUpperCase())).filter((p) => !!p);
      if (phones.length) out.push({ phones, text: phones.map((p) => PHONEMES[p.symbol].ipa).join(""), word: wi });
      return;
    }
    const spelled = part.replace(/[^A-Za-z'-]/g, "").split("-").filter(Boolean);
    const word = phonemize(spelled.join(""), lexicon2)[0];
    if (!word) return;
    const syl = syllabify(word.phones);
    const trail = part.match(/[!?.,]+$/)?.[0] ?? "";
    syl.forEach((phones, k) => {
      const text = spelled.length === syl.length ? spelled[k] : k === 0 ? spelled.join("") : "\xB7";
      out.push({ phones, text: k === syl.length - 1 && text !== "\xB7" ? text + trail : text, word: wi });
    });
  });
  return out;
}
var BREATH = 0.13;
function singingVoice(voice) {
  return {
    ...voice,
    tenseness: clampParam("tenseness", Math.max(voice.tenseness, Math.min(0.6, voice.tenseness + 0.25))),
    breath: clampParam("breath", voice.breath * 0.45),
    loudness: clampParam("loudness", voice.loudness + 0.1)
  };
}
function sungConsonant(p, cluster) {
  return Math.min(0.1, PHONEMES[p.symbol].duration / 1e3 * (cluster ? 0.7 : 0.85));
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
function planSong(notes, lyrics, lexicon2, opts) {
  const bpm = Math.min(240, Math.max(30, opts.bpm));
  const beat = 60 / bpm;
  const voice = singingVoice({ ...defaultPatch(), ...opts.voice ?? {} });
  const syllables = lyricSyllables(lyrics, lexicon2);
  const sorted = notes.map((n, i) => ({ ...n, index: i })).sort((a, b) => a.start - b.start || a.midi - b.midi);
  const lead = 0.25;
  const segments = [{ symbol: "SIL", stress: 0, start: 0, end: lead, word: -1 }];
  const pitchEvents = [];
  const assignments = [];
  const cues = [];
  const hum = [{ symbol: opts.hum ?? "AA", stress: 1 }];
  const cartoon = opts.style === "cartoon";
  const yodel = opts.style === "yodel";
  const breakMidi = sorted.length ? (Math.min(...sorted.map((n) => n.midi)) + Math.max(...sorted.map((n) => n.midi))) / 2 : 0;
  let register = voice.register;
  let syl = 0;
  let cursor = lead;
  sorted.forEach((n, k) => {
    const start = lead + n.start * beat;
    const end = lead + (n.start + n.length) * beat;
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
      pitchEvents.push([start - 0.01, "pitch", midiToHz(n.midi), cartoon ? 110 : 40]);
      assignments.push({ note: n.index, syllable: syl - 1, text: "\u2013" });
      return;
    }
    const phones = unit && unit.phones.length ? unit.phones : hum;
    assignments.push({ note: n.index, syllable: unit ? syl - 1 : -1, text: unit?.text ?? "ah" });
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
      cues.push({ text: unit.text, start: t2, vowel: start, end: t2 + durs.reduce((a, b) => a + b, 0), midi: n.midi });
      unit.phones.forEach((p, i) => {
        segments.push({ symbol: p.symbol, stress: 0, start: t2, end: t2 + durs[i], word: k });
        t2 += durs[i];
      });
      cursor = t2;
      pitchEvents.push([start - 0.04, "pitch", midiToHz(n.midi), 20]);
      return;
    }
    const v = phones.findIndex((p) => isVowel(p.symbol));
    const onset = v > 0 ? phones.slice(0, v) : [];
    const nucleus = v >= 0 ? phones[v] : hum[0];
    const coda = v >= 0 ? phones.slice(v + 1) : [];
    const onsetDur = onset.map((p) => sungConsonant(p, onset.length > 1));
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
      segments.push({ symbol: p.symbol, stress: 0, start: t, end: t + d, word: k });
      t += d;
    });
    const breath = unit && /[,.!?;:]$/.test(unit.text) && nextStart - end < BREATH && Math.min(end, nextStart) - start > 0.3;
    const stop = breath ? nextStart - BREATH : Math.min(end, nextStart - 5e-3);
    const codaDur = coda.map((p) => sungConsonant(p, coda.length > 1));
    const codaTotal = Math.min(codaDur.reduce((a, b) => a + b, 0), (stop - start) * 0.45);
    const vowelEnd = stop - codaTotal;
    if (unit) cues.push({ text: unit.text, start: onset.length ? segments[segments.length - onset.length].start : t, vowel: t, end: stop, midi: n.midi });
    segments.push({ symbol: nucleus.symbol, stress: Math.max(1, nucleus.stress), start: t, end: vowelEnd, word: k, label: unit?.text });
    let c = vowelEnd;
    coda.forEach((p, i) => {
      const d = codaTotal * (codaDur[i] / Math.max(1e-3, codaDur.reduce((a, b) => a + b, 0)));
      segments.push({ symbol: p.symbol, stress: 0, start: c, end: c + d, word: k });
      c += d;
    });
    cursor = c;
    const hz = midiToHz(n.midi);
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
      const r = n.midi > breakMidi ? 1 : 0;
      if (r !== register) pitchEvents.push([start - 0.02, "register", r, 8]);
      register = r;
    }
    if (end - start > 0.45) {
      pitchEvents.push([start - 0.06, "vibratoDepth", 0, 60]);
      pitchEvents.push([start + (cartoon ? 0.12 : 0.22), "vibratoDepth", cartoon ? 0.62 : voice.vibratoDepth, cartoon ? 120 : 180]);
      if (cartoon) pitchEvents.push([start, "vibratoRate", 6.6, 0]);
    }
    pitchEvents.push([start - 0.02, "loudness", clampParam("loudness", voice.loudness + (cartoon ? 0.12 : 0.04)), 25]);
    pitchEvents.push([start + 0.12, "loudness", voice.loudness, 120]);
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
  events.push(...pitchEvents);
  events.sort((a, b) => a[0] - b[0]);
  return { score: compileScore(events, cursor + 0.4), segments, words: [], warnings: [], assignments, cues };
}
function planSustain(shape, voice, seconds) {
  const ev = preamble(voice);
  for (const [k, v] of Object.entries(shape)) ev.push([0, k, v, 0]);
  ev.push([0.02, "gate", 1, 15], [Math.max(0.1, seconds), "gate", 0, 60]);
  return compileScore(ev, seconds + 0.5);
}

// src/core/presets.ts
var SIGNATURE = {
  pitch: 212,
  loudness: 0.72,
  tenseness: 0.28,
  breath: 0.25,
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
  mic: 0.4,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  comp: 0,
  drive: 0
};
var VOICE_PRESETS = [
  { id: "signature", name: "Signature", description: "Clear, warm, gently breathy \u2014 the default character voice.", voice: SIGNATURE },
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

// src/core/project.ts
var LIMITS = { notes: 512, text: 1e3, lyrics: 2e3, seconds: 120, name: 120 };
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
  style: "cartoon"
};
function newProject(name = "Untitled voice") {
  return {
    version: 2,
    name,
    mode: "play",
    voice: { ...SIGNATURE },
    shape: { ...VOWEL_PRESETS.find((v) => v.id === "aa").shape },
    speech: { text: DEMO_PHRASE, phonemes: false, rate: 1, expression: 0.6 },
    song: { bpm: 96, lyrics: DEMO_LYRICS, notes: DEMO_NOTES.map((n) => ({ ...n })), loop: false, style: "natural" },
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
  const allowed = /* @__PURE__ */ new Set(["version", "name", "mode", "voice", "shape", "speech", "song", "beat", "sustain"]);
  for (const k of Object.keys(p)) if (!allowed.has(k)) throw new TypeError(`Unknown project field "${k}"`);
  if (p.version !== void 0 && p.version !== 2) throw new TypeError("Unsupported project version");
  const name = p.name ?? base.name;
  if (typeof name !== "string" || name.length > LIMITS.name) throw new TypeError(`name must be text up to ${LIMITS.name} characters`);
  const mode2 = p.mode ?? base.mode;
  if (!["play", "speak", "sing", "beat"].includes(mode2)) throw new TypeError("mode must be play, speak, sing or beat");
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
  const notes = song.notes.map((n, i) => {
    if (!n || typeof n !== "object") throw new TypeError(`note ${i} must be an object`);
    return { start: num(n.start, 0, 1024, `note ${i} start`), length: num(n.length, 0.0625, 64, `note ${i} length`), midi: Math.round(num(n.midi, 36, 96, `note ${i} midi`)) };
  });
  const seconds = notes.reduce((m, n) => Math.max(m, (n.start + n.length) * 60 / song.bpm), 0);
  if (seconds > LIMITS.seconds) throw new RangeError(`Song is longer than ${LIMITS.seconds} seconds`);
  return {
    version: 2,
    name,
    mode: mode2,
    voice: { ...SIGNATURE, ...validatePatch(p.voice ?? base.voice, "voice") },
    shape: { ...validatePatch(p.shape ?? base.shape, "shape") },
    speech,
    song: { bpm: song.bpm, lyrics: song.lyrics, loop: song.loop, style: song.style, notes },
    beat: validateBeat(p.beat),
    sustain: num(p.sustain ?? base.sustain, 0.2, 30, "sustain")
  };
}
function projectScore(project2, lexicon2, mode2 = project2.mode) {
  if (mode2 === "speak") {
    const plan = planSpeech(project2.speech.text, lexicon2, { voice: project2.voice, rate: project2.speech.rate, expression: project2.speech.expression, phonemes: project2.speech.phonemes });
    return { score: plan.score, warnings: plan.warnings };
  }
  if (mode2 === "sing") {
    const plan = planSong(project2.song.notes, project2.song.lyrics, lexicon2, { bpm: project2.song.bpm, voice: project2.voice, style: project2.song.style });
    return { score: plan.score, warnings: plan.warnings };
  }
  if (mode2 === "beat") {
    const { notes, lyrics } = beatSong(project2.beat);
    const plan = planSong(notes, lyrics, lexicon2, { bpm: project2.beat.bpm, voice: project2.voice });
    return { score: plan.score, warnings: plan.warnings };
  }
  return { score: planSustain(project2.shape, project2.voice, project2.sustain), warnings: [] };
}

// src/core/wav.ts
function encodeWav(channels, sampleRate) {
  const n = channels[0]?.length ?? 0;
  const ch = channels.length;
  const bytes = new Uint8Array(44 + n * ch * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + n * ch * 2, true);
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
  view.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
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
if (args.has("voice")) {
  const preset = VOICE_PRESETS.find((p) => p.id === args.get("voice"));
  if (!preset) fail(`unknown voice preset ${args.get("voice")}`);
  project = { ...project, voice: { ...project.voice, ...preset.voice } };
}
if (args.has("patch")) project = { ...project, voice: { ...project.voice, ...validatePatch(JSON.parse(args.get("patch")), "patch") } };
if (args.has("speed")) {
  const speed = Number(args.get("speed"));
  if (!(speed >= 0.4 && speed <= 2.5)) fail("speed must be 0.4\u20132.5");
  project = { ...project, speech: { ...project.speech, rate: speed } };
}
var mode = args.get("mode") || project.mode;
if (!["play", "speak", "sing", "beat"].includes(mode)) fail("mode must be play, speak, sing or beat");
var rate = Number(args.get("rate") || 48e3);
if (![8e3, 16e3, 22050, 24e3, 32e3, 44100, 48e3, 96e3].includes(rate)) fail("unsupported sample rate");
var lexicon = decodeLexicon(gunzipSync(readFileSync(join(here, "lexicon.txt.gz"))).toString("utf8"));
var module = new WebAssembly.Module(readFileSync(join(here, "voice_lab_engine.wasm")));
var engine = new Engine(module, rate, Number(args.get("seed") || 1));
var { score, warnings } = projectScore(project, lexicon, mode);
var started = performance.now();
var [left, right] = renderScore(engine, score);
var elapsed = (performance.now() - started) / 1e3;
var mono = args.get("channels") === "1";
writeFileSync(output, encodeWav(mono ? [left] : [left, right], rate));
var stats = measure(left);
var state = engine.state();
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
  resets: state[15],
  warnings,
  name: project.name
}) + "\n");
