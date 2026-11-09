import {defaultPatch, type ParamName, type Patch} from '../core/params';
import {VOWEL_PRESETS} from '../core/presets';

/** Hum shares schwa's tongue position, but is a closure rather than a vowel. */
export const VOWEL_ANCHORS = VOWEL_PRESETS.filter(v => v.id !== 'hum').map(v => ({
  ...v, x: v.shape.tongueX!, y: v.shape.tongueY!,
}));
const defaults = defaultPatch();
const keys = [...new Set(VOWEL_ANCHORS.flatMap(v => Object.keys(v.shape)))] as ParamName[];

/** Smooth inverse-distance blending of every calibrated articulator. Convex
 * weights keep intermediate values bounded; exact anchors bypass arithmetic. */
export function morphVowel(x: number, y: number): Patch {
  x = Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0.5));
  y = Math.min(1, Math.max(0, Number.isFinite(y) ? y : 0.5));
  const distances = VOWEL_ANCHORS.map(v => (x - v.x) ** 2 + (y - v.y) ** 2);
  const exact = distances.findIndex(d => d < 1e-12);
  if (exact >= 0) return {...VOWEL_ANCHORS[exact].shape};
  const weights = distances.map(d => 1 / (d * d));
  const total = weights.reduce((a, b) => a + b, 0);
  return Object.fromEntries(keys.map(key => [key, VOWEL_ANCHORS.reduce((sum, v, i) =>
    sum + (v.shape[key] ?? defaults[key]) * weights[i] / total, 0)])) as Patch;
}
