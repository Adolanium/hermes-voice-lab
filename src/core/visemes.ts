import {PHONEMES} from './phonemes';
import type {Segment} from './planner';

/** Frontal lip and tongue targets in normalized drawing units. */
export interface MouthPose {
  open: number;
  spread: number;
  round: number;
  teeth: number;
  bite: number;
  tip: number;
}

function shape(open: number, spread: number, round: number, teeth = 0, bite = 0, tip = 0): MouthPose {
  return {open, spread, round, teeth, bite, tip};
}

const shapes = {
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
  back: shape(0.47, 0.56, 0.08, 0.33),
};
type Viseme = keyof typeof shapes;
const phones: Record<string, Viseme> = {};
function assign(symbols: string, pose: Viseme) {
  for (const symbol of symbols.split(' ')) phones[symbol] = pose;
}
assign('P B M PE CB BR', 'seal');
assign('F V', 'bite');
assign('TH DH', 'dental');
assign('L N D T RR DX TE CD CA', 'ridge');
assign('S Z SC ZC CC JC', 'hiss');
assign('SH ZH CH JH SR ZR CR JR', 'hush');
assign('K G NG KE RU Q', 'back');
assign('IY IH Y UU', 'ee');
assign('E EH EY', 'eh');
assign('AA AY AW', 'aa');
assign('AE', 'ae');
assign('AO O OW OY', 'oh');
assign('U UW UH W YW', 'oo');
assign('R ER', 'rhotic');

const glides: Record<string, Viseme> = {EY: 'ee', AY: 'ee', OY: 'ee', AW: 'oo', OW: 'oo'};
export interface VisemeKey {
  time: number;
  pose: Viseme;
}

function symbolPose(symbol: string): Viseme {
  const base = PHONEMES[symbol]?.palatalized ? symbol.slice(0, -1) : symbol;
  return symbol === 'SIL' ? 'rest' : (phones[base] ?? 'mid');
}

/** Hold targets inside phones, leaving short transitions across their boundaries.
 * Quiet closures have their own keys even before the voice starts sounding. */
export function planVisemes(segments: Segment[]): VisemeKey[] {
  const keys: VisemeKey[] = [{time: 0, pose: 'rest'}];
  for (const [i, s] of segments.entries()) {
    const duration = s.end - s.start;
    if (duration <= 0) continue;
    // At high tempi an onset can borrow time from a preceding consonant.
    // Drop superseded targets so a seek cannot bring that consonant back.
    while (keys.length && keys[keys.length - 1].time > s.start) keys.pop();
    const next = segments[i + 1];
    const pose = symbolPose(s.symbol === 'HH' && next ? next.symbol : s.symbol);
    const attack = Math.min(duration * 0.25, pose === 'seal' ? 0.012 : 0.034);
    const release = Math.min(duration * 0.25, next && symbolPose(next.symbol) === 'seal' ? 0.044 : 0.03);
    keys.push({time: s.start + attack, pose});
    const glide = glides[s.symbol];
    if (glide) {
      // The synth holds a long sung diphthong's nucleus and reaches its
      // offglide 100 ms from the end. Short diphthongs glide within the vowel.
      const end = duration > 0.4 ? s.end - 0.1 : s.start + duration * 0.8;
      keys.push({time: Math.max(s.start + attack, end - Math.min(0.13, duration * 0.55)), pose});
      keys.push({time: end, pose: glide});
    }
    keys.push({time: Math.max(keys[keys.length - 1].time, s.end - release), pose: glide ?? pose});
  }
  return keys;
}

/** Absolute-time sampling gives a seek or exported excerpt the same mouth as full playback. */
export function mouthAt(keys: VisemeKey[], time: number, jaw = 0.5, lips = 0.5, rounding = 0): MouthPose {
  let lo = 0,
    hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  const before = keys[lo - 1],
    after = keys[lo];
  const a = shapes[before?.pose ?? 'rest'],
    b = after ? shapes[after.pose] : a;
  const t = before && after ? (time - before.time) / (after.time - before.time) : 0;
  const w = t * t * (3 - 2 * t);
  const lerp = (x: number, y: number) => x + (y - x) * w;
  // Keep small variations of the synthesized vowel inside its visual target.
  // A closed target stays closed even while the underlying jaw is moving.
  return {
    open: lerp(a.open, b.open) * (0.87 + 0.18 * jaw + 0.09 * lips),
    spread: lerp(a.spread, b.spread),
    round: Math.min(1, lerp(a.round, b.round) * (0.95 + 0.13 * rounding)),
    teeth: lerp(a.teeth, b.teeth),
    bite: lerp(a.bite, b.bite),
    tip: lerp(a.tip, b.tip),
  };
}
