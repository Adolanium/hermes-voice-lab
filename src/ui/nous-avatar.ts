import frontalArtwork from './art/nous-girl-front.webp';
import type {AvatarColor} from '../core/ensemble';
import {drawEyes} from './avatar-eyes';
import type {FacePose} from '../core/face-expression';
import type {MouthPose} from '../core/visemes';
import type {motionAt} from './beat-motion';

export const avatarPalettes = {
  original: {accent: '#c9b7fd', light: '#ebe4fc', hair: '#292631', shadow: '#171622'},
  rose: {accent: '#ff9eaa', light: '#ffdbd4', hair: '#b9486a', shadow: '#4b203b'},
  jade: {accent: '#81dace', light: '#cbebe0', hair: '#317e7c', shadow: '#173b48'},
  violet: {accent: '#c5a0ff', light: '#e5d8ff', hair: '#8055b2', shadow: '#3c2859'},
} as const satisfies Record<AvatarColor, Record<'accent' | 'light' | 'hair' | 'shadow', string>>;

// Landmarks are in the original illustration's coordinate system.
const SIZE = 1254;
const mouthX = 628,
  mouthY = 745;
let portrait: HTMLImageElement | undefined;
let loading: Promise<void> | undefined;
const tinted = new Map<AvatarColor, HTMLCanvasElement>();

export function loadNousAvatar() {
  return (loading ??= (async () => {
    const image = new Image();
    image.src = frontalArtwork;
    try {
      await image.decode();
      portrait = image;
    } catch {
      loading = undefined;
      throw new Error('Could not load the Nous Girl portrait. Reopen Clip Studio to retry.');
    }
  })());
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function sprite(color: AvatarColor) {
  if (!portrait) return;
  const cached = tinted.get(color);
  if (cached) return cached;
  const surface = document.createElement('canvas');
  surface.width = portrait.naturalWidth;
  surface.height = portrait.naturalHeight;
  const c = surface.getContext('2d')!;
  c.drawImage(portrait, 0, 0);
  if (color !== 'original') {
    const pixels = c.getImageData(0, 0, surface.width, surface.height);
    const hair = rgb(avatarPalettes[color].hair),
      shadow = rgb(avatarPalettes[color].shadow);
    for (let y = 0; y < surface.height; y++) {
      const depth = clamp((y / surface.height - 0.08) / 0.9);
      const ink = hair.map((v, k) => v * (1 - depth) + shadow[k] * depth);
      for (let x = 0; x < surface.width; x++) {
        const i = 4 * (y * surface.width + x);
        if (!pixels.data[i + 3]) continue;
        const luminance = (pixels.data[i] + 2 * pixels.data[i + 1] + pixels.data[i + 2]) / 4;
        const weight = clamp((210 - luminance) / 175);
        // Preserve the original eye detail and contrast around the two irises.
        const ex = (Math.abs(x / surface.width - 0.5) - 0.099) / 0.06;
        const ey = (y / surface.height - 0.429) / 0.04;
        const eye = 1 - 0.7 * clamp(1 - ex * ex - ey * ey);
        for (let k = 0; k < 3; k++) pixels.data[i + k] += (ink[k] - 29) * weight * eye;
      }
    }
    c.putImageData(pixels, 0, 0);
  }
  // Bake the warm overhead practical and cooler window light into the same
  // cutout used by the eye layers. Transparent edges stay transparent.
  c.globalCompositeOperation = 'source-atop';
  const lamp = c.createLinearGradient(0, 0, surface.width * 0.72, surface.height);
  lamp.addColorStop(0, 'rgba(255,181,106,.32)');
  lamp.addColorStop(0.44, 'rgba(242,178,125,.10)');
  lamp.addColorStop(0.67, 'rgba(68,92,100,.08)');
  lamp.addColorStop(1, 'rgba(13,29,51,.38)');
  c.fillStyle = lamp;
  c.fillRect(0, 0, surface.width, surface.height);
  tinted.set(color, surface);
  return surface;
}

function drawFace(c: CanvasRenderingContext2D, image: HTMLCanvasElement | HTMLImageElement, drop: number) {
  if (drop < 0.2) {
    c.drawImage(image, 0, 0, SIZE, SIZE);
    return;
  }
  const sourceScale = ('naturalWidth' in image ? image.naturalWidth : image.width) / SIZE;
  // Stretch the lower face from the nose to the chin, then shorten the neck by
  // the same distance. A pixel of overlap keeps the seams closed at stage scale.
  const strip = (top: number, bottom: number, y: number, end: number) =>
    c.drawImage(image, 0, top * sourceScale, SIZE * sourceScale, (bottom - top) * sourceScale, 0, y, SIZE, end - y);
  strip(0, 675, 0, 675);
  strip(674, 903, 674, 903 + drop);
  strip(902, 1080, 902 + drop, 1080);
  strip(1079, SIZE, 1079, SIZE);
}

function sing(c: CanvasRenderingContext2D, p: MouthPose, drop: number) {
  const width = 52 + 38 * p.spread - 20 * p.round;
  const height = 85 * p.open;
  const upper = 1 + height * (0.22 + 0.1 * p.round);
  const lower = 1 + height * (0.78 - 0.1 * p.round);
  const lip = 6 + 5 * p.round;
  // The corners pull up on a spread vowel. A rounded one has nearly vertical
  // sides. On F/V the lower lip rolls under the incisors, slightly off-centre.
  const corner = -3 * p.spread + 1.5 * p.round;
  const side = 0.57 + 0.41 * p.round;
  const floor = lower * (1 - 0.47 * p.bite);
  c.save();
  c.translate(mouthX, mouthY + drop * 0.3);
  c.scale(width, 1);

  const inside = new Path2D();
  inside.moveTo(-1, corner);
  inside.bezierCurveTo(-side, -upper, -0.31, -upper, 0, -0.84 * upper);
  inside.bezierCurveTo(0.3, -upper, side, -0.98 * upper, 1, corner);
  inside.bezierCurveTo(side, floor, -0.62 - 0.31 * p.round, floor + 3 * p.bite, -1, corner);
  inside.closePath();

  // Paint a complete lip silhouette first. Its inner edge is the opening above.
  c.beginPath();
  c.moveTo(-1, corner);
  c.bezierCurveTo(-side, -upper - 2, -0.34, -upper - lip - 3, -0.17, -upper - lip);
  c.quadraticCurveTo(0, -upper - lip * 0.42, 0.17, -upper - lip);
  c.bezierCurveTo(0.35, -upper - lip - 2, side, -upper - 2, 1, corner);
  c.bezierCurveTo(side, floor + 1.6 * lip, -side, floor + 1.6 * lip, -1, corner);
  const blush = c.createLinearGradient(0, -upper - lip, 0, floor + lip);
  blush.addColorStop(0, '#ae696e');
  blush.addColorStop(1, '#e6a698');
  c.fillStyle = blush;
  c.fill();
  c.fillStyle = '#482337';
  c.fill(inside);
  if (height > 1) {
    c.save();
    c.clip(inside);
    const roof = -upper * 0.84;
    const incisor = roof + 2 + 14 * p.teeth + 13 * p.bite;
    // Lower teeth show through a narrow hiss; the lower lip covers them on F/V.
    const lowerTeeth = p.teeth * (1 - p.bite) * clamp(1 - height / 32);
    if (lowerTeeth > 0) {
      c.fillStyle = '#e7c9bd';
      c.beginPath();
      c.moveTo(-0.8, floor * 0.77);
      c.quadraticCurveTo(0, floor * 0.83 - 12 * lowerTeeth, 0.8, floor * 0.77);
      c.lineTo(0.8, floor + 8);
      c.lineTo(-0.8, floor + 8);
      c.fill();
    }
    // The tongue tip rises behind the upper teeth on L/T/D/N.
    c.fillStyle = '#cd8191';
    c.beginPath();
    c.ellipse(
      -0.025,
      floor * 0.9 + 5 - height * 0.62 * p.tip,
      0.65 - 0.25 * p.tip,
      Math.max(2, height * (0.19 + 0.12 * p.tip)),
      0,
      0,
      Math.PI * 2
    );
    c.fill();
    c.fillStyle = '#fff4e8';
    c.beginPath();
    c.moveTo(-0.87, -upper - 1);
    c.lineTo(0.87, -upper - 1);
    c.lineTo(0.76, incisor - 5);
    c.quadraticCurveTo(0.12, incisor + 2, -0.76, incisor - 4);
    c.fill();
    c.restore();
    // Interdental TH/DH brings the tip past the teeth and over the lower lip.
    const protrusion = clamp((p.tip - 0.75) / 0.25);
    if (protrusion > 0) {
      c.fillStyle = '#d38991';
      c.beginPath();
      c.moveTo(-0.36 * protrusion, incisor - 1);
      c.quadraticCurveTo(0, incisor - 5, 0.37 * protrusion, incisor);
      c.bezierCurveTo(
        0.35 * protrusion,
        floor + 9 * protrusion,
        -0.31 * protrusion,
        floor + 12 * protrusion,
        -0.36 * protrusion,
        incisor - 1
      );
      c.fill();
    }
  }
  c.restore();
}

export function drawNousAvatar(
  c: CanvasRenderingContext2D,
  color: AvatarColor,
  index: number,
  x: number,
  time: number,
  mouth: MouthPose,
  motion: ReturnType<typeof motionAt>,
  face: FacePose,
  turn: number,
  width: number,
  bottom: number
) {
  const art = sprite(color);
  if (!art) return;
  // The three busts share one desk. Keep the collar as the pivot when a
  // listener leans in; the iris turns further than the head.
  const scale = width / SIZE;
  c.save();
  c.translate(x + motion.x + 8 * turn, bottom - 165 * scale + motion.y);
  c.rotate(motion.tilt + 0.068 * turn);
  c.scale(scale * (1 - 0.035 * Math.abs(turn)), scale * motion.stretch);
  c.translate(-SIZE / 2, -(SIZE - 165));
  const drop = 32 * mouth.open;
  drawFace(c, art, drop);
  drawEyes(c, art, face, time, index);
  sing(c, mouth, drop);
  c.restore();
}
