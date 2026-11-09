/**
 * The working airway inside the cutaway. Everything here is driven by the
 * engine's telemetry, not by animation timelines:
 *  - beads along the modeled airway, sized by each section's cross-section
 *    and lit by the smoothed sound-wave amplitude in that section;
 *  - air particles whose speed follows the modeled mean airflow; they stop at
 *    a seal and take the nasal path in proportion to the air leaving the nose;
 *  - a marker where the airway is sealed;
 *  - the vocal folds buzzing at a rate that follows the pitch.
 * `Emission` draws what leaves her: sound rings from the lips (and nose),
 * a spray where the air turns turbulent, pressure behind a seal and the
 * puff when it opens.
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
  oralPressure?: number;
  frication?: number;
  noiseIndex?: number;
  voicing?: number;
  /** Output level (RMS of the rendered sound). */
  level?: number;
  /** Measured fundamental frequency (Hz). */
  f0?: number;
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

/** Frication the engine reports for a full /s/ (measured peaks reach about 2); the display saturates there. */
const FRICATION_FULL = 2;

/** Display intensities are normalized model quantities, not measured audio levels. */
export function airwayActivity(state: Pick<AirwayState, 'running' | 'oralPressure' | 'frication' | 'noiseIndex' | 'voicing'>) {
  const unit = (v = 0) => Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
  return {
    pressure: state.running ? unit(state.oralPressure) : 0,
    friction: state.running ? Math.sqrt(unit((state.frication ?? 0) / FRICATION_FULL)) : 0,
    voicing: state.running ? unit(state.voicing) : 0,
    noiseIndex: Math.round(unit((state.noiseIndex ?? 0) / (N - 1)) * (N - 1)),
  };
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
  const activity = airwayActivity(state);
  const noiseAt = oral[activity.noiseIndex];
  const sealed = state.running && state.closed;
  const sealAt = oral[Math.min(N - 1, Math.max(0, state.minIndex))];

  return (
    <g className="hvl-airway" aria-hidden>
      {nasal.map((p, i) => (
        <circle key={`n${i}`} cx={p[0]} cy={p[1]} r={1.6} className="hvl-bead"
          style={{opacity: 0.12 + 0.88 * lit(energy ? energy[N + i] : 0)}} />
      ))}
      {activity.pressure > 0.01 && oral.slice(0, Math.max(1, state.minIndex)).map((p, i) => (
        <circle key={`pressure${i}`} cx={p[0]} cy={p[1]} r={4 + activity.pressure * 5}
          fill="var(--hvl-warm)" opacity={activity.pressure * 0.3} />
      ))}
      <Folds state={state} />
      {oral.map((p, i) => {
        const a = state.areas[i] ?? 1;
        return <circle key={i} cx={p[0]} cy={p[1]} r={radius(a)} className={`hvl-bead ${a < 0.004 ? 'is-shut' : ''}`}
          style={{opacity: 0.14 + 0.86 * lit(energy ? energy[i] : 0)}} />;
      })}
      {activity.friction > 0.01 && <g transform={`translate(${noiseAt[0]} ${noiseAt[1]})`} opacity={activity.friction}>
        <circle r={4 + 9 * activity.friction} fill="var(--hvl-warm)" fillOpacity={0.25} stroke="var(--hvl-warm)" strokeWidth={1.5} />
        <path d="M -9 -3 L -4 1 L 0 -4 L 4 2 L 9 -2" fill="none" stroke="var(--hvl-warm)" strokeWidth={1.5} />
      </g>}
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
      // Drift follows mean airflow; vocal-fold activity has its own marker.
      const speed = flowing ? 70 * Math.max(0, Math.min(1.2, state.airflow)) : 0;
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
    return () => void (stepRef.current = null);
  }, []);
  useFrameLoop(stepRef, state.clock);
  return (
    <g ref={group} className="hvl-particles">
      {Array.from({length: PARTICLES}, (_, i) => <circle key={i} r={1.3} cx={298} cy={458} style={{opacity: 0}} />)}
    </g>
  );
}

/**
 * Run `stepRef.current(dt)` every animation frame, or, with a fixed `clock`
 * (frame rendering), once per clock change by exactly the clock difference.
 */
function useFrameLoop(stepRef: React.MutableRefObject<((dt: number) => void) | null>, clock: number | undefined) {
  const fixed = clock !== undefined;
  const lastClock = useRef<number | null>(null);
  useEffect(() => {
    if (fixed) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      stepRef.current?.(Math.min(0.05, (now - last) / 1000));
      last = now;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [fixed]);
  useEffect(() => {
    if (clock === undefined) return;
    const dt = lastClock.current === null ? 0 : Math.min(0.05, Math.max(0, clock - lastClock.current));
    lastClock.current = clock;
    stepRef.current?.(dt);
  }, [clock]);
}

const unit = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
/** Output RMS that reads as a full-strength sound (a sung vowel renders at about 0.1). */
const LEVEL_FULL = 0.12;
/** How loud the voice is, 0–1, for display. */
export function soundLevel(state: Pick<AirwayState, 'running' | 'gate' | 'level'>): number {
  if (!state.running || state.gate < 0.05) return 0;
  return Math.pow(unit((state.level ?? 0) / LEVEL_FULL), 0.6);
}

/** Glottis, as drawn by the portrait (the folds meet at x = 298). */
const FOLDS = {x0: 287, x1: 309, y: 456};

/**
 * The vocal folds buzzing: a wave across the glottis whose density follows the
 * pitch (higher notes, tighter wave) and whose height follows voicing and level.
 * It scrolls at a visible rate; the true vibration (hundreds of Hz) is too fast to see.
 */
function Folds({state}: {state: AirwayState}) {
  const path = useRef<SVGPathElement>(null);
  const glow = useRef<SVGCircleElement>(null);
  const live = useRef(state);
  live.current = state;
  const stepRef = useRef<((dt: number) => void) | null>(null);
  useEffect(() => {
    let phase = 0;
    let shown = 0;
    stepRef.current = dt => {
      const s = live.current;
      const voicing = airwayActivity(s).voicing;
      const target = voicing * Math.max(0.35, soundLevel(s));
      shown += (target - shown) * Math.min(1, dt * 18);
      const f0 = s.f0 && s.f0 > 40 ? s.f0 : 200;
      const cycles = Math.max(2, Math.min(9, f0 / 55));
      phase += dt * 2 * Math.PI * (6 + f0 / 40);
      const amp = 4.2 * shown;
      let d = '';
      for (let k = 0; k <= 32; k++) {
        const u = k / 32;
        const x = FOLDS.x0 + (FOLDS.x1 - FOLDS.x0) * u;
        // Pinned at the fold edges, free in the middle.
        const y = FOLDS.y + amp * Math.sin(Math.PI * u) * Math.sin(2 * Math.PI * cycles * u - phase);
        d += `${k ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)} `;
      }
      path.current?.setAttribute('d', d);
      path.current?.setAttribute('opacity', unit(shown * 1.6).toFixed(2));
      if (glow.current) {
        glow.current.setAttribute('r', (6 + 9 * shown + 1.5 * shown * Math.sin(phase * 0.5)).toFixed(1));
        glow.current.setAttribute('opacity', (0.5 * shown).toFixed(2));
      }
    };
    return () => void (stepRef.current = null);
  }, []);
  useFrameLoop(stepRef, state.clock);
  return (
    <g className="hvl-folds">
      <circle ref={glow} cx={298} cy={FOLDS.y} r={0} fill="var(--hvl-good)" opacity={0} />
      <path ref={path} d="" fill="none" stroke="var(--hvl-good)" strokeWidth={1.8} strokeLinecap="round" opacity={0} />
    </g>
  );
}

const RINGS = 14;
/** Sections from here to the lips are at the face's edge (teeth, lips): drawn outside the cutaway. */
const FRONT = N - 6;
const SPRAY = 56;
/** How far sound rings travel (rig units) and how fast. */
const RING_REACH = 120;
const RING_SPEED = 115;

/**
 * What leaves her, drawn in the air in front of the face (outside the cutaway window):
 *  - sound rings from the lips, one every few dozen glottal cycles so the
 *    spacing tightens as the pitch rises; strength follows the output level;
 *    dashed and amber when the sound is turbulent noise; from the nostril in
 *    proportion to the air leaving the nose;
 *  - a spray of particles from where the noise is made (teeth for /s/, lips for /f/);
 *  - a pressure halo at a seal while pressure builds, and a puff when it opens.
 */
export function Emission({state, geometry}: {state: AirwayState; geometry: Geometry}) {
  // Moving rings and spray are left out for viewers who ask for less motion (frame renders keep them).
  const reduced = useMemo(() => state.clock === undefined && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  return reduced ? null : <EmissionLayer state={state} geometry={geometry} />;
}

function EmissionLayer({state, geometry}: {state: AirwayState; geometry: Geometry}) {
  const {oral, nasal} = useMemo(() => airwayPoints(geometry), [geometry.exit[0], geometry.exit[1], geometry.tongueDeg]);
  const rings = useRef<SVGGElement>(null);
  const spray = useRef<SVGGElement>(null);
  const halo = useRef<SVGCircleElement>(null);
  const puff = useRef<SVGCircleElement>(null);
  const live = useRef({oral, nasal, state});
  live.current = {oral, nasal, state};
  const stepRef = useRef<((dt: number) => void) | null>(null);
  useEffect(() => {
    const ringEls = Array.from(rings.current!.children) as SVGPathElement[];
    const dotEls = Array.from(spray.current!.children) as SVGCircleElement[];
    type Ring = {x: number; y: number; r: number; strength: number; noise: boolean; alive: boolean; spread: number};
    type Dot = {x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; alive: boolean};
    const rs: Ring[] = ringEls.map(() => ({x: 0, y: 0, r: 0, strength: 0, noise: false, alive: false, spread: 1}));
    const ds: Dot[] = dotEls.map(() => ({x: 0, y: 0, vx: 0, vy: 0, life: 1, age: 0, size: 1, alive: false}));
    let seed = 2463534242;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    let nextRing = 0;
    let nextNose = 0;
    let sprayDue = 0;
    let wasClosed = false;
    let lastPressure = 0;
    let puffAge = Infinity;
    let puffAt: Pt = [0, 0];
    let puffStrength = 0;
    let time = 0;
    const ring = (x: number, y: number, strength: number, noise: boolean, spread = 1) => {
      const r = rs.find(q => !q.alive) ?? rs.reduce((a, b) => (a.r > b.r ? a : b));
      Object.assign(r, {x, y, r: 2, strength, noise, alive: true, spread});
    };
    const dot = (x: number, y: number, angle: number, speed: number, life: number) => {
      const d = ds.find(q => !q.alive) ?? ds.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
      Object.assign(d, {x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, age: 0, size: 0.7 + random() * 1.1, alive: true});
    };
    stepRef.current = dt => {
      const {oral, nasal, state: s} = live.current;
      time += dt;
      const act = airwayActivity(s);
      const level = soundLevel(s);
      const exit = oral[N - 1];
      const nostril = nasal[NASAL - 1];
      const lipsShut = s.closed && s.minIndex >= N - 4;
      const noisy = act.friction > 0.15 && act.voicing < 0.5;
      // Rings: one per ~32 glottal cycles (about 7 a second at 220 Hz), or steady for noise.
      const f0 = s.f0 && s.f0 > 40 ? s.f0 : 0;
      const rate = noisy || !f0 ? 9 : Math.max(4, Math.min(16, f0 / 32));
      const strength = Math.max(level, noisy ? 0.55 * act.friction : 0);
      const oralShare = 1 - unit(s.nasalShare ?? 0);
      if (strength > 0.04) {
        nextRing -= dt * rate;
        if (nextRing <= 0) {
          nextRing += 1;
          if (!lipsShut && oralShare > 0.15) ring(exit[0] + 3, exit[1], strength * Math.max(0.35, oralShare), noisy);
        }
        nextNose -= dt * rate * 0.8;
        if (nextNose <= 0) {
          nextNose += 1;
          if ((s.nasalShare ?? 0) > 0.15) ring(nostril[0] + 2, nostril[1] - 1, strength * unit(s.nasalShare ?? 0) * 0.8, false, 0.8);
        }
      } else {
        nextRing = Math.min(nextRing, 0);
        nextNose = Math.min(nextNose, 0);
      }
      // Spray from the noise source, fanning forward out of the mouth.
      if (act.friction > 0.05 && !lipsShut) {
        // Noise made deep in the mouth (a velar hiss) is seen where its air leaves, at the lips.
        const src = oral[Math.max(act.noiseIndex, FRONT)];
        sprayDue += dt * (40 + 160 * act.friction);
        while (sprayDue >= 1) {
          sprayDue -= 1;
          const from: Pt = [src[0] + (random() - 0.5) * 3, src[1] + (random() - 0.5) * 3];
          dot(from[0], from[1], (random() - 0.5) * 0.9 + 0.05, 90 + 140 * act.friction * (0.6 + random() * 0.6), 0.28 + random() * 0.3);
        }
      } else sprayDue = 0;
      // A seal that opens on built-up pressure: a puff, a strong ring and a burst of air.
      const sealAt = oral[Math.min(N - 1, Math.max(0, Math.round(s.minIndex)))];
      if (wasClosed && !s.closed && lastPressure > 0.2) {
        puffAge = 0;
        puffAt = s.minIndex >= FRONT ? sealAt : exit;
        puffStrength = unit(lastPressure * 1.2);
        ring(exit[0] + 3, exit[1], 0.6 + 0.4 * puffStrength, false, 1.25);
        for (let k = 0; k < 18; k++) dot(puffAt[0], puffAt[1], (random() - 0.5) * 1.4, 120 + 160 * random() * puffStrength, 0.22 + random() * 0.25);
      }
      wasClosed = s.running && s.closed;
      lastPressure = act.pressure;
      // Draw rings.
      for (let k = 0; k < rs.length; k++) {
        const r = rs[k];
        const el = ringEls[k];
        if (!r.alive) { el.setAttribute('opacity', '0'); continue; }
        r.r += RING_SPEED * dt;
        const fade = 1 - r.r / RING_REACH;
        if (fade <= 0) { r.alive = false; el.setAttribute('opacity', '0'); continue; }
        const half = 0.95 * r.spread;
        const a0 = -half, a1 = half;
        const p0 = [r.x + r.r * Math.cos(a0), r.y + r.r * Math.sin(a0)];
        const p1 = [r.x + r.r * Math.cos(a1), r.y + r.r * Math.sin(a1)];
        el.setAttribute('d', `M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A ${r.r.toFixed(1)} ${r.r.toFixed(1)} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`);
        el.setAttribute('opacity', (fade * (0.25 + 0.75 * r.strength)).toFixed(2));
        el.setAttribute('stroke-width', (0.8 + 2.6 * r.strength * fade).toFixed(2));
        el.setAttribute('stroke', r.noise ? 'var(--hvl-warm)' : 'var(--hvl-accent)');
        el.setAttribute('stroke-dasharray', r.noise ? '1.5 3.5' : 'none');
      }
      // Draw spray.
      for (let k = 0; k < ds.length; k++) {
        const d = ds[k];
        const el = dotEls[k];
        if (!d.alive) { el.setAttribute('opacity', '0'); continue; }
        d.age += dt;
        if (d.age >= d.life) { d.alive = false; el.setAttribute('opacity', '0'); continue; }
        // Air slows as it spreads.
        const drag = Math.exp(-dt * 3);
        d.vx *= drag; d.vy *= drag;
        d.x += d.vx * dt; d.y += d.vy * dt;
        const t = d.age / d.life;
        el.setAttribute('cx', d.x.toFixed(1));
        el.setAttribute('cy', d.y.toFixed(1));
        el.setAttribute('r', (d.size * (1 + 1.5 * t)).toFixed(2));
        el.setAttribute('opacity', (0.85 * (1 - t) * (t < 0.1 ? t / 0.1 : 1)).toFixed(2));
      }
      // Pressure halo while a seal holds pressure (it swells and throbs as pressure rises).
      if (halo.current) {
        // Only a seal at the teeth or lips shows outside; inner seals glow inside the cutaway.
        const on = s.running && s.closed && s.minIndex >= FRONT ? act.pressure : 0;
        const at = sealAt;
        halo.current.setAttribute('cx', at[0].toFixed(1));
        halo.current.setAttribute('cy', at[1].toFixed(1));
        halo.current.setAttribute('r', (5 + 13 * on + (on > 0.05 ? 1.2 * Math.sin(time * 11) : 0)).toFixed(1));
        halo.current.setAttribute('opacity', (0.55 * on).toFixed(2));
      }
      // Release puff.
      if (puff.current) {
        puffAge += dt;
        const t = puffAge / 0.3;
        if (t < 1) {
          puff.current.setAttribute('cx', puffAt[0].toFixed(1));
          puff.current.setAttribute('cy', puffAt[1].toFixed(1));
          puff.current.setAttribute('r', (6 + 34 * Math.sqrt(t) * (0.5 + 0.5 * puffStrength)).toFixed(1));
          puff.current.setAttribute('opacity', (0.55 * (1 - t) * puffStrength).toFixed(2));
        } else puff.current.setAttribute('opacity', '0');
      }
    };
    return () => void (stepRef.current = null);
  }, []);
  useFrameLoop(stepRef, state.clock);
  return (
    <g className="hvl-emission" aria-hidden>
      <circle ref={halo} r={0} fill="var(--hvl-warm)" opacity={0} />
      <circle ref={puff} r={0} fill="var(--hvl-warm)" opacity={0} />
      <g ref={rings} fill="none" strokeLinecap="round">
        {Array.from({length: RINGS}, (_, i) => <path key={i} d="" opacity={0} />)}
      </g>
      <g ref={spray} fill="var(--hvl-warm)">
        {Array.from({length: SPRAY}, (_, i) => <circle key={i} r={1} opacity={0} />)}
      </g>
    </g>
  );
}
