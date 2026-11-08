/**
 * Parameter catalogue. Order matches the Rust engine (engine/src/params.rs);
 * `engine.ts` verifies the count and ranges against the WASM at load time.
 */
export const PARAM_NAMES = [
  'pitch', 'loudness', 'gate', 'tenseness', 'breath', 'voicing', 'vibratoDepth', 'vibratoRate',
  'tongueX', 'tongueY', 'tipPlace', 'tipClose', 'dorsumClose', 'jaw', 'lipOpen', 'lipRound',
  'velum', 'tractLength', 'throat', 'gain', 'humanize', 'space', 'lateral', 'rhotic',
  'register', 'fry', 'growl', 'twang', 'pharynx', 'trill', 'glottal', 'larynx', 'suction',
] as const;

export type ParamName = (typeof PARAM_NAMES)[number];
export type Patch = Partial<Record<ParamName, number>>;

export interface ParamSpec {
  name: ParamName;
  id: number;
  min: number;
  max: number;
  default: number;
  label: string;
  unit: string;
  group: 'source' | 'tract' | 'output' | 'internal';
  help: string;
}

const META: Record<ParamName, [string, string, ParamSpec['group'], string]> = {
  pitch: ['Pitch', 'Hz', 'source', 'Fundamental frequency of the vocal folds.'],
  loudness: ['Effort', '', 'source', 'Lung pressure. More effort is louder and slightly brighter.'],
  gate: ['Gate', '', 'internal', 'Note on/off envelope.'],
  tenseness: ['Tension', '', 'source', 'Glottal pulse shape (LF Rd). Low is lax and soft, high is pressed and bright.'],
  breath: ['Breath', '', 'source', 'Glottal leak and aspiration noise.'],
  voicing: ['Voicing', '', 'source', 'Vocal-fold adduction. 0 opens the glottis for whisper or voiceless sounds.'],
  vibratoDepth: ['Vibrato', '', 'source', 'Vibrato depth (up to ±85 cents).'],
  vibratoRate: ['Vibrato rate', 'Hz', 'source', 'Vibrato speed.'],
  tongueX: ['Tongue front', '', 'tract', 'Tongue body position, back (0) to front (1).'],
  tongueY: ['Tongue height', '', 'tract', 'Tongue body height, low (0) to high (1).'],
  tipPlace: ['Tip place', '', 'tract', 'Tongue tip target, teeth (0) to behind the ridge (1).'],
  tipClose: ['Tip closure', '', 'tract', 'Tongue tip constriction. 1 seals the tract.'],
  dorsumClose: ['Back closure', '', 'tract', 'Tongue back against the soft palate (k, g, ng).'],
  jaw: ['Jaw', '', 'tract', 'Jaw opening.'],
  lipOpen: ['Lips open', '', 'tract', 'Lip aperture. 0 closes the lips.'],
  lipRound: ['Lip round', '', 'tract', 'Rounding and protrusion; lengthens the tract.'],
  velum: ['Nasal', '', 'tract', 'Velum opening; couples the nasal cavity.'],
  tractLength: ['Tract length', 'cm', 'tract', 'Overall vocal tract length (size), excluding lip protrusion.'],
  throat: ['Throat', '', 'tract', 'Pharynx width (tongue root). Wider is darker and warmer.'],
  gain: ['Output', '', 'output', 'Output level.'],
  humanize: ['Humanize', '', 'source', 'Jitter, shimmer and slow pitch drift.'],
  space: ['Room', '', 'output', 'Small room reverberation.'],
  lateral: ['Lateral', '', 'internal', 'Side channel around the tongue tip for l.'],
  rhotic: ['Rhotic', '', 'tract', 'Bunched-r narrowing of pharynx and palate; lowers F3.'],
  register: ['Falsetto', '', 'source', 'Vocal register, chest (0) to falsetto (1): thin, never fully closed folds. Flip it fast for a yodel.'],
  fry: ['Fry', '', 'source', 'Vocal fry: paired, irregular, creaky pulses.'],
  growl: ['Growl', '', 'source', 'Ventricular folds flapping at half the pitch: a rough growl.'],
  twang: ['Twang', '', 'source', 'Narrowed epilarynx: a bright, ringing, nasal-sounding twang.'],
  trill: ['Trill', '', 'tract', 'The narrowest constriction (tongue tip, lips or uvula) flaps in the airflow about 27 times a second.'],
  glottal: ['Glottal closure', '', 'internal', 'The vocal folds pressed shut: a glottal stop, and the seal behind an ejective.'],
  larynx: ['Larynx raise', '', 'internal', 'The larynx rises like a piston and squeezes the pharynx (ejectives).'],
  suction: ['Tongue suction', '', 'internal', 'The tongue body pulls down between two oral seals (clicks).'],
  pharynx: ['Pharynx', '×', 'tract', 'Throat length relative to the mouth: longer in adult men (≈1.15), shorter in children (≈0.85).'],
};

/** Fallback ranges matching the Rust table; replaced by the engine's own values. */
const RANGES: Record<ParamName, [number, number, number]> = {
  pitch: [50, 1100, 210], loudness: [0, 1, 0.72], gate: [0, 1, 0], tenseness: [0, 1, 0.28], breath: [0, 1, 0.25],
  voicing: [0, 1, 1], vibratoDepth: [0, 1, 0.18], vibratoRate: [3, 9, 5.4], tongueX: [0, 1, 0.36], tongueY: [0, 1, 0.3],
  tipPlace: [0, 1, 0.35], tipClose: [0, 1, 0], dorsumClose: [0, 1, 0], jaw: [0, 1, 0.62], lipOpen: [0, 1, 0.62],
  lipRound: [0, 1, 0.12], velum: [0, 1, 0], tractLength: [11, 19, 14.2], throat: [0, 1, 0.5], gain: [0, 1, 0.7],
  humanize: [0, 1, 0.45], space: [0, 1, 0.18], lateral: [0, 1, 0], rhotic: [0, 1, 0],
  register: [0, 1, 0], fry: [0, 1, 0], growl: [0, 1, 0], twang: [0, 1, 0], pharynx: [0.75, 1.3, 1], trill: [0, 1, 0], glottal: [0, 1, 0], larynx: [0, 1, 0], suction: [0, 1, 0],
};

export const PARAMS: readonly ParamSpec[] = PARAM_NAMES.map((name, id) => {
  const [min, max, def] = RANGES[name];
  const [label, unit, group, help] = META[name];
  return {name, id, min, max, default: def, label, unit, group, help};
});

export const PARAM_ID: Record<ParamName, number> = Object.fromEntries(PARAM_NAMES.map((n, i) => [n, i])) as Record<ParamName, number>;

export function isParamName(name: string): name is ParamName {
  return (PARAM_NAMES as readonly string[]).includes(name);
}

export function defaultPatch(): Record<ParamName, number> {
  return Object.fromEntries(PARAMS.map(p => [p.name, p.default])) as Record<ParamName, number>;
}

/** Validate a partial patch. Throws with a readable message on bad input. */
export function validatePatch(input: unknown, label = 'patch'): Patch {
  if (input == null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new TypeError(`${label} must be an object`);
  const out: Patch = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!isParamName(key)) throw new TypeError(`Unknown parameter "${key}"`);
    const spec = PARAMS[PARAM_ID[key]];
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${key} must be a finite number`);
    if (value < spec.min || value > spec.max) throw new RangeError(`${key} must be between ${spec.min} and ${spec.max}`);
    out[key] = value;
  }
  return out;
}

export function clampParam(name: ParamName, value: number): number {
  const s = PARAMS[PARAM_ID[name]];
  return Number.isFinite(value) ? Math.min(s.max, Math.max(s.min, value)) : s.default;
}

/** Parameters that define the voice's character (persisted in a voice patch). */
export const VOICE_PARAMS: readonly ParamName[] = [
  'pitch', 'loudness', 'tenseness', 'breath', 'vibratoDepth', 'vibratoRate', 'tractLength', 'throat', 'gain', 'humanize', 'space',
  'register', 'fry', 'growl', 'twang', 'pharynx',
];

/** Articulation parameters a user can hold in Play mode. */
export const SHAPE_PARAMS: readonly ParamName[] = [
  'tongueX', 'tongueY', 'tipPlace', 'tipClose', 'dorsumClose', 'jaw', 'lipOpen', 'lipRound', 'velum', 'voicing', 'rhotic', 'lateral', 'trill',
];

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
export const hzToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export function noteName(midi: number): string {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}
export function parseNoteName(text: string): number | null {
  const m = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/.exec(text.trim());
  if (!m) return null;
  const base: Record<string, number> = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
  let n = base[m[1].toUpperCase()];
  if (m[2] === '#' || m[2] === '♯') n += 1;
  if (m[2] === 'b' || m[2] === '♭') n -= 1;
  return (Number(m[3]) + 1) * 12 + n;
}
