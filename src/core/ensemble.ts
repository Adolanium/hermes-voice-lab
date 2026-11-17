import {Engine, STATE, type Score} from './engine';
import {PARAM_ID, noteName, parseNoteName} from './params';
import {lyricSyllables, planSong, type Note, type LyricCue} from './planner';
import {defaultExpression, EXPRESSIONS, planFaceNotes, type Expression} from './face-expression';
import {planGlances, type Glance} from './ensemble-gaze';
import {planVisemes, type VisemeKey} from './visemes';
import {VOICE_PRESETS} from './presets';
import type {Lexicon} from './text';

export const AVATAR_COLORS = ['original', 'rose', 'jade', 'violet'] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];
export const defaultAvatarColor = (index: number): AvatarColor => AVATAR_COLORS[index % AVATAR_COLORS.length];

export const MOVEMENTS = ['nod', 'sway', 'bounce', 'still'] as const;
export type Movement = (typeof MOVEMENTS)[number];
export const defaultMovement = (index: number): Movement => MOVEMENTS[index % 3];

export interface Singer {
  avatarColor?: AvatarColor;
  movement?: Movement;
  expression?: Expression;
  name: string;
  voice: string;
  lyrics: string;
  notes: Note[];
  level: number;
  pan: number;
  muted: boolean;
}
export interface Ensemble {
  title: string;
  bpm: number;
  singers: Singer[];
  excerpt?: {start: number; end: number};
}

export function readMelody(text: string): Note[] {
  let start = 0;
  const notes: Note[] = [];
  for (const token of text.trim().split(/\s+/).filter(Boolean)) {
    const match = /^([^:]+):(\d*\.?\d+)$/.exec(token);
    if (!match) throw new Error('Use pitch:beats or r:beats. Check “' + token + '”.');
    const length = Number(match[2]);
    const rest = /^r$/i.test(match[1]);
    const midi = parseNoteName(match[1]);
    if (!(length > 0) || (!rest && (length < 0.0625 || length > 64 || midi === null || midi < 36 || midi > 96)))
      throw new Error('Invalid pitch or duration in “' + token + '”. Use C2 through C7.');
    if (!rest) notes.push({start, length, midi: midi!});
    start += length;
  }
  return notes;
}

export function writeMelody(notes: Note[]): string {
  const result: string[] = [];
  let at = 0;
  const beats = (n: number) => Number(n.toFixed(6));
  for (const note of notes) {
    if (note.start - at > 0.000001) result.push('r:' + beats(note.start - at));
    result.push(noteName(note.midi) + ':' + beats(note.length));
    at = note.start + note.length;
  }
  return result.join(' ');
}

/** Original sixteen-bar arrangement in E minor. Each part has its own rests and phrasing. */
export function nightWire(): Ensemble {
  const melody = (s: string) => readMelody(s);
  const verse = 'B3:0.5 E4:1 G4:0.5 F#4:1 E4:1 r:0.5 D4:0.5 E4:1 B3:2';
  const hook = 'G4:1 B4:1 A4:0.5 G4:0.5 E4:1 D4:1 G4:1 F#4:1 E4:1';
  const reply = 'r:2 B4:0.5 A4:0.5 G4:1 r:1 E5:0.5 D5:0.5 B4:2';
  const bass = 'E3:1 r:0.5 B2:0.5 E3:1 G3:1 C3:1.5 G2:0.5 D3:1 B2:1';
  const lead = melody(['r:8', verse, verse, hook, hook, 'r:8', hook, 'B4:1 A4:1 G4:1 F#4:1 E4:4'].join(' '));
  const high = melody([reply, 'r:8', reply, reply, 'D5:2 B4:1 A4:1 B4:2 G4:2', reply, reply, 'D5:2 B4:2 G4:4'].join(' '));
  const low = melody([bass, bass, bass, bass, bass, bass, bass, 'C3:2 D3:2 E3:4'].join(' '));
  return {
    title: 'Night Wire',
    bpm: 116,
    singers: [
      {
        name: 'Lead',
        avatarColor: 'original',
        movement: 'nod',
        expression: 'earnest',
        voice: 'tenor',
        notes: lead,
        lyrics:
          'Down by the tracks the rails hum low One red light blinks then lets us go Send my voice out through the dark night sky Свет го-ри́т и но́чь по-ёт для нас Send my voice out through the dark night sky Sing it back to me',
        level: 0.96,
        pan: 0,
        muted: false,
      },
      {
        name: 'Echo',
        avatarColor: 'rose',
        movement: 'sway',
        expression: 'dreamy',
        voice: 'bright',
        notes: high,
        lyrics: high.map((_, i) => (i % 6 === 5 ? 'loo' : 'la')).join(' '),
        level: 0.52,
        pan: 0.58,
        muted: false,
      },
      {
        name: 'Bass',
        avatarColor: 'jade',
        movement: 'bounce',
        expression: 'wry',
        voice: 'baritone',
        notes: low,
        lyrics: low.map((_, i) => ['doom', 'mm', 'dum', 'oo'][i % 4]).join(' '),
        level: 0.7,
        pan: -0.35,
        muted: false,
      },
    ],
  };
}

export function validateEnsemble(input: unknown, checkNotes: (value: unknown) => Note[]): Ensemble {
  const e = input as Ensemble;
  if (!e || typeof e.title !== 'string' || !e.title.trim() || e.title.length > 120)
    throw new Error('Give the arrangement a title of 1–120 characters.');
  if (!Number.isFinite(e.bpm) || e.bpm < 30 || e.bpm > 240) throw new Error('Tempo must be 30–240 BPM.');
  if (!Array.isArray(e.singers) || e.singers.length < 1 || e.singers.length > 3) throw new Error('Choose one to three singers.');
  const singers = e.singers.map((s, i) => {
    if (!s || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 40 || !VOICE_PRESETS.some((v) => v.id === s.voice))
      throw new Error('Each singer needs a name and a voice preset.');
    if (typeof s.lyrics !== 'string' || s.lyrics.length > 8000 || typeof s.muted !== 'boolean')
      throw new Error('Invalid lyrics or mute setting.');
    if (!Number.isFinite(s.level) || s.level < 0 || s.level > 1 || !Number.isFinite(s.pan) || Math.abs(s.pan) > 1)
      throw new Error('Invalid singer mix.');
    const notes = checkNotes(s.notes).sort((a, b) => a.start - b.start);
    if (
      notes.some(
        (n, i) => n.start + n.length > e.bpm * 6 || (i > 0 && n.start < notes[i - 1].start + notes[i - 1].length - 0.000001)
      )
    )
      throw new Error('Each part must fit six minutes and play one note at a time.');
    const avatarColor = s.avatarColor === undefined ? defaultAvatarColor(i) : s.avatarColor;
    if (!AVATAR_COLORS.includes(avatarColor)) throw new Error('Unknown Nous Girl avatar color.');
    const movement = s.movement === undefined ? defaultMovement(i) : s.movement;
    if (!MOVEMENTS.includes(movement)) throw new Error('Unknown singer movement.');
    const expression = s.expression === undefined ? defaultExpression(i) : s.expression;
    if (!EXPRESSIONS.includes(expression)) throw new Error('Unknown singer expression.');
    return {name: s.name, voice: s.voice, avatarColor, movement, expression, lyrics: s.lyrics, level: s.level, pan: s.pan, muted: s.muted, notes};
  });
  let excerpt: Ensemble['excerpt'];
  if (e.excerpt !== undefined) {
    const {start, end} = e.excerpt ?? {};
    const lastBeat = Math.max(0, ...singers.flatMap((s) => s.notes.map((n) => n.start + n.length)));
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start ||
      end > 362 ||
      start >= (lastBeat * 60) / e.bpm + 0.65
    )
      throw new Error('Choose an excerpt that starts inside the arrangement and ends after it starts.');
    excerpt = {start, end};
  }
  return {title: e.title, bpm: e.bpm, singers, ...(excerpt ? {excerpt} : {})};
}

export const STAGE_FPS = 25;
export interface PlannedSinger {
  score: Score;
  cues: LyricCue[];
  visemes: VisemeKey[];
  faceNotes: ReturnType<typeof planFaceNotes>;
  glances: Glance[];
  level: number;
  pan: number;
  muted: boolean;
}
export function planEnsemble(e: Ensemble, lexicon: Lexicon): PlannedSinger[] {
  const parts = e.singers.map((s) => {
    const voice = VOICE_PRESETS.find((v) => v.id === s.voice)!.voice;
    const text = s.lyrics.trim() || '[UW]';
    const vamp = !/\s/.test(text) && lyricSyllables(text, lexicon).length === 1;
    const lyrics = vamp ? s.notes.map(() => text).join(' ') : text;
    const {score, cues, segments} = planSong(s.notes, lyrics, lexicon, {bpm: e.bpm, voice});
    return {score, cues, visemes: planVisemes(segments), faceNotes: planFaceNotes(s.notes, segments, e.bpm), level: s.level, pan: s.pan, muted: s.muted || !s.notes.length};
  });
  const glances = planGlances(parts, e.bpm);
  return parts.map((part, index) => ({...part, glances: glances[index]}));
}

// One pose per video frame: jaw opening, lip opening, rounding, level and fundamental.
export const POSE_SIZE = 5;
export interface EnsembleMix {
  left: Float32Array;
  right: Float32Array;
  poses: Float32Array[];
  rate: number;
  resets: number;
}

export function renderEnsemble(module: WebAssembly.Module, parts: PlannedSinger[], rate: number, seed = 1): EnsembleMix {
  const frames = Math.ceil((Math.max(...parts.map((p) => p.score.length)) + 0.6) * rate);
  const left = new Float32Array(frames),
    right = new Float32Array(frames);
  const poses: Float32Array[] = [];
  let resets = 0;
  for (const [i, part] of parts.entries()) {
    const pose = new Float32Array(Math.ceil((frames / rate) * STAGE_FPS) * POSE_SIZE);
    poses.push(pose);
    if (part.muted || part.level === 0) continue;
    const engine = new Engine(module, rate, seed + i);
    // Long arrangements can exceed a WASM instance's staging buffer. The planner
    // sorts events by time. Refill on whole-second boundaries without resetting
    // the oscillators, articulators or delay lines.
    const score = part.score;
    const paged = score.events.length / 4 > engine.scoreCapacity;
    let event = 0;
    if (!paged) {
      engine.loadScore(score);
      engine.play();
    }
    const pan = ((part.pan + 1) * Math.PI) / 4;
    const l = part.level * Math.cos(pan),
      r = part.level * Math.sin(pan);
    const end = Math.ceil((part.score.length + 0.6) * rate);
    let at = 0;
    for (let f = 0; at < end; f++) {
      if (paged && f % STAGE_FPS === 0) {
        const second = f / STAGE_FPS,
          start = event;
        while (event < score.events.length && Math.round(score.events[event] * rate) < (second + 1) * rate) event += 4;
        const events = score.events.slice(start, event);
        for (let j = 0; j < events.length; j += 4) events[j] = Math.max(0, Math.round(events[j] * rate) / rate - second);
        if (events.length / 4 > engine.scoreCapacity) throw new Error('Too many simultaneous vocal gestures.');
        engine.loadScore({events, length: Math.max(0.001, score.length - second)});
        engine.play();
      }
      const next = Math.min(end, Math.round(((f + 1) * rate) / STAGE_FPS));
      let power = 0;
      const start = at;
      while (at < next) {
        const [a, b] = engine.render(Math.min(4096, next - at));
        for (let j = 0; j < a.length; j++) {
          left[at + j] += a[j] * l;
          right[at + j] += b[j] * r;
          power += a[j] * a[j];
        }
        at += a.length;
      }
      const p = engine.params(),
        state = engine.state();
      pose.set(
        [p[PARAM_ID.jaw], p[PARAM_ID.lipOpen], p[PARAM_ID.lipRound], Math.sqrt(power / (at - start)), state[STATE.f0]],
        f * POSE_SIZE
      );
    }
    resets += engine.state()[STATE.resets];
  }
  let peak = 0;
  for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  if (peak > 0.94)
    for (let i = 0; i < frames; i++) {
      left[i] *= 0.94 / peak;
      right[i] *= 0.94 / peak;
    }
  return {left, right, poses, rate, resets};
}

export function clipSamples(mix: EnsembleMix, excerpt?: Ensemble['excerpt']) {
  const start = excerpt ? Math.min(mix.left.length, Math.round(excerpt.start * mix.rate)) : 0;
  const end = excerpt ? Math.min(mix.left.length, Math.round(excerpt.end * mix.rate)) : mix.left.length;
  return {start, end};
}
