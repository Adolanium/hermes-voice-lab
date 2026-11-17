import type {Movement} from '../core/ensemble';
import type {Note} from '../core/planner';

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};

/** Ease into each entrance and settle after the last note in a phrase. */
export function motionAt(style: Movement, beat: number, notes: Note[]) {
  const still = {x: 0, y: 0, tilt: 0, stretch: 1};
  if (style === 'still' || !notes.length) return still;
  let lo = 0,
    hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid].start <= beat) lo = mid + 1;
    else hi = mid;
  }
  const last = notes[lo - 1],
    next = notes[lo];
  const release = last ? 1 - ease((beat - last.start - last.length) / 0.65) : 0;
  const pickup = next ? ease(1 - (next.start - beat) / 0.28) : 0;
  const strength = Math.max(release, pickup);
  if (!strength) return still;
  const phase = Math.PI * beat;
  // A nod lands just behind each beat; a sway crosses centre once every two
  // beats; the bass compresses on alternate beats before springing back up.
  if (style === 'nod') {
    const nod = ((1 + Math.cos(2 * phase - 0.35)) / 2) ** 2;
    return {
      x: 2.5 * Math.sin(phase) * strength,
      y: (8 * nod - 2) * strength,
      tilt: 0.028 * Math.sin(phase - 0.25) * strength,
      stretch: 1 - 0.056 * nod * strength,
    };
  }
  if (style === 'sway') {
    const side = Math.sin(phase * 0.5 - 0.34);
    return {x: 9 * side * strength, y: -2.5 * Math.cos(phase - 0.68) * strength, tilt: 0.076 * side * strength, stretch: 1};
  }
  const down = ((1 + Math.cos(phase - 0.2)) / 2) ** 3;
  const rebound = Math.sin(phase - 0.2);
  return {
    x: 3.8 * rebound * strength,
    y: (11 * down - 6 * rebound) * strength,
    tilt: -0.03 * rebound * strength,
    stretch: 1 + (0.036 * rebound - 0.073 * down) * strength,
  };
}
