/**
 * Side-profile portrait rig: an original, editable interpretation of the
 * Nous Girl character (blunt fringe, bob with flipped ends, white headband
 * with a hooked clasp, strong lashes, high collar), facing the controls.
 *
 * Every moving part is driven by synthesis parameters: jaw rotation, lip
 * aperture and rounding, tongue body/tip/back, velum and vocal folds. The
 * optional cutaway is a stylised midsagittal view of the modelled
 * articulators, not medical anatomy.
 */
import React, {useCallback, useRef} from 'react';
import type {ParamName} from '../core/params';

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
  cutaway: boolean;
  labels: boolean;
  speaking: boolean;
  onDrag?: (changes: Partial<Record<ParamName, number>>) => void;
  onDragEnd?: () => void;
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

/** Silhouette paths, drawn for this product. */
const HAIR_BACK =
  'M 384 214 C 386 150 340 84 262 72 C 186 62 120 108 104 182 C 92 238 104 296 98 350 C 94 392 80 424 60 452 ' +
  'C 50 468 56 486 74 486 C 90 486 98 474 104 464 C 104 482 114 496 132 496 C 148 496 152 482 150 472 ' +
  'C 162 486 182 490 196 482 C 206 474 204 462 196 456 C 220 462 242 456 254 440 C 266 422 272 400 276 376 ' +
  'C 282 340 286 300 296 262 C 304 238 330 226 360 222 Z';

const BANGS =
  'M 262 72 C 330 74 376 112 388 168 C 392 190 393 214 396 238 L 386 236 L 382 222 L 376 238 L 368 228 L 362 240 ' +
  'L 354 228 L 346 241 L 338 230 L 330 242 L 322 231 L 314 242 L 306 232 L 298 244 C 290 210 274 180 252 160 ' +
  'C 232 142 212 134 196 132 C 208 100 232 78 262 72 Z';

const SIDE_LOCK =
  'M 290 240 C 278 262 270 292 268 326 C 264 368 258 404 244 436 C 236 454 226 468 214 480 ' +
  'C 240 478 258 460 268 438 C 280 410 282 372 284 340 C 286 306 292 276 304 250 Z ' +
  'M 286 236 C 262 270 252 320 250 372 C 248 410 244 440 232 466 L 214 480 C 228 440 232 400 236 360 C 240 310 254 268 286 236 Z';

/** Fine strands inside the hair mass (drawn in the skin colour). */
const STRANDS = [
  'M 250 92 C 196 112 152 170 140 250 C 132 312 128 372 104 440',
  'M 290 96 C 236 120 196 190 184 270 C 176 330 172 390 150 462',
  'M 214 104 C 164 132 128 196 122 262',
  'M 330 110 C 290 140 262 196 252 260',
  'M 232 300 C 230 360 222 420 196 470',
];

const SHEEN =
  'M 214 116 C 256 98 318 98 362 130 L 358 138 L 348 132 L 342 142 L 332 132 L 324 142 L 314 130 L 306 140 ' +
  'L 298 128 L 288 138 L 280 126 L 270 134 L 260 122 L 250 130 L 240 120 L 228 126 Z';

const BAND = 'M 304 74 C 292 108 284 156 281 200 C 279 222 278 238 279 250';

const NECK = 'M 350 384 C 346 412 346 440 350 470 L 250 478 C 256 448 258 418 254 380 Z';

const WINDOW = 'M 270 292 C 300 282 350 280 384 286 C 404 292 414 312 404 330 C 398 346 404 372 392 394 C 380 410 362 414 354 420 C 350 438 350 456 352 474 L 262 478 C 262 440 262 400 262 360 C 262 330 262 304 270 292 Z';

export function Portrait({pose, cutaway, labels, speaking, onDrag, onDragEnd}: Props) {
  const g = rig(pose);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<null | {kind: string; start: Pt; startPose: Pose}>(null);

  const toLocal = useCallback((e: React.PointerEvent): Pt => {
    const el = svg.current;
    const m = el?.getScreenCTM();
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
  const local = (pt: Pt) => rotate(pt, -g.jawDeg);
  const ll = local(g.lowerLip);
  const lc = local(g.corner);
  const ul = g.upperLip;
  const face = [
    'M 360 132 C 372 160 378 200 380 232',
    'C 381 244 378 252 373 262',
    'C 382 276 398 294 408 306',
    'C 412 311 410 318 403 320',
    'C 399 322 395 322 392 325',
    `C 393 330 ${f([ul[0] - 3, ul[1] - 5])} ${f(ul)}`,
    `C ${f([ul[0] - 4, ul[1] + 5])} ${f([g.corner[0] + 6, g.corner[1] - 1])} ${f(g.corner)}`,
    'L 300 350 L 290 240 Z',
  ].join(' ');
  const lowerFace = [
    `M 300 340 L ${f(lc)}`,
    `C ${f([lc[0] + 6, lc[1] + 3])} ${f([ll[0] - 4, ll[1] - 2])} ${f(ll)}`,
    `C ${f([ll[0] + 3, ll[1] + 5])} ${f([ll[0] - 5, ll[1] + 10])} 387 366`,
    'C 392 372 395 380 393 386 C 390 396 382 402 370 403',
    'C 346 404 312 394 286 372 C 276 362 270 330 266 300 Z',
  ].join(' ');
  const faceLine = face.slice(0, face.indexOf(' L 300 350'));
  const jawLine = [
    `M ${f(lc)}`,
    `C ${f([lc[0] + 6, lc[1] + 3])} ${f([ll[0] - 4, ll[1] - 2])} ${f(ll)}`,
    `C ${f([ll[0] + 3, ll[1] + 5])} ${f([ll[0] - 5, ll[1] + 10])} 387 366`,
    'C 392 372 395 380 393 386 C 390 396 382 402 370 403',
    'C 346 404 312 394 286 372',
  ].join(' ');
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
  const chin = rotate([384, 398], g.jawDeg);
  const mouthOpen = g.lipGap > 1;
  const airflow = pose.level > 0.02;

  return (
    <svg ref={svg} viewBox="36 52 470 470" className="hvl-portrait" onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      role="img" aria-label="Side-profile portrait whose jaw, lips, tongue and throat follow the synthesizer">
      <defs>
        <filter id="hvl-feather" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /></filter>
        <mask id="hvl-window" maskUnits="userSpaceOnUse" x="200" y="230" width="260" height="300">
          <path d={WINDOW} fill="white" filter="url(#hvl-feather)" />
        </mask>
        <clipPath id="hvl-skin">
          <path d={face} />
          <path d={lowerFace} transform={jaw} />
          <path d={NECK} />
        </clipPath>
        <radialGradient id="hvl-glow" cx="0.62" cy="0.5" r="0.62">
          <stop offset="0" stopColor="var(--hvl-accent)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--hvl-accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="300" cy="290" r="228" fill="url(#hvl-glow)" />
      <circle cx="300" cy="290" r="208" fill="none" stroke="var(--hvl-accent)" strokeOpacity="0.18" strokeWidth="1" />
      <circle cx="300" cy="290" r="208" fill="none" stroke="var(--hvl-accent)" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="1 7" />

      <path d={HAIR_BACK} fill={S.ink} />
      {STRANDS.map((d, i) => <path key={i} d={d} fill="none" stroke={S.skin} strokeWidth="1" opacity="0.22" />)}
      {/* Shoulders, neck and high collar */}
      <path d="M 70 530 C 92 500 160 486 246 484 L 356 480 C 420 486 462 506 480 530 Z" fill={S.ink} />
      <path d={NECK} fill={S.skin} />
      <g transform={jaw}><path d={lowerFace} fill={S.skin} /></g>
      <path d={face} fill={S.skin} />

      {/* Cutaway: stylised midsagittal view of the modelled articulators */}
      <g className={`hvl-cutaway ${cutaway ? 'is-on' : ''}`} aria-hidden={!cutaway}>
        <g mask="url(#hvl-window)">
          <g clipPath="url(#hvl-skin)">
            <rect x="250" y="250" width="180" height="240" fill={S.paper} />
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
            {airflow && (
              <g className={`hvl-air ${speaking ? 'is-fast' : ''}`} stroke={S.air} strokeWidth="1.5" fill="none" strokeLinecap="round">
                <path d="M 298 480 L 298 410" strokeDasharray="3 8" />
                <path d={`M 292 336 C 318 ${g.dorsum[1] - 7} 352 ${g.dorsum[1] - 5} ${ul[0] + 8} ${ul[1] + g.lipGap / 2 + 2}`} strokeDasharray="3 8" opacity={0.35 + 0.65 * clamp01(pose.lipOpen)} />
                {pose.velum > 0.2 && <path d="M 286 312 C 310 294 360 290 410 306" strokeDasharray="3 8" />}
              </g>
            )}
          </g>
        </g>
      </g>

      {/* Outlines over the cutaway */}
      <path d="M 350 384 C 346 412 346 440 350 470" fill="none" stroke={S.ink} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M 246 462 C 282 470 322 470 354 458 L 360 492 C 324 504 282 504 244 496 Z" fill={S.skin} stroke={S.ink} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M 248 480 C 284 487 322 486 356 476" fill="none" stroke={S.ink} strokeWidth="1.1" opacity="0.5" />
      <g transform={jaw}><path d={jawLine} fill="none" stroke={S.ink} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" /></g>
      <path d={faceLine} fill="none" stroke={S.ink} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M 393 314 C 396 318 401 319 404 317" fill="none" stroke={S.ink} strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />

      {mouthOpen && (
        <path d={`M ${f(g.corner)} C ${f([g.corner[0] + 7, ul[1] + 3])} ${f([ul[0] - 5, ul[1] + 2.5])} ${f([ul[0] - 1.5, ul[1] + 2.5])} L ${f([g.lowerLip[0] - 1.5, g.lowerLip[1] - 1])} C ${f([g.lowerLip[0] - 7, g.lowerLip[1] - 1])} ${f([g.corner[0] + 5, g.corner[1] + 2])} ${f(g.corner)} Z`} fill={S.ink} opacity={cutaway ? 0.55 : 1} />
      )}

      {/* Lip contours over everything */}
      <path d={`M 392 325 C 393 330 ${f([ul[0] - 3, ul[1] - 5])} ${f(ul)} C ${f([ul[0] - 4, ul[1] + 5])} ${f([g.corner[0] + 6, g.corner[1] - 1])} ${f(g.corner)}`} fill="none" stroke={S.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M ${f(g.corner)} C ${f([g.corner[0] + 6, g.corner[1] + 3])} ${f([g.lowerLip[0] - 4, g.lowerLip[1] - 2])} ${f(g.lowerLip)} C ${f([g.lowerLip[0] + 3, g.lowerLip[1] + 5])} ${f([g.lowerLip[0] - 5, g.lowerLip[1] + 10])} ${f(rotate([387, 366], g.jawDeg))}`} fill="none" stroke={S.ink} strokeWidth="2.4" strokeLinecap="round" />

      {/* Eye */}
      <g className="hvl-eye">
        <g className="hvl-blink">
        <path d="M 333 247 C 342 242 354 242 362 246 C 365 248 366 252 365 255" fill="none" stroke={S.ink} strokeWidth="4" strokeLinecap="round" />
        <path d="M 333 247 C 328 245 325 241 323 236 M 336 245 C 333 241 332 237 332 232 M 340 244 C 339 240 339 236 340 232" fill="none" stroke={S.ink} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M 349 248 C 344 253 344 266 350 273 C 355 276 360 270 362 263 C 363 257 361 251 358 248 Z" fill={S.ink} />
        <circle cx="356" cy="256" r="2.4" fill={S.skin} />
        <circle cx="351" cy="266" r="1.1" fill={S.skin} opacity="0.8" />
        </g>
        <path d="M 343 277 C 349 280 356 279 361 275" fill="none" stroke={S.ink} strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
      </g>

      {/* Front hair, sheen and headband */}
      <path d={SIDE_LOCK} fill={S.ink} />
      <path d={BANGS} fill={S.ink} />
      <path d={SHEEN} fill={S.skin} opacity="0.92" />
      <path d="M 298 244 C 292 222 282 200 266 180 M 346 238 C 344 214 338 190 328 170 M 374 232 C 374 210 370 188 362 168" fill="none" stroke={S.skin} strokeWidth="1" opacity="0.35" />
      <g className="hvl-headband">
        <path d={BAND} fill="none" stroke={S.ink} strokeWidth="16" strokeLinecap="butt" />
        <path d={BAND} fill="none" stroke={S.skin} strokeWidth="10.5" strokeLinecap="butt" />
        {/* Hooked clasp where the band tucks under the hair */}
        <path d="M 272 246 C 270 256 276 262 284 260 C 290 258 290 250 286 246 L 282 252 C 280 254 277 252 278 249 Z" fill={S.skin} stroke={S.ink} strokeWidth="1.8" strokeLinejoin="round" />
      </g>

      {onDrag && (
        <g className="hvl-handles">
          {cutaway && handle('tongue', tongueAt, 'Tongue body — drag to move front/back and up/down')}
          {cutaway && handle('tip', tipAt, 'Tongue tip — drag up to close, left to move back', 6)}
          {cutaway && handle('velum', g.uvula, 'Velum — drag down to open the nasal passage', 6)}
          {handle('lips', [ul[0] + 11, (ul[1] + g.lowerLip[1]) / 2], 'Lips — drag down to open, right to round', 7)}
          {handle('jaw', chin, 'Jaw — drag down to open', 8)}
        </g>
      )}
      {labels && (
        <g className="hvl-labels">
          {cutaway && <Label at={tongueAt} to={[218, 360]} text="tongue" />}
          {cutaway && <Label at={g.uvula} to={[218, 316]} text="velum" />}
          {cutaway && <Label at={[296, 456]} to={[218, 446]} text="vocal folds" />}
          {cutaway && <Label at={[340, 296]} to={[218, 276]} text="nasal tract" />}
          <Label at={[ul[0] + 3, ul[1] + 3]} to={[438, 340]} text="lips" anchor="start" />
          <Label at={chin} to={[430, 420]} text="jaw" anchor="start" />
        </g>
      )}
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
