/**
 * Project document: the voice, the held shape (Play), a phrase (Speak) and a
 * song (Sing). Shared by the desktop UI, the Node renderer and agent tools.
 */
import {defaultPatch, PARAM_NAMES, validatePatch, type Patch} from './params';
import {planSong, planSpeech, planSustain, type Note, type SongStyle} from './planner';
import {SIGNATURE, VOWEL_PRESETS} from './presets';
import type {Score} from './engine';
import type {Lexicon} from './text';
import {beatSong, newBeat, validateBeat, type Beat} from './beat';
import {duetNotes, duetVoice, newDuet, validateDuet, type Duet} from './duet';

export type Mode = 'play' | 'speak' | 'sing' | 'beat';

export interface Project {
  version: 2;
  name: string;
  mode: Mode;
  voice: Patch;
  shape: Patch;
  speech: {text: string; phonemes: boolean; rate: number; expression: number};
  song: {bpm: number; lyrics: string; notes: Note[]; loop: boolean; style: SongStyle; duet: Duet};
  /** Beatbox pattern (Beat mode). */
  beat: Beat;
  /** Seconds rendered for Play mode exports. */
  sustain: number;
}

export const LIMITS = {notes: 512, text: 1000, lyrics: 2000, seconds: 120, name: 120};

/** Original demonstration material. */
export const DEMO_PHRASE = 'Hello there! I shape every sound with my tongue, my lips and a little breath. Shall we sing?';
export const DEMO_LYRICS = 'Ev-ery qui-et sig-nal finds a way to sing, o-pen up the morn-ing light';
export const DEMO_NOTES: Note[] = [
  // An original 4/4 melody in C major (beats).
  [0, 0.5, 64], [0.5, 0.5, 67], [1, 0.5, 69], [1.5, 0.5, 67], [2, 1, 72], [3, 0.5, 71], [3.5, 0.5, 69],
  [4, 0.5, 67], [4.5, 0.5, 64], [5, 1, 62], [6, 2, 64],
  [8.5, 0.5, 60], [9, 0.5, 62], [9.5, 0.5, 64], [10, 1, 67], [11, 0.5, 69], [11.5, 0.5, 71], [12, 3, 72],
].map(([start, length, midi]) => ({start, length, midi}));

/**
 * An original novelty scat song for showing off the articulators: every line
 * works a different part of the mouth (tongue, lips, nose, jaw).
 */
const SILLY: Array<[string, number, number, number]> = [
  // [syllable, start beat, length beats, MIDI]
  ['doo', 0, 0.5, 67], ['bee', 0.5, 0.5, 69], ['doo', 1, 0.5, 67], ['bee', 1.5, 0.5, 64], ['wah', 2, 1, 72], ['-', 3, 1, 65],
  ['shoo', 4, 0.5, 60], ['bop', 4.5, 0.5, 64], ['shoo', 5, 0.5, 62], ['bop', 5.5, 0.5, 65], ['bah!', 6, 1.5, 67],
  ['my', 8, 0.5, 64], ['tongue', 8.5, 0.5, 65], ['goes', 9, 0.5, 67], ['la', 9.5, 0.5, 72], ['la', 10, 0.5, 74], ['la!', 10.5, 1, 76],
  ['my', 12, 0.5, 64], ['lips', 12.5, 0.5, 65], ['go', 13, 0.5, 67], ['boop', 13.5, 0.5, 60], ['boop', 14, 0.5, 60], ['boop!', 14.5, 1, 55],
  ['my', 16, 0.5, 64], ['nose', 16.5, 0.5, 65], ['goes', 17, 0.5, 67], ['hum', 17.5, 0.5, 71], ['hum!', 18, 1.5, 67],
  ['my', 20, 0.5, 64], ['jaw', 20.5, 0.5, 65], ['goes', 21, 0.5, 67], ['wah', 21.5, 0.5, 72], ['wah', 22, 0.5, 70], ['woo', 22.5, 1, 67], ['-', 23.5, 0.5, 60],
  ['bee', 24, 0.5, 72], ['bop', 24.5, 0.5, 67], ['bee', 25, 0.5, 74], ['boop', 25.5, 0.5, 67], ['hey!', 26, 0.75, 76], ['ho!', 27, 0.75, 64],
  ['yay', 28, 1.5, 72], ['-', 29.5, 2.5, 76],
];
export const SILLY_SONG: Project['song'] = {
  bpm: 132,
  lyrics: SILLY.map(s => s[0]).join(' '),
  notes: SILLY.map(([, start, length, midi]) => ({start, length, midi})),
  loop: false,
  style: 'cartoon',
  duet: newDuet(),
};

export function newProject(name = 'Untitled voice'): Project {
  return {
    version: 2,
    name,
    mode: 'play',
    voice: {...SIGNATURE},
    shape: {...VOWEL_PRESETS.find(v => v.id === 'aa')!.shape},
    speech: {text: DEMO_PHRASE, phonemes: false, rate: 1, expression: 0.6},
    song: {bpm: 96, lyrics: DEMO_LYRICS, notes: DEMO_NOTES.map(n => ({...n})), loop: false, style: 'natural', duet: newDuet()},
    beat: newBeat(),
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
  const allowed = new Set(['version', 'name', 'mode', 'voice', 'shape', 'speech', 'song', 'beat', 'sustain']);
  for (const k of Object.keys(p)) if (!allowed.has(k)) throw new TypeError(`Unknown project field "${k}"`);
  if (p.version !== undefined && p.version !== 2) throw new TypeError('Unsupported project version');
  const name = p.name ?? base.name;
  if (typeof name !== 'string' || name.length > LIMITS.name) throw new TypeError(`name must be text up to ${LIMITS.name} characters`);
  const mode = p.mode ?? base.mode;
  if (!['play', 'speak', 'sing', 'beat'].includes(mode)) throw new TypeError('mode must be play, speak, sing or beat');
  const speech = {...base.speech, ...(p.speech ?? {})};
  if (typeof speech.text !== 'string' || speech.text.length > LIMITS.text) throw new TypeError(`speech.text must be up to ${LIMITS.text} characters`);
  if (typeof speech.phonemes !== 'boolean') throw new TypeError('speech.phonemes must be true or false');
  num(speech.rate, 0.4, 2.5, 'speech.rate');
  num(speech.expression, 0, 1, 'speech.expression');
  const song = {...base.song, ...(p.song ?? {})};
  num(song.bpm, 30, 240, 'song.bpm');
  if (typeof song.lyrics !== 'string' || song.lyrics.length > LIMITS.lyrics) throw new TypeError(`song.lyrics must be up to ${LIMITS.lyrics} characters`);
  if (typeof song.loop !== 'boolean') throw new TypeError('song.loop must be true or false');
  if (!['natural', 'cartoon', 'yodel'].includes(song.style)) throw new TypeError('song.style must be natural, cartoon or yodel');
  if (!Array.isArray(song.notes) || song.notes.length > LIMITS.notes) throw new TypeError(`song.notes must be a list of at most ${LIMITS.notes}`);
  const checkNotes = (list: unknown): Note[] => {
    if (!Array.isArray(list) || list.length > LIMITS.notes) throw new TypeError(`song.notes must be a list of at most ${LIMITS.notes}`);
    return list.map((n: any, i: number) => {
      if (!n || typeof n !== 'object') throw new TypeError(`note ${i} must be an object`);
      return {start: num(n.start, 0, 1024, `note ${i} start`), length: num(n.length, 0.0625, 64, `note ${i} length`), midi: Math.round(num(n.midi, 36, 96, `note ${i} midi`))};
    });
  };
  const notes = checkNotes(song.notes);
  const duet = validateDuet(song.duet, checkNotes);
  const seconds = notes.reduce((m, n) => Math.max(m, ((n.start + n.length) * 60) / song.bpm), 0);
  if (seconds > LIMITS.seconds) throw new RangeError(`Song is longer than ${LIMITS.seconds} seconds`);
  return {
    version: 2,
    name,
    mode,
    voice: {...SIGNATURE, ...validatePatch(p.voice ?? base.voice, 'voice')},
    shape: {...validatePatch(p.shape ?? base.shape, 'shape')},
    speech,
    song: {bpm: song.bpm, lyrics: song.lyrics, loop: song.loop, style: song.style, notes, duet},
    beat: validateBeat(p.beat),
    sustain: num(p.sustain ?? base.sustain, 0.2, 30, 'sustain'),
  };
}

/** The duet's second singer (Sing mode), or null when there is none. */
export function duetScore(project: Project, lexicon: Lexicon): {score: Score; voice: Patch} | null {
  const duet = project.song.duet;
  const notes = duetNotes(project.song.notes, duet);
  if (!notes.length) return null;
  const voice = {...SIGNATURE, ...duetVoice(duet)};
  const plan = planSong(notes, duet.part === 'custom' && duet.lyrics ? duet.lyrics : project.song.lyrics, lexicon, {bpm: project.song.bpm, voice, style: project.song.style});
  return {score: plan.score, voice};
}

/** Build the engine score for the project's current mode. */
export function projectScore(project: Project, lexicon: Lexicon, mode: Mode = project.mode): {score: Score; warnings: string[]} {
  if (mode === 'speak') {
    const plan = planSpeech(project.speech.text, lexicon, {voice: project.voice, rate: project.speech.rate, expression: project.speech.expression, phonemes: project.speech.phonemes});
    return {score: plan.score, warnings: plan.warnings};
  }
  if (mode === 'sing') {
    const plan = planSong(project.song.notes, project.song.lyrics, lexicon, {bpm: project.song.bpm, voice: project.voice, style: project.song.style});
    return {score: plan.score, warnings: plan.warnings};
  }
  if (mode === 'beat') {
    const {notes, lyrics} = beatSong(project.beat);
    const plan = planSong(notes, lyrics, lexicon, {bpm: project.beat.bpm, voice: project.voice});
    return {score: plan.score, warnings: plan.warnings};
  }
  return {score: planSustain(project.shape, project.voice, project.sustain), warnings: []};
}

export function fullPatch(patch: Patch): Record<string, number> {
  const all = defaultPatch();
  for (const n of PARAM_NAMES) if (patch[n] !== undefined) all[n] = patch[n]!;
  return all;
}
