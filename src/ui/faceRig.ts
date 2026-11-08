/**
 * Lower-face rig for the traced portrait. Instead of cutting the jaw out and
 * rotating it as a block, every point of the artwork is moved by a smooth,
 * weighted "skin" so the drawing bends like a face:
 *  - jaw: points below the lip line rotate about the jaw hinge; the weight
 *    eases off across the cheek, behind the jaw and down the neck, so the
 *    cheek and throat stretch instead of tearing;
 *  - lower lip: follows its own (lip-gap) angle, so the lips can stay shut on
 *    b, p, m while the jaw is open;
 *  - pout: both lips push forward for rounded vowels.
 * Weights depend only on the original point, so they are computed once; each
 * frame applies three numbers to ~5k points.
 */
type Pt = [number, number];

/** Jaw hinge (art space), in front of the ear. */
export const HINGE: Pt = [709.6, 556.3];
/** Lip parting line, mouth corner → front of the lips (art space). */
const LINE: Pt[] = [[1017, 689], [1035, 688], [1050, 686], [1058, 684], [1130, 684]];
const CORNER = LINE[0];
const LOWER_LIP: Pt = [1052, 703];
const LIPS: Pt = [1060, 686];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Height of the parting line at x; behind the corner it rises toward the hinge. */
export function lineY(x: number): number {
  if (x <= CORNER[0]) return CORNER[1] - (CORNER[0] - x) * 0.25;
  for (let i = 1; i < LINE.length; i++) {
    if (x <= LINE[i][0]) {
      const [x0, y0] = LINE[i - 1];
      const [x1, y1] = LINE[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return LINE[LINE.length - 1][1];
}

interface Weights {
  jaw: number;
  lip: number;
  pout: number;
}

function weights(x: number, y: number): Weights {
  // Sharp along the lips, a long soft blend across the cheek.
  const behind = Math.max(0, CORNER[0] - x);
  const d = y - lineY(x);
  const below = smooth(1.5, 4 + behind * 0.5, d);
  const jaw = below * smooth(800, 960, x) * (1 - smooth(834, 890, y));
  const lip = 1 - smooth(26, 60, Math.hypot(x - LOWER_LIP[0], y - LOWER_LIP[1]));
  const pout = 1 - smooth(20, 56, Math.hypot(x - LIPS[0], (y - LIPS[1]) * 1.35));
  return {jaw, lip, pout};
}

export interface FacePose {
  /** Jaw rotation, degrees (positive opens). */
  jaw: number;
  /** Lower-lip rotation, degrees. */
  lip: number;
  /** Forward lip push, art units. */
  pout: number;
}

export function warpPoint(x: number, y: number, pose: FacePose, w = weights(x, y)): Pt {
  const deg = w.jaw * (pose.jaw * (1 - w.lip) + pose.lip * w.lip);
  let nx = x;
  let ny = y;
  if (deg !== 0) {
    const r = (deg * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const dx = x - HINGE[0];
    const dy = y - HINGE[1];
    nx = HINGE[0] + dx * c - dy * s;
    ny = HINGE[1] + dx * s + dy * c;
  }
  if (pose.pout) {
    nx += w.pout * pose.pout;
    // Pushed-out lips pucker toward the parting line a little.
    ny += w.pout * pose.pout * 0.25 * Math.sign(lineY(x) + 2 - y);
  }
  return [nx, ny];
}

/** A path prepared for warping: its command letters and point weights. */
export interface WarpablePath {
  parts: string[];
  xs: Float64Array;
  ys: Float64Array;
  w: Weights[];
}

/** Parse an absolute M/L/C/Z path (as produced by the tracer). */
export function prepare(d: string): WarpablePath {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const parts: string[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  let pending: number | null = null;
  let text = '';
  for (const t of tokens) {
    if (/[A-Za-z]/.test(t)) {
      text += t;
      continue;
    }
    const v = Number(t);
    if (pending === null) pending = v;
    else {
      parts.push(text);
      text = '';
      xs.push(pending);
      ys.push(v);
      pending = null;
    }
  }
  parts.push(text);
  return {parts, xs: Float64Array.from(xs), ys: Float64Array.from(ys), w: xs.map((x, i) => weights(x, ys[i]))};
}

export function warpPath(p: WarpablePath, pose: FacePose): string {
  if (!pose.jaw && !pose.lip && !pose.pout) {
    let out = '';
    for (let i = 0; i < p.xs.length; i++) out += `${p.parts[i]}${p.xs[i]} ${p.ys[i]} `;
    return out + p.parts[p.xs.length];
  }
  let out = '';
  for (let i = 0; i < p.xs.length; i++) {
    const w = p.w[i];
    let x = p.xs[i];
    let y = p.ys[i];
    if (w.jaw > 0.002 || w.pout > 0.002) [x, y] = warpPoint(x, y, pose, w);
    out += `${p.parts[i]}${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  return out + p.parts[p.xs.length];
}

const f = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

/**
 * The open mouth seen from the side: dark cavity between the warped lips,
 * upper teeth under the upper lip and the tongue resting at the bottom.
 * Returns null while the lips are together.
 */
export function mouthShapes(pose: FacePose): {cavity: string; teeth: string; tongue: string; gap: number} | null {
  const xs = [1017, 1023, 1030, 1037, 1044, 1050, 1055, 1059];
  const upper = xs.map(x => warpPoint(x, lineY(x) + 1.2, pose));
  // The floor of the mouth runs just inside the lower lip's top edge.
  const lower = xs.map(x => warpPoint(x, lineY(x) + 4.6, pose));
  const mid = 4;
  const gap = lower[mid][1] - upper[mid][1];
  if (gap < 1.5) return null;
  // Front edge: the stretched lip outline, sampled through the parting ramp.
  const fx = 1061;
  const frontEdge = [0.25, 0.45, 0.65, 0.85].map(t => warpPoint(fx, lineY(fx) + 1.5 + t * 2.6, pose));
  const curve = (pts: Pt[]) => pts.slice(1).map((p, i) => {
    const a = pts[i];
    return `Q ${f(a)} ${f([(a[0] + p[0]) / 2, (a[1] + p[1]) / 2])}`;
  }).join(' ');
  const lowRev = [...lower].reverse();
  // Back edge: rounded toward the mouth corner rather than a straight cut.
  const back: Pt = [Math.min(upper[0][0], lower[0][0]) - gap * 0.22, (upper[0][1] + lower[0][1]) / 2];
  const cavity = `M ${f(upper[0])} ${curve(upper)} L ${f(upper[upper.length - 1])} ${frontEdge.map(p => `L ${f(p)}`).join(' ')} L ${f(lower[lower.length - 1])} ${curve(lowRev)} L ${f(lower[0])} Q ${f(back)} ${f(upper[0])} Z`;
  // Upper teeth: a band under the upper lip, tapering toward the corner.
  const t = Math.min(7, 1 + gap * 0.16);
  const tu = upper.slice(1);
  const teeth = `M ${f(tu[0])} ${tu.slice(1).map(p => `L ${f(p)}`).join(' ')} L ${f([tu[tu.length - 1][0] + 2, tu[tu.length - 1][1] + t])} ${[...tu].reverse().slice(1).map((p, i, all) => `L ${f([p[0], p[1] + t * (1 - (i / all.length) * 0.7)])}`).join(' ')} Z`;
  // Tongue: a mound on the floor of the mouth, set back from the lips.
  const tl = lower.slice(0, 6);
  const lift = Math.min(9, gap * 0.28);
  const tongue = `M ${f(tl[0])} ${tl.slice(1).map((p, i) => `L ${f([p[0], p[1] - lift * Math.sin(((i + 1) / 5) * Math.PI * 0.85)])}`).join(' ')} L ${f([tl[5][0], tl[5][1] + 14])} L ${f([tl[0][0], tl[0][1] + 14])} Z`;
  return {cavity, teeth, tongue, gap};
}
