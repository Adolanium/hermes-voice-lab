/**
 * Project document: the voice, the held shape (Play), a phrase (Speak) and a
 * song (Sing). Shared by the desktop UI, the Node renderer and agent tools.
 */
import {defaultPatch, PARAM_NAMES, validatePatch, type Patch} from './params';
import {planSong, planSpeech, planSustain, type Note} from './planner';
import {SIGNATURE, VOWEL_PRESETS} from './presets';
import type {Score} from './engine';
import type {Lexicon} from './text';

export type Mode = 'play' | 'speak' | 'sing';

export interface Project {
  version: 2;
  name: string;
  mode: Mode;
  voice: Patch;
  shape: Patch;
  speech: {text: string; phonemes: boolean; rate: number; expression: number};
  song: {bpm: number; lyrics: string; notes: Note[]; loop: boolean};
  /** Seconds rendered for Play mode exports. */
  sustain: number;
}

export const LIMITS = {notes: 512, text: 1000, lyrics: 2000, seconds: 120, name: 120};

/** Original demonstration material. */
export const DEMO_PHRASE = 'Hello! I am a voice made of air, a few tubes, and a little bit of math. Shall we sing?';
export const DEMO_LYRICS = 'Ev-ery qui-et sig-nal finds a way to sing, o-pen up the morn-ing light';
export const DEMO_NOTES: Note[] = [
  // An original 4/4 melody in C major (beats).
  [0, 0.5, 64], [0.5, 0.5, 67], [1, 0.5, 69], [1.5, 0.5, 67], [2, 1, 72], [3, 0.5, 71], [3.5, 0.5, 69],
  [4, 0.5, 67], [4.5, 0.5, 64], [5, 1, 62], [6, 2, 64],
  [8.5, 0.5, 60], [9, 0.5, 62], [9.5, 0.5, 64], [10, 1, 67], [11, 0.5, 69], [11.5, 0.5, 71], [12, 3, 72],
].map(([start, length, midi]) => ({start, length, midi}));

export function newProject(name = 'Untitled voice'): Project {
  return {
    version: 2,
    name,
    mode: 'play',
    voice: {...SIGNATURE},
    shape: {...VOWEL_PRESETS.find(v => v.id === 'aa')!.shape},
    speech: {text: DEMO_PHRASE, phonemes: false, rate: 1, expression: 0.6},
    song: {bpm: 96, lyrics: DEMO_LYRICS, notes: DEMO_NOTES.map(n => ({...n})), loop: false},
    sustain: 2,
  };
}

const num = (v: unknown, lo: number, hi: number, label: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new RangeError(`${label} must be a number from ${lo} to ${hi}`);
  return v;
};

/** Validate and normalise untrusted input (agent tools, imports, storage). */
export function validateProject(input: unknown): Project {
  if (!input || typeof input !== 'object') throw new TypeError('Project must be an object');
  const p = input as Record<string, any>;
  const base = newProject();
  const allowed = new Set(['version', 'name', 'mode', 'voice', 'shape', 'speech', 'song', 'sustain']);
  for (const k of Object.keys(p)) if (!allowed.has(k)) throw new TypeError(`Unknown project field "${k}"`);
  if (p.version !== undefined && p.version !== 2) throw new TypeError('Unsupported project version');
  const name = p.name ?? base.name;
  if (typeof name !== 'string' || name.length > LIMITS.name) throw new TypeError(`name must be text up to ${LIMITS.name} characters`);
  const mode = p.mode ?? base.mode;
  if (!['play', 'speak', 'sing'].includes(mode)) throw new TypeError('mode must be play, speak or sing');
  const speech = {...base.speech, ...(p.speech ?? {})};
  if (typeof speech.text !== 'string' || speech.text.length > LIMITS.text) throw new TypeError(`speech.text must be up to ${LIMITS.text} characters`);
  if (typeof speech.phonemes !== 'boolean') throw new TypeError('speech.phonemes must be true or false');
  num(speech.rate, 0.4, 2.5, 'speech.rate');
  num(speech.expression, 0, 1, 'speech.expression');
  const song = {...base.song, ...(p.song ?? {})};
  num(song.bpm, 30, 240, 'song.bpm');
  if (typeof song.lyrics !== 'string' || song.lyrics.length > LIMITS.lyrics) throw new TypeError(`song.lyrics must be up to ${LIMITS.lyrics} characters`);
  if (typeof song.loop !== 'boolean') throw new TypeError('song.loop must be true or false');
  if (!Array.isArray(song.notes) || song.notes.length > LIMITS.notes) throw new TypeError(`song.notes must be a list of at most ${LIMITS.notes}`);
  const notes: Note[] = song.notes.map((n: any, i: number) => {
    if (!n || typeof n !== 'object') throw new TypeError(`note ${i} must be an object`);
    return {start: num(n.start, 0, 1024, `note ${i} start`), length: num(n.length, 0.0625, 64, `note ${i} length`), midi: Math.round(num(n.midi, 36, 96, `note ${i} midi`))};
  });
  const seconds = notes.reduce((m, n) => Math.max(m, ((n.start + n.length) * 60) / song.bpm), 0);
  if (seconds > LIMITS.seconds) throw new RangeError(`Song is longer than ${LIMITS.seconds} seconds`);
  return {
    version: 2,
    name,
    mode,
    voice: {...SIGNATURE, ...validatePatch(p.voice ?? base.voice, 'voice')},
    shape: {...validatePatch(p.shape ?? base.shape, 'shape')},
    speech,
    song: {...song, notes},
    sustain: num(p.sustain ?? base.sustain, 0.2, 30, 'sustain'),
  };
}

/** Build the engine score for the project's current mode. */
export function projectScore(project: Project, lexicon: Lexicon, mode: Mode = project.mode): {score: Score; warnings: string[]} {
  if (mode === 'speak') {
    const plan = planSpeech(project.speech.text, lexicon, {voice: project.voice, rate: project.speech.rate, expression: project.speech.expression, phonemes: project.speech.phonemes});
    return {score: plan.score, warnings: plan.warnings};
  }
  if (mode === 'sing') {
    const plan = planSong(project.song.notes, project.song.lyrics, lexicon, {bpm: project.song.bpm, voice: project.voice});
    return {score: plan.score, warnings: plan.warnings};
  }
  return {score: planSustain(project.shape, project.voice, project.sustain), warnings: []};
}

export function fullPatch(patch: Patch): Record<string, number> {
  const all = defaultPatch();
  for (const n of PARAM_NAMES) if (patch[n] !== undefined) all[n] = patch[n]!;
  return all;
}
