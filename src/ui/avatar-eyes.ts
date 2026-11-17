import type {FacePose} from '../core/face-expression';

type Context = CanvasRenderingContext2D;
type Artwork = HTMLCanvasElement | HTMLImageElement;
const size = 1254;
// All coordinates describe the left eye, from the temple toward the nose. The
// right side gets its own copy of the original ink, reflected into this space.
const x = 390,
  y = 402,
  width = 190,
  height = 188;
const hinge = 569;
const lidMask =
  'M391 526 L396 515 L405 509 L411 501 L419 500 L425 496 L429 495 L435 492 L440 492 L445 489 L451 485 L467 482 L481 485 L493 484 L501 483 L515 487 L524 490 L537 496 L548 502 L557 510 L566 525 L575 545 L576 565 Q557 559 550 565 Q537 588 494 589 Q447 588 433 567 L423 565 L421 556 L408 554 L413 543 L397 540 L390 534Z';
const opening = 'M434 535 Q464 511 496 511 Q530 507 567 555 Q543 545 521 569 Q471 585 434 535Z';
const shutLash =
  'M395 532 Q405 536 418 535 L410 526 Q431 543 445 546 Q501 569 562 542 Q534 567 493 563 Q445 561 420 545 Q405 542 395 532Z';
const clamp = (n: number) => Math.min(1, Math.max(0, n));

function surface(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function eyeLayers(image: Artwork, mirrored: boolean) {
  const patch = surface(width, height);
  const ctx = patch.getContext('2d')!;
  ctx.translate(-x, -y);
  if (mirrored) {
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(image, 0, 0, size, size);
  const paint = (c: Context) => c.drawImage(patch, x, y);
  const skin = ctx.getImageData(457 - x, 544 - y, 1, 1).data;
  const skinColor = 'rgb(' + Array.from(skin.slice(0, 3)).join(',') + ')';
  const ink = ctx.getImageData(502 - x, 546 - y, 1, 1).data;
  const inkColor = 'rgb(' + Array.from(ink.slice(0, 3)).join(',') + ')';
  const mask = new Path2D(lidMask),
    aperture = new Path2D(opening);
  const lashes = surface(width, height);
  const lash = lashes.getContext('2d')!;
  lash.translate(-x, -y);
  lash.clip(mask);
  paint(lash);
  // Lift the iris out of the lash drawing. The drawing and its glints can
  // now look around under a lid even while that lid is almost shut.
  lash.fillStyle = skinColor;
  lash.fill(aperture);
  const iris = surface(width, height);
  const pupil = iris.getContext('2d')!;
  pupil.translate(-x, -y);
  pupil.beginPath();
  pupil.ellipse(504, 531, 33, 38, 0, 0, 2 * Math.PI);
  pupil.clip();
  pupil.fillStyle = inkColor;
  pupil.fillRect(x, y, width, height);
  pupil.clip(aperture);
  paint(pupil);
  return {
    patch,
    lashes,
    iris,
    mask,
    aperture,
    skinColor,
    inkColor,
    shut: new Path2D(shutLash),
    brow: surface(width, 85),
    browKey: '',
  };
}
type Layers = ReturnType<typeof eyeLayers>;
const cached = new WeakMap<Artwork, Layers[]>();

/** Deform a narrow band of the illustration. Its edges stay anchored above
 * the eyes and in the fringe, so the brow still passes behind each lock. */
function drawBrow(c: Context, layers: Layers, outer: number, inner: number) {
  outer = Math.round(outer);
  inner = Math.round(inner);
  if (!outer && !inner) return;
  const key = outer + '/' + inner;
  if (layers.browKey !== key) {
    const b = layers.brow.getContext('2d')!;
    const h = layers.brow.height;
    b.clearRect(0, 0, width, h);
    for (let col = 0; col < width; col += 3) {
      const u = col / width;
      const fade = clamp(col / 21) * clamp((width - col) / 25);
      const base = 52 + 17 * u * u;
      const at = Math.max(5, Math.min(h - 4, base - fade * (outer + (inner - outer) * u)));
      const w = Math.min(3, width - col);
      b.drawImage(layers.patch, col, 0, w, base, col, 0, w, at);
      b.drawImage(layers.patch, col, base, w, h - base, col, at, w, h - at);
    }
    layers.browKey = key;
  }
  c.drawImage(layers.brow, x, y);
}

function drawLid(c: Context, a: Layers, closure: number, gazeX: number, gazeY: number) {
  if (Math.abs(closure) < 0.003 && Math.abs(gazeX) + Math.abs(gazeY) < 0.15) return;
  const scale = Math.max(0.045, 1 - closure);
  c.fillStyle = a.skinColor;
  c.fill(a.mask);
  const shut = clamp((closure - 0.75) / 0.17);
  c.save();
  c.globalAlpha *= 1 - shut;
  c.translate(0, hinge * (1 - scale));
  c.scale(1, scale);
  c.drawImage(a.lashes, x, y);
  c.clip(a.aperture);
  // Undo the lid transform after clipping: a closing lid covers the iris.
  c.scale(1, 1 / scale);
  c.translate(0, -hinge * (1 - scale));
  c.drawImage(a.iris, x + gazeX, y + gazeY);
  c.restore();
  if (shut > 0) {
    c.save();
    c.globalAlpha *= shut;
    c.fillStyle = a.inkColor;
    c.translate(0, 13);
    c.fill(a.shut);
    c.restore();
  }
}

export function drawEyes(c: Context, image: Artwork, pose: FacePose, time: number, singer: number) {
  const phase = (time + [1.26, 0.51, 2.12][singer]) % (3.82 + singer * 0.47);
  const blink = phase >= 0.21 || time === 0 ? 0 : phase < 0.07 ? phase / 0.07 : phase < 0.095 ? 1 : (0.21 - phase) / 0.115;
  if (!blink && !pose.outer && !pose.inner && !pose.asymmetry && !pose.lid && !pose.gazeX && !pose.gazeY) return;
  let layers = cached.get(image);
  if (!layers) {
    layers = [eyeLayers(image, false), eyeLayers(image, true)];
    cached.set(image, layers);
  }
  for (const [i, a] of layers.entries()) {
    const sign = i === 0 ? 1 : -1;
    c.save();
    if (i) {
      c.translate(size, 0);
      c.scale(-1, 1);
    }
    const offset = sign * pose.asymmetry;
    drawBrow(c, a, pose.outer + offset, pose.inner + 0.8 * offset);
    const lid = pose.lid - sign * pose.lidAsymmetry;
    drawLid(c, a, lid + (1 - lid) * blink, sign * pose.gazeX, pose.gazeY);
    c.restore();
  }
}
