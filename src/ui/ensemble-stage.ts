import {avatarPalettes, drawNousAvatar} from './nous-avatar';
import {defaultExpression, faceAt} from '../core/face-expression';
import {glanceAt} from '../core/ensemble-gaze';
import {mouthAt} from '../core/visemes';
import {SONG_LEAD} from '../core/planner';
import {motionAt} from './beat-motion';
import {DESK_TOP, drawBooth, drawDesk} from './night-train-stage';
import {
  defaultMovement,
  defaultAvatarColor,
  POSE_SIZE,
  STAGE_FPS,
  type Ensemble,
  type EnsembleMix,
  type PlannedSinger,
} from '../core/ensemble';

export const STAGE_WIDTH = 1280,
  STAGE_HEIGHT = 720;
const paper = '#fff0d8';
type Ctx = CanvasRenderingContext2D;

function label(c: Ctx, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign, max: number) {
  c.fillStyle = color;
  c.textAlign = align;
  c.font = '600 ' + size + 'px system-ui, sans-serif';
  c.fillText(text, x, y, max);
}
function timecode(time: number) {
  const t = Math.floor(Math.max(0, time));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}
function header(c: Ctx, e: Ensemble, time: number) {
  const shade = c.createLinearGradient(0, 0, 0, 128);
  shade.addColorStop(0, 'rgba(8,14,20,.84)');
  shade.addColorStop(0.6, 'rgba(8,14,20,.46)');
  shade.addColorStop(1, 'rgba(8,14,20,0)');
  c.fillStyle = shade;
  c.fillRect(0, 0, STAGE_WIDTH, 128);
  c.save();
  c.shadowColor = '#0c1016';
  c.shadowBlur = 5;
  label(c, 'VOICE LAB  /  LIVE SESSIONS', 47, 35, 14, '#f5d3af', 'left', 430);
  c.fillStyle = paper;
  c.textAlign = 'left';
  c.font = 'italic 700 54px Georgia, serif';
  c.fillText(e.title.trim() || 'Untitled', 44, 88, 920);
  label(c, timecode(time), 1235, 48, 27, paper, 'right', 150);
  label(c, e.bpm + ' BPM', 1235, 74, 14, '#f5d3af', 'right', 150);
  c.restore();
}

export function drawEnsemble(
  canvas: HTMLCanvasElement,
  e: Ensemble,
  parts: PlannedSinger[],
  mix: EnsembleMix | null,
  time: number
) {
  const c = canvas.getContext('2d');
  if (!c) return;
  const w = STAGE_WIDTH,
    beat = ((time - SONG_LEAD) * e.bpm) / 60,
    frame = Math.floor(time * STAGE_FPS);
  const count = e.singers.length,
    lane = (w - 80) / count;
  const positions = e.singers.map((_, i) => 40 + lane * (i + 0.5));
  drawBooth(c, time);
  e.singers.forEach((s, i) => {
    const part = parts[i],
      pose = mix?.poses[i],
      idx = frame * POSE_SIZE;
    const sounding = !!mix && !s.muted && s.level > 0;
    const avatar = s.avatarColor ?? defaultAvatarColor(i);
    const mouth = mouthAt(sounding ? (part?.visemes ?? []) : [], time, pose?.[idx], pose?.[idx + 1], pose?.[idx + 2]);
    const motion = motionAt(sounding ? (s.movement ?? defaultMovement(i)) : 'still', beat, s.notes);
    const face = faceAt(sounding ? (part?.faceNotes ?? []) : [], s.expression ?? defaultExpression(i), time);
    const look = glanceAt(sounding ? (part?.glances ?? []) : [], i, time);
    // Direct the iris toward the listening partner, then meet the lens for
    // the first syllable of an answer before the singer's own style resumes.
    const engaged = Math.max(Math.abs(look.eyes), look.camera);
    const eyes = {
      ...face,
      gazeX: face.gazeX * (1 - engaged) + look.eyes * 34,
      gazeY: face.gazeY * (1 - engaged),
      lid: face.lid * (1 - 0.85 * look.camera) - 0.07 * Math.abs(look.eyes),
      inner: face.inner + 7 * Math.abs(look.eyes),
    };
    const width = (count === 1 ? 470 : count === 2 ? 442 : 414) - (i === 1 ? 12 : 0);
    c.save();
    c.globalAlpha = s.muted ? 0.64 : 1;
    drawNousAvatar(c, avatar, i, positions[i], time, mouth, motion, eyes, look.head, width, DESK_TOP + 26);
    c.restore();
  });
  drawDesk(c, time);
  header(c, e, time);
  e.singers.forEach((s, i) => {
    const x = positions[i],
      width = Math.min(340, lane - 44);
    const left = x - width / 2,
      right = x + width / 2;
    const color = avatarPalettes[s.avatarColor ?? defaultAvatarColor(i)].accent;
    const pose = mix?.poses[i],
      cues = parts[i]?.cues ?? [];
    const cue = cues.find((q) => q.start <= time && q.end > time);
    const word =
      cue?.text === '·' ? [...cues.slice(0, cues.indexOf(cue))].reverse().find((q) => q.text !== '·')?.text : cue?.text;
    label(c, s.name, left, DESK_TOP + 27, 17, color, 'left', width * 0.48);
    // Preserve the live pitch trace in the desk strip beside each singer's name.
    if (pose) {
      c.beginPath();
      let pen = false;
      for (let j = 0; j < 70; j++) {
        const k = (frame - 69 + j) * POSE_SIZE,
          f = pose[k + 4];
        if (!f || pose[k + 3] < 0.002) {
          pen = false;
          continue;
        }
        const px = right - width * 0.43 * (1 - j / 69),
          py = DESK_TOP + 28 - Math.max(0, Math.min(1, Math.log2(f / 80) / 3.25)) * 19;
        if (pen) c.lineTo(px, py);
        else c.moveTo(px, py);
        pen = true;
      }
      c.strokeStyle = color;
      c.lineWidth = 1.8;
      c.stroke();
    }
    c.fillStyle = color;
    c.globalAlpha = 0.62;
    c.fillRect(left, DESK_TOP + 37, width, 1);
    c.globalAlpha = 1;
    label(c, s.muted ? 'Muted' : word || ' ', x, DESK_TOP + 87, 39, paper, 'center', width);
  });
  const duration = mix ? mix.left.length / mix.rate : Math.max(1, ...parts.map((p) => p.score.length + 0.6));
  c.fillStyle = '#696469';
  c.fillRect(47, 690, w - 94, 2);
  c.fillStyle = paper;
  c.fillRect(47, 689, (w - 94) * Math.min(1, time / duration), 3);
}
