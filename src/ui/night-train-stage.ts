import boothArtwork from './art/night-train-booth.webp';
import {loadNousAvatar} from './nous-avatar';

let booth: HTMLImageElement | undefined;
let loading: Promise<[void, void]> | undefined;
const W = 1280,
  H = 720;
export const DESK_TOP = 572;

export function loadStage() {
  return (loading ??= Promise.all([
    loadNousAvatar(),
    (async () => {
      const image = new Image();
      image.src = boothArtwork;
      await image.decode();
      booth = image;
    })(),
  ]).catch(() => {
    loading = undefined;
    throw new Error('Could not load the studio artwork. Reopen Clip Studio to retry.');
  }));
}

let glass: Path2D | undefined;
function windows() {
  if (!glass) {
    glass = new Path2D();
    glass.roundRect(141, 194, 201, 275, 23);
    glass.roundRect(367, 192, 546, 276, 24);
    glass.roundRect(941, 193, 195, 274, 22);
  }
  return glass;
}

/** Rain lives on the glass behind the singers. Its film time is seekable, just
 * like the music, including when an excerpt starts halfway through a shower. */
export function drawBooth(c: CanvasRenderingContext2D, time: number) {
  c.fillStyle = '#172d32';
  c.fillRect(0, 0, W, H);
  if (!booth) return;
  c.drawImage(booth, 0, 0, W, H);
  c.save();
  c.clip(windows());
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(219,233,225,.31)';
  c.beginPath();
  for (let i = 0; i < 102; i++) {
    const y = 160 + ((i * 89 + time * (38 + ((i * 19) % 87))) % 345);
    const x = 110 + ((i * 233) % 1050) + 2 * Math.sin(i + y / 50);
    const length = 4 + ((i * 7) % 14);
    c.moveTo(x, y);
    c.lineTo(x - 1.8, y + length);
  }
  c.stroke();
  c.restore();
}

export function drawDesk(c: CanvasRenderingContext2D, time: number) {
  if (booth) {
    const top = (DESK_TOP / H) * booth.naturalHeight;
    c.drawImage(booth, 0, top, booth.naturalWidth, booth.naturalHeight - top, 0, DESK_TOP, W, H - DESK_TOP);
    // A passing light reflected over the varnish below the window line.
    const x = ((time * 52 + 280) % (W + 560)) - 280;
    const reflection = c.createLinearGradient(x - 120, 0, x + 120, 0);
    reflection.addColorStop(0, 'rgba(245,135,86,0)');
    reflection.addColorStop(0.5, 'rgba(245,135,86,.11)');
    reflection.addColorStop(1, 'rgba(245,135,86,0)');
    c.fillStyle = reflection;
    c.fillRect(0, DESK_TOP, W, 96);
  }
  const shade = c.createLinearGradient(0, DESK_TOP, 0, H);
  shade.addColorStop(0, 'rgba(16,11,15,.45)');
  shade.addColorStop(0.48, 'rgba(14,13,19,.73)');
  shade.addColorStop(1, 'rgba(10,15,19,.80)');
  c.fillStyle = shade;
  c.fillRect(0, DESK_TOP, W, H - DESK_TOP);
}
