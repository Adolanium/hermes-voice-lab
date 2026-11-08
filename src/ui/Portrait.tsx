/**
 * Side-profile portrait rig: an original, editable interpretation of the
 * Nous Girl character (blunt pointed fringe, bob with flipped ends, white headphones
 * with a slider yoke and earcup, strong lashes, sleeveless top), facing the controls.
 *
 * Every moving part is driven by synthesis parameters: jaw rotation, lip
 * aperture and rounding, tongue body/tip/back, velum and vocal folds. The
 * optional cutaway is a stylised midsagittal view of the modelled
 * articulators, not medical anatomy.
 */
import React, {useCallback, useMemo, useRef} from 'react';
import type {ParamName} from '../core/params';
import {AirwayLife, type AirwayState} from './AirwayLife';
import {FloatingWords, headMotion, type StageState} from './stage';
import {ART_FIGURE, ART_INK, ART_TONE} from './art/nousGirlArt';
import {lineY, mouthShapes, prepare, warpPath, warpPoint, type FacePose} from './faceRig';

const FACE = {figure: prepare(ART_FIGURE), tone: prepare(ART_TONE), ink: prepare(ART_INK)};

export interface Pose {
  tongueX: number;
  tongueY: number;
  tipPlace: number;
  tipClose: number;
  dorsumClose: number;
  jaw: number;
  lipOpen: number;
  lipRound: number;
  velum: number;
  voicing: number;
  /** 0..1 glottal opening for the fold animation. */
  flow: number;
  /** Overall loudness envelope 0..1, used for airflow hints. */
  level: number;
  rhotic: number;
}

interface Props {
  pose: Pose;
  /** Live airway telemetry for the cutaway (areas always; energy/flow while sounding). */
  airway: AirwayState;
  cutaway: boolean;
  labels: boolean;
  speaking: boolean;
  onDrag?: (changes: Partial<Record<ParamName, number>>) => void;
  onDragEnd?: () => void;
  /** Stage mode: floating sung words, head bob and a bigger mouth. */
  stage?: StageState;
  /** SVG viewBox override (e.g. a wider frame for video). */
  viewBox?: string;
  /** Explicit cutaway opacity 0..1 (frame rendering), overriding the toggle's fade. */
  cutawayOpacity?: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
type Pt = [number, number];

const PIVOT: Pt = [266, 292];
const MAX_JAW_DEG = 13;

function rotate([x, y]: Pt, deg: number, [cx, cy]: Pt = PIVOT): Pt {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

/** Roof of the mouth (hard palate and alveolar ridge) height at x. */
const palateY = (x: number) => 312 + Math.max(0, x - 296) * 0.15 + Math.max(0, x - 372) * 0.55;

const f = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

/** Compute rig geometry from the pose. */
export function rig(p: Pose) {
  const jawDeg = MAX_JAW_DEG * clamp01(p.jaw) * 0.9 + 0.6;
  const tongueDeg = jawDeg * 0.55;
  const round = clamp01(p.lipRound);
  const open = clamp01(p.lipOpen);
  // Lips. The upper lip barely moves; the lower lip rides on the jaw but
  // can still meet the upper lip when the lips close.
  const protrude = 6 * round;
  const upperLip: Pt = [400 + protrude, 337 - open * 1.2];
  const corner: Pt = [382 + 6 * round, 345.5];
  const lipGap = open * (2.5 + 15 * clamp01(p.jaw)) * (1 - 0.3 * round);
  const carried = rotate([397, 352], jawDeg);
  const target: Pt = [397 + protrude * 0.9, upperLip[1] + 3.5 + lipGap];
  const lowerLip: Pt = [lerp(carried[0], target[0], 0.85), lerp(carried[1], target[1], 0.85)];

  // Tongue (head coordinates, before the partial jaw rotation).
  let dx = lerp(306, 352, clamp01(p.tongueX));
  let dy = lerp(372, 318, clamp01(p.tongueY));
  const back = clamp01(p.dorsumClose);
  dx = lerp(dx, Math.min(dx, 334), back * 0.6);
  dy = lerp(dy, palateY(dx) + 1, back);
  dy = Math.max(dy, palateY(dx) + 1.5);
  const dorsum: Pt = [dx, dy];
  const tipRest: Pt = [375, 352 - 8 * clamp01(p.tongueY)];
  const tipX = lerp(385, 362, clamp01(p.tipPlace));
  const contact: Pt = [tipX, palateY(tipX) + (p.tipPlace < 0.12 ? 10 : 2)];
  const c = Math.pow(clamp01(p.tipClose), 0.7);
  let tip: Pt = [lerp(tipRest[0], contact[0], c), lerp(tipRest[1], contact[1], c)];
  if (p.rhotic > 0.05) tip = [lerp(tip[0], 360, p.rhotic * 0.5), lerp(tip[1], 334, p.rhotic * 0.5)];
  const rootX = lerp(290, 306, clamp01(p.tongueX)) - 5 * p.rhotic;
  // Velum: raised (closed) seals against the pharynx wall; lowered hangs.
  const v = clamp01(p.velum);
  const uvula: Pt = [lerp(282, 296, v), lerp(318, 342, v)];
  const fold = p.voicing > 0.4 ? 0.8 + 2.6 * clamp01(p.flow) : 6;
  return {jawDeg, tongueDeg, upperLip, lowerLip, corner, protrude, lipGap, dorsum, tip, rootX, uvula, fold, round};
}

export type Rig = ReturnType<typeof rig>;

function tonguePath(g: Rig): string {
  const [dx, dy] = g.dorsum;
  const [tx, ty] = g.tip;
  const root: Pt = [g.rootX + 2, 410];
  const rootTop: Pt = [g.rootX + 1, 382];
  const bx = lerp(dx, tx, 0.55);
  const blade: Pt = [bx, Math.max(palateY(bx) + 2, lerp(dy, ty, 0.55) - 3)];
  return [
    `M ${f(root)}`,
    `C ${f([root[0] - 3, 400])} ${f([rootTop[0] - 3, 392])} ${f(rootTop)}`,
    `C ${f([rootTop[0] + 3, dy + 16])} ${f([dx - 18, dy])} ${f([dx, dy])}`,
    `C ${f([dx + 12, dy])} ${f([blade[0] - 8, blade[1]])} ${f(blade)}`,
    `C ${f([blade[0] + 8, blade[1] + 1])} ${f([tx - 5, ty - 3])} ${f([tx, ty])}`,
    `C ${f([tx + 4, ty + 2])} ${f([tx + 1, ty + 7])} ${f([tx - 6, ty + 8])}`,
    `C ${f([362, 366])} ${f([350, 374])} ${f([338, 384])}`,
    `C ${f([328, 394])} ${f([318, 408])} ${f([root[0] + 8, 412])}`,
    'Z',
  ].join(' ');
}

const S = {
  ink: 'var(--hvl-ink)',
  skin: 'var(--hvl-skin)',
  paper: 'var(--hvl-paper)',
  accent: 'var(--hvl-accent)',
  flesh: 'var(--hvl-flesh)',
  cavity: 'var(--hvl-cavity)',
  bone: 'var(--hvl-bone)',
  air: 'var(--hvl-air)',
};

const WINDOW = 'M 270 292 C 300 282 350 280 384 286 C 404 292 414 312 404 330 C 398 346 404 372 392 394 C 380 410 362 414 354 420 C 350 438 350 456 352 474 L 262 478 C 262 440 262 400 262 360 C 262 330 262 304 270 292 Z';

/**
 * The rig's articulation geometry (above) lives in a compact "rig" coordinate
 * space. The portrait artwork lives in its own space; this affine places the
 * rig inside her head so the cutaway, handles and airway line up with the art.
 */
const RIG_TO_ART = {a: 2.66, d: 2.645, e: 2, f: -216};
const rigToArt = ([x, y]: Pt): Pt => [RIG_TO_ART.a * x + RIG_TO_ART.e, RIG_TO_ART.d * y + RIG_TO_ART.f];

const DEFAULT_VIEWBOX = '40 20 1290 1230';
/** Right edge of the visible frame (art units), with a small margin. */
const frameRight = (viewBox = DEFAULT_VIEWBOX) => {
  const [x, , w] = viewBox.split(/\s+/).map(Number);
  return x + w - 24;
};

/** Neck pivot for head motion and the mouth exit for floating words (art space). */
const NECK: Pt = [780, 1080];

export function Portrait({pose, airway, cutaway, labels, speaking, onDrag, onDragEnd, stage, viewBox, cutawayOpacity}: Props) {
  const g = rig(pose);
  const svg = useRef<SVGSVGElement>(null);
  const rigGroup = useRef<SVGGElement>(null);
  const drag = useRef<null | {kind: string; start: Pt; startPose: Pose}>(null);

  /** Pointer position in rig coordinates. */
  const toLocal = useCallback((e: React.PointerEvent): Pt => {
    const el = svg.current;
    const m = rigGroup.current?.getScreenCTM();
    if (!el || !m) return [0, 0];
    const pt = el.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const r = pt.matrixTransform(m.inverse());
    return [r.x, r.y];
  }, []);

  const begin = (kind: string) => (e: React.PointerEvent) => {
    if (!onDrag) return;
    e.preventDefault();
    e.stopPropagation();
    svg.current?.setPointerCapture?.(e.pointerId);
    drag.current = {kind, start: toLocal(e), startPose: pose};
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !onDrag) return;
    const [x, y] = toLocal(e);
    const dx = x - d.start[0];
    const dy = y - d.start[1];
    const s = d.startPose;
    switch (d.kind) {
      case 'tongue':
        onDrag({tongueX: clamp01(s.tongueX + dx / 46), tongueY: clamp01(s.tongueY - dy / 54)});
        break;
      case 'tip':
        onDrag({tipPlace: clamp01(s.tipPlace - dx / 23), tipClose: clamp01(s.tipClose - dy / 20)});
        break;
      case 'jaw':
        onDrag({jaw: clamp01(s.jaw + dy / 30)});
        break;
      case 'lips':
        onDrag({lipOpen: clamp01(s.lipOpen + dy / 14), lipRound: clamp01(s.lipRound + dx / 10)});
        break;
      case 'velum':
        onDrag({velum: clamp01(s.velum + (dx + dy) / 26)});
        break;
    }
  };
  const end = () => {
    if (drag.current) onDragEnd?.();
    drag.current = null;
  };

  const jaw = `rotate(${g.jawDeg.toFixed(2)} ${PIVOT[0]} ${PIVOT[1]})`;
  const tongueRot = `rotate(${g.tongueDeg.toFixed(2)} ${PIVOT[0]} ${PIVOT[1]})`;
  const ul = g.upperLip;
  // Face rig: the chin follows the jaw, the lower lip its own gap (so the lips can
  // shut with the jaw open), and rounding pushes the lips out. Bigger on stage.
  // The jaw matches the cutaway's jaw; lips are livelier while singing on stage.
  const show = stage?.singing ? 1.3 : 0.9;
  const lipDeg = (Math.atan((g.lipGap * RIG_TO_ART.d * show) / 360) * 180) / Math.PI;
  const face: FacePose = {
    jaw: Math.max(g.jawDeg - 0.6, lipDeg * 0.7),
    lip: lipDeg,
    pout: g.protrude * RIG_TO_ART.a * show,
  };
  const q = (v: number) => Math.round(v * 20) / 20;
  const key = `${q(face.jaw)}|${q(face.lip)}|${q(face.pout)}`;
  const warped = useMemo(() => {
    const k: FacePose = {jaw: q(face.jaw), lip: q(face.lip), pout: q(face.pout)};
    return {figure: warpPath(FACE.figure, k), tone: warpPath(FACE.tone, k), ink: warpPath(FACE.ink, k), mouth: mouthShapes(k)};
  }, [key]);
  const head = headMotion(stage);
  const headTransform = `translate(0 ${head.dy.toFixed(1)}) rotate(${head.deg.toFixed(2)} ${NECK[0]} ${NECK[1]})`;
  const mouthOut = ((): Pt => {
    const r = (head.deg * Math.PI) / 180;
    const lower = warpPoint(1064, lineY(1064) + 4.5, face);
    const [x, y] = [(1066 + lower[0]) / 2 + 8 - NECK[0], (lineY(1064) + lower[1]) / 2 - NECK[1]];
    return [NECK[0] + x * Math.cos(r) - y * Math.sin(r), NECK[1] + x * Math.sin(r) + y * Math.cos(r) + head.dy];
  })();
  const handle = (kind: string, at: Pt, label: string, r = 8) => (
    <g className="hvl-handle" onPointerDown={begin(kind)} aria-label={label}>
      <title>{label}</title>
      <circle cx={at[0]} cy={at[1]} r={r + 9} fill="transparent" />
      <circle cx={at[0]} cy={at[1]} r={r} className="hvl-handle-ring" />
      <circle cx={at[0]} cy={at[1]} r={2.4} className="hvl-handle-dot" />
    </g>
  );
  const tongueAt = rotate(g.dorsum, g.tongueDeg);
  const tipAt = rotate(g.tip, g.tongueDeg);
  const artToRig = ([x, y]: Pt): Pt => [(x - RIG_TO_ART.e) / RIG_TO_ART.a, (y - RIG_TO_ART.f) / RIG_TO_ART.d];
  const chin = artToRig(warpPoint(1046, 808, face));
  const lipsAt = artToRig(warpPoint(1086, 700, face));
  const m = warped.mouth;

  return (
    <svg ref={svg} viewBox={viewBox ?? DEFAULT_VIEWBOX} className={`hvl-portrait ${stage ? 'is-stage' : ''}`} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      role="img" aria-label="Side-profile portrait whose mouth, jaw, tongue and throat follow the synthesizer">
      <defs>
        <radialGradient id="hvl-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--hvl-accent)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--hvl-accent)" stopOpacity="0" />
        </radialGradient>
        {m && <clipPath id="hvl-mouth"><path d={m.cavity} /></clipPath>}
        <filter id="hvl-feather" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /></filter>
        <mask id="hvl-window" maskUnits="userSpaceOnUse" x="200" y="230" width="260" height="300">
          <path d={WINDOW} fill="white" filter="url(#hvl-feather)" />
        </mask>
      </defs>
      <circle cx="840" cy="640" r="585" className="hvl-portrait-disc" />
      <circle cx="860" cy="640" r="600" fill="url(#hvl-glow)" />
      <circle cx="860" cy="640" r="560" fill="none" stroke="var(--hvl-accent)" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="2 16" />

      <g transform={headTransform}>
      {/* Portrait: the artwork, bent by the face rig, with the open mouth over it */}
      <path d={warped.figure} fill={S.skin} />
      <path d={warped.tone} className="hvl-art-tone" />
      <path d={warped.ink} fill={S.ink} fillRule="evenodd" />
      {m && (
        <g className="hvl-mouth">
          <path d={m.cavity} className="hvl-mouth-cavity" />
          <g clipPath="url(#hvl-mouth)">
            <path d={m.tongue} className="hvl-mouth-tongue" />
            <path d={m.teeth} className="hvl-mouth-teeth" />
          </g>
        </g>
      )}

      <g ref={rigGroup} transform={`matrix(${RIG_TO_ART.a} 0 0 ${RIG_TO_ART.d} ${RIG_TO_ART.e} ${RIG_TO_ART.f})`}>
        {/* Cutaway: stylised midsagittal view of the modelled articulators */}
        <g className={`hvl-cutaway ${cutaway ? 'is-on' : ''}`} aria-hidden={!cutaway} style={cutawayOpacity === undefined ? undefined : {opacity: cutawayOpacity}}>
          <g mask="url(#hvl-window)">
            <rect x="240" y="250" width="200" height="250" fill={S.paper} opacity="0.94" />
            <path d="M 282 300 C 300 286 340 282 372 288 C 390 292 402 302 408 314 L 402 320 C 390 310 370 304 346 304 C 318 304 300 308 290 316 Z" fill={S.cavity} opacity={0.3 + 0.55 * pose.velum} />
            <path d="M 282 300 C 300 286 340 282 372 288 C 390 292 402 302 408 314" fill="none" stroke={S.bone} strokeWidth="1.1" opacity="0.7" />
            <path d={`M 278 312 C 282 350 282 400 286 440 L 312 440 C 310 420 ${f([g.rootX + 4, 400])} ${f([g.rootX + 6, 384])} L 372 364 L ${f([ul[0] - 3, ul[1] + 4])} L 388 330 C 360 322 320 312 294 312 Z`} fill={S.cavity} opacity="0.55" />
            <path d="M 292 312 C 326 314 356 320 380 328" fill="none" stroke={S.bone} strokeWidth="5" strokeLinecap="round" />
            <path d={`M 298 313 C 290 314 ${f([g.uvula[0] + 7, g.uvula[1] - 9])} ${f(g.uvula)}`} fill="none" stroke={S.flesh} strokeWidth="6.5" strokeLinecap="round" />
            <path d="M 274 290 C 276 330 276 390 282 450" fill="none" stroke={S.flesh} strokeWidth="5" strokeLinecap="round" opacity="0.8" />
            <path d="M 379 325 L 388 327 L 390 342 L 383 343 Z" fill={S.paper} stroke={S.bone} strokeWidth="1.3" />
            <g transform={jaw}>
              <path d="M 377 349 L 386 348 L 385 362 L 378 362 Z" fill={S.paper} stroke={S.bone} strokeWidth="1.3" />
              <path d="M 378 366 C 360 380 340 394 316 404" fill="none" stroke={S.bone} strokeWidth="2.6" strokeLinecap="round" opacity="0.6" />
            </g>
            <g transform={tongueRot}>
              <path d={tonguePath(g)} fill={S.flesh} stroke={S.ink} strokeWidth="1.2" />
              <path d={`M ${f([g.rootX + 9, 414])} C ${f([g.dorsum[0] - 10, g.dorsum[1] + 28])} ${f([g.dorsum[0] + 8, g.dorsum[1] + 18])} ${f([g.tip[0] - 9, g.tip[1] + 5])}`} fill="none" stroke={S.ink} strokeWidth="0.8" opacity="0.22" />
            </g>
            <path d="M 300 420 C 296 410 298 400 304 394" fill="none" stroke={S.flesh} strokeWidth="3.5" strokeLinecap="round" />
            <path d="M 284 440 L 312 440 L 311 482 L 287 482 Z" fill={S.cavity} opacity="0.55" />
            <path d={`M 285 452 L ${298 - g.fold} 456 L 285 460 Z`} fill={S.flesh} stroke={S.ink} strokeWidth="0.9" />
            <path d={`M 311 452 L ${298 + g.fold} 456 L 311 460 Z`} fill={S.flesh} stroke={S.ink} strokeWidth="0.9" />
            <AirwayLife state={airway} geometry={{pivot: PIVOT, tongueDeg: g.tongueDeg, exit: [ul[0] - 2, ul[1] + g.lipGap / 2 + 2]}} />
          </g>
          {/* Her outline stays visible through the lens */}
          <g mask="url(#hvl-window)" className="hvl-xray">
            <g transform={`matrix(${1 / RIG_TO_ART.a} 0 0 ${1 / RIG_TO_ART.d} ${-RIG_TO_ART.e / RIG_TO_ART.a} ${-RIG_TO_ART.f / RIG_TO_ART.d})`}>
              <path d={warped.ink} fill={S.ink} fillRule="evenodd" />
              {m && <path d={m.cavity} className="hvl-mouth-cavity" />}
            </g>
          </g>
        </g>

        {onDrag && (
          <g className="hvl-handles">
            {cutaway && handle('tongue', tongueAt, 'Tongue body — drag to move front/back and up/down')}
            {cutaway && handle('tip', tipAt, 'Tongue tip — drag up to close, left to move back', 6)}
            {cutaway && handle('velum', g.uvula, 'Velum — drag down to open the nasal passage', 6)}
            {handle('lips', lipsAt, 'Lips — drag down to open, right to round', 7)}
            {handle('jaw', chin, 'Jaw — drag down to open', 8)}
          </g>
        )}
        {labels && (
          <g className="hvl-labels">
            {cutaway && <Label at={[340, 296]} to={[214, 362]} text="nasal tract" />}
            {cutaway && <Label at={g.uvula} to={[214, 396]} text="velum" />}
            {cutaway && <Label at={tongueAt} to={[214, 430]} text="tongue" />}
            {cutaway && <Label at={[296, 456]} to={[214, 466]} text="vocal folds" />}
            <Label at={lipsAt} to={[438, 352]} text="lips" anchor="start" />
            <Label at={chin} to={[430, 410]} text="jaw" anchor="start" />
          </g>
        )}
      </g>
      </g>
      {stage && <FloatingWords stage={stage} mouth={mouthOut} right={frameRight(viewBox)} />}
    </svg>
  );
}

function Label({at, to, text, anchor = 'end'}: {at: Pt; to: Pt; text: string; anchor?: 'start' | 'end'}) {
  const w = text.length * 6.1 + 12;
  const x = anchor === 'end' ? to[0] - 4 - w : to[0] + 4;
  return (
    <g className="hvl-label">
      <path d={`M ${f(at)} L ${f(to)}`} fill="none" />
      <circle cx={at[0]} cy={at[1]} r={1.6} className="hvl-label-dot" />
      <rect x={x} y={to[1] - 8} width={w} height={16} rx={8} />
      <text x={x + w / 2} y={to[1] + 3.2} textAnchor="middle">{text}</text>
    </g>
  );
}
