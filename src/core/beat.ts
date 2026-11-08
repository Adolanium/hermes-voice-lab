/**
 * Beatbox: one mouth, so one sound per step. A beat is a row of steps (16ths),
 * each a sound id or a rest; it is sung as a song of vowel-less syllables
 * (written as bracketed phonemes), through the same planner and engine.
 */
import type {Note} from './planner';

export interface BeatSound {
  id: string;
  label: string;
  /** Phonemes joined with "+", as in a lyric: [T+S]. */
  phones: string;
  /** Length in beats (a 16th is 0.25). */
  length: number;
  /** Pitch for the voiced ones (bass, hum). */
  midi: number;
  help: string;
}

export const BEAT_SOUNDS: readonly BeatSound[] = [
  {id: 'kick', label: 'Kick', phones: 'PE', length: 0.25, midi: 48, help: "p′, an ejective: the larynx is the piston"},
  {id: 'snare', label: 'Snare', phones: 'P+F', length: 0.25, midi: 48, help: 'pf: a lip burst into a hiss'},
  {id: 'hat', label: 'Hat', phones: 'T+S', length: 0.125, midi: 48, help: 'ts: a tip burst into a short hiss'},
  {id: 'open', label: 'Open hat', phones: 'T+S', length: 0.5, midi: 48, help: 'tss: the hiss held'},
  {id: 'click', label: 'Click', phones: 'CA', length: 0.25, midi: 48, help: 'ǃ, a click: the tongue pulls a vacuum'},
  {id: 'bass', label: 'Bass', phones: 'BR', length: 0.5, midi: 41, help: 'brr: a lip trill at a low pitch'},
  {id: 'hum', label: 'Hum', phones: 'M', length: 0.5, midi: 48, help: 'mm: a hummed note'},
];

export interface Beat {
  bpm: number;
  /** One entry per 16th: a sound id or '' for a rest (16 or 32 steps). */
  steps: string[];
  loop: boolean;
}

const pattern = (s: string) => s.trim().split(/\s+/).map(t => (t === '.' ? '' : t));

export const BEAT_PRESETS: Array<{id: string; name: string; steps: string[]}> = [
  {id: 'boots', name: 'Boots', steps: pattern('kick . hat . snare . hat . kick kick hat . snare . hat .')},
  {id: 'four', name: 'Four on the floor', steps: pattern('kick . hat . kick . hat . kick . hat . kick . open .')},
  {id: 'bounce', name: 'Bounce', steps: pattern('kick . . click snare . bass . . kick hat . snare . hum .')},
];

export function newBeat(): Beat {
  return {bpm: 92, steps: [...BEAT_PRESETS[0].steps], loop: true};
}

export function validateBeat(input: unknown): Beat {
  const base = newBeat();
  if (input === undefined) return base;
  if (!input || typeof input !== 'object') throw new TypeError('beat must be an object');
  const b = {...base, ...(input as Record<string, unknown>)};
  if (typeof b.bpm !== 'number' || !Number.isFinite(b.bpm) || b.bpm < 50 || b.bpm > 200) throw new RangeError('beat.bpm must be a number from 50 to 200');
  if (!Array.isArray(b.steps) || (b.steps.length !== 16 && b.steps.length !== 32)) throw new TypeError('beat.steps must be a list of 16 or 32 steps');
  const ids = new Set(BEAT_SOUNDS.map(s => s.id));
  const steps = b.steps.map((s, i) => {
    if (s === '' || s === null) return '';
    if (typeof s !== 'string' || !ids.has(s)) throw new TypeError(`beat step ${i} must be one of ${[...ids].join(', ')} or empty`);
    return s;
  });
  if (typeof b.loop !== 'boolean') throw new TypeError('beat.loop must be true or false');
  return {bpm: b.bpm, steps, loop: b.loop};
}

/** The beat as a song: one note per sounding step, its sound written as bracketed phonemes. */
export function beatSong(beat: Beat): {notes: Note[]; lyrics: string} {
  const notes: Note[] = [];
  const words: string[] = [];
  beat.steps.forEach((id, i) => {
    const sound = BEAT_SOUNDS.find(s => s.id === id);
    if (!sound) return;
    // A sound lasts its length, cut short by the next hit.
    let next = i + 1;
    while (next < beat.steps.length && !beat.steps[next]) next++;
    const room = (next - i) * 0.25;
    notes.push({start: i * 0.25, length: Math.max(0.0625, Math.min(sound.length, room) - 0.02), midi: sound.midi});
    words.push(`[${sound.phones}]`);
  });
  return {notes, lyrics: words.join(' ')};
}
