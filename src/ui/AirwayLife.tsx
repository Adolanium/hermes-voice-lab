/**
 * The working airway inside the cutaway. Everything here is driven by the
 * engine's telemetry, not by animation timelines:
 *  - beads along the modeled airway, sized by each section's cross-section
 *    and lit by the smoothed sound-wave amplitude in that section;
 *  - air particles whose speed follows the modeled mean airflow; they stop at
 *    a seal and take the nasal path in proportion to the air leaving the nose;
 *  - a marker where the airway is sealed.
 */
import React, {useEffect, useMemo, useRef} from 'react';

type Pt = [number, number];
const N = 44;
const NASAL = 30;
const PORT = 24;
const PARTICLES = 28;

export interface AirwayState {
  running: boolean;
  areas: ArrayLike<number>;
  energy: ArrayLike<number> | null;
  airflow: number;
  nasalShare: number;
  closed: boolean;
  minIndex: number;
  minArea: number;
  gate: number;
  /** Fixed clock in seconds (frame rendering): particles step on it instead of real time. */
  clock?: number;
}

interface Geometry {
  pivot: Pt;
  tongueDeg: number;
  /** Mouth exit between the lips. */
  exit: Pt;
}

function rotate([x, y]: Pt, deg: number, [cx, cy]: Pt): Pt {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

/** Sample `count` points along a polyline, evenly by arc length. */
function resample(points: Pt[], count: number): Pt[] {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    seg.push(d);
    total += d;
  }
  const out: Pt[] = [];
  for (let k = 0; k < count; k++) {
    let target = (total * k) / Math.max(1, count - 1);
    let i = 0;
    while (i < seg.length - 1 && target > seg[i]) {
      target -= seg[i];
      i++;
    }
    const t = seg[i] ? Math.min(1, target / seg[i]) : 0;
    out.push([points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t]);
  }
  return out;
}

/** Section centres: glottis → pharynx → port (section 24) → mouth → lips; nasal port → nostril. */
export function airwayPoints(g: Geometry): {oral: Pt[]; nasal: Pt[]} {
  const back: Pt[] = [[298, 458], [298, 434], [293, 404], [289, 370], [289, 340], [292, 324]];
  const front: Pt[] = [[300, 327], [318, 330], [338, 332], [356, 336], [370, 341], [g.exit[0] - 6, g.exit[1] - 1], [g.exit[0] + 2, g.exit[1]]]
    .map(([x, y], i) => (i === 0 ? ([x, y] as Pt) : rotate([x, y], g.tongueDeg * (0.25 + 0.12 * i), g.pivot)));
  front[front.length - 1] = [g.exit[0] + 2, g.exit[1]];
  front[front.length - 2] = [g.exit[0] - 6, g.exit[1] - 1];
  const oral = [...resample(back, PORT + 1), ...resample(front, N - PORT).slice(1)];
  const nasal = resample([[288, 318], [298, 305], [326, 297], [360, 298], [388, 305], [403, 316]], NASAL);
  return {oral, nasal};
}

export function AirwayLife({state, geometry}: {state: AirwayState; geometry: Geometry}) {
  const {oral, nasal} = useMemo(() => airwayPoints(geometry), [geometry.exit[0], geometry.exit[1], geometry.tongueDeg]);
  const ref = useRef(0.02);
  const energy = state.energy;
  // Normalise to a slowly adapting reference so loud and quiet voices both read.
  let peak = 0;
  if (energy) for (let i = 0; i < energy.length; i++) peak = Math.max(peak, energy[i]);
  ref.current = Math.max(0.004, ref.current * 0.9 + peak * 0.1, peak * 0.6);
  const lit = (e: number) => (state.running && energy ? Math.min(1, Math.pow(e / ref.current, 0.7)) : 0);
  const radius = (a: number) => 1.1 + 2.3 * Math.min(1.8, Math.sqrt(Math.max(0, a) / Math.PI));
  const sealed = state.running && state.closed;
  const sealAt = oral[Math.min(N - 1, Math.max(0, state.minIndex))];

  return (
    <g className="hvl-airway" aria-hidden>
      {nasal.map((p, i) => (
        <circle key={`n${i}`} cx={p[0]} cy={p[1]} r={1.6} className="hvl-bead"
          style={{opacity: 0.12 + 0.88 * lit(energy ? energy[N + i] : 0)}} />
      ))}
      {oral.map((p, i) => {
        const a = state.areas[i] ?? 1;
        return <circle key={i} cx={p[0]} cy={p[1]} r={radius(a)} className={`hvl-bead ${a < 0.004 ? 'is-shut' : ''}`}
          style={{opacity: 0.14 + 0.86 * lit(energy ? energy[i] : 0)}} />;
      })}
      <Particles oral={oral} nasal={nasal} state={state} />
      {sealed && (
        <g className="hvl-seal" transform={`translate(${sealAt[0]} ${sealAt[1]})`}>
          <circle r={7.5} />
          <path d="M -4 -4 L 4 4 M 4 -4 L -4 4" />
        </g>
      )}
    </g>
  );
}

/** Air particles animated on their own frame loop (no React re-render per frame), or on a fixed clock. */
function Particles({oral, nasal, state}: {oral: Pt[]; nasal: Pt[]; state: AirwayState}) {
  const group = useRef<SVGGElement>(null);
  const live = useRef({oral, nasal, state});
  live.current = {oral, nasal, state};
  const stepRef = useRef<((dt: number) => void) | null>(null);
  const lastClock = useRef<number | null>(null);
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const dots = Array.from(g.children) as SVGCircleElement[];
    // s: position along the route in sections; nose: route choice.
    const ps = dots.map((_, i) => ({s: (i / dots.length) * N, nose: false, alpha: 0}));
    let seed = 12345;
    const random = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const at = (route: Pt[], s: number): Pt => {
      const i = Math.max(0, Math.min(route.length - 2, Math.floor(s)));
      const t = Math.min(1, Math.max(0, s - i));
      return [route[i][0] + (route[i + 1][0] - route[i][0]) * t, route[i][1] + (route[i + 1][1] - route[i][1]) * t];
    };
    const step = (dt: number) => {
      const {oral, nasal, state} = live.current;
      const flowing = state.running && state.gate > 0.05;
      // Mean airflow sets the drift speed (sections per second), with a floor so voicing reads.
      const speed = flowing ? 10 + 70 * Math.min(1.2, state.airflow) : 0;
      // A seal stops oral flow at the constriction; with the velum open, air goes up into the nose.
      const block = state.closed ? Math.max(1, state.minIndex - 1) : Infinity;
      for (let k = 0; k < ps.length; k++) {
        const p = ps[k];
        const nasalRoute = p.nose && p.s >= PORT;
        const end = nasalRoute ? PORT + NASAL - 1 : N - 1;
        const limit = nasalRoute ? end : Math.min(end, block);
        p.s = Math.min(limit, p.s + speed * dt * (0.75 + ((k * 37) % 10) / 20));
        const stuck = p.s >= limit && limit < end;
        p.alpha += ((flowing ? (stuck ? 0.25 : 0.9) : 0) - p.alpha) * Math.min(1, dt * 6);
        if (p.s >= end - 0.01 || (!flowing && p.alpha < 0.02)) {
          p.s = random() * 2;
          p.nose = random() < state.nasalShare;
        }
        if (p.nose && p.s >= PORT - 0.5 && state.nasalShare < 0.02) p.nose = false;
        const [x, y] = nasalRoute ? at(nasal, p.s - PORT) : at(oral, p.s);
        const dot = dots[k];
        dot.setAttribute('cx', x.toFixed(1));
        dot.setAttribute('cy', y.toFixed(1));
        dot.style.opacity = p.alpha.toFixed(2);
      }
    };
    stepRef.current = step;
    if (live.current.state.clock !== undefined) return () => void (stepRef.current = null);
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      step(Math.min(0.05, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      stepRef.current = null;
    };
  }, []);
  // Fixed-clock mode: advance exactly by the clock difference on each render.
  useEffect(() => {
    const c = state.clock;
    if (c === undefined) return;
    const dt = lastClock.current === null ? 0 : Math.min(0.05, Math.max(0, c - lastClock.current));
    lastClock.current = c;
    stepRef.current?.(dt);
  }, [state.clock]);
  return (
    <g ref={group} className="hvl-particles">
      {Array.from({length: PARTICLES}, (_, i) => <circle key={i} r={1.3} cx={298} cy={458} style={{opacity: 0}} />)}
    </g>
  );
}
