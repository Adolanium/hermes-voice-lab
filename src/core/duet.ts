/**
 * Duet: a second singer with their own body and voice sings a second part, from
 * the same engine (a second instance). The part is written out, or derived from
 * the melody: an octave below, a fifth below, or a third above in the song's key.
 */
import type {Note} from './planner';
import {VOICE_PRESETS} from './presets';

export type DuetPart = 'off' | 'octaveBelow' | 'fifthBelow' | 'thirdAbove' | 'custom';
export const DUET_PARTS: Array<[DuetPart, string]> = [['off', 'Off'], ['octaveBelow', 'Octave below'], ['fifthBelow', 'Fifth below'], ['thirdAbove', 'Third above'], ['custom', 'Written part']];

export interface Duet {
  part: DuetPart;
  /** A voice preset id for the second singer. */
  voice: string;
  /** The written part (part = 'custom'); lyrics default to the song's. */
  notes: Note[];
  lyrics: string;
}

export function newDuet(): Duet {
  return {part: 'off', voice: 'baritone', notes: [], lyrics: ''};
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** The second part's notes. A song's key is guessed from its last note (songs end on the tonic). */
export function duetNotes(melody: Note[], duet: Duet): Note[] {
  if (duet.part === 'off') return [];
  if (duet.part === 'custom') return duet.notes;
  const sorted = [...melody].sort((a, b) => a.start - b.start);
  const tonic = sorted.length ? ((sorted[sorted.length - 1].midi % 12) + 12) % 12 : 0;
  const shift = (m: number) => {
    if (duet.part === 'octaveBelow') return m - 12;
    if (duet.part === 'fifthBelow') return m - 7;
    // A diatonic third above: two steps up the major scale of the key.
    const degree = MAJOR.indexOf((((m - tonic) % 12) + 12) % 12);
    if (degree < 0) return m + 4;
    const up = MAJOR[(degree + 2) % 7] + (degree + 2 >= 7 ? 12 : 0) - MAJOR[degree];
    return m + up;
  };
  return melody.map(n => ({...n, midi: Math.min(96, Math.max(36, shift(n.midi)))}));
}

export function duetVoice(duet: Duet) {
  return (VOICE_PRESETS.find(v => v.id === duet.voice) ?? VOICE_PRESETS.find(v => v.id === 'baritone')!).voice;
}

export function validateDuet(input: unknown, validateNotes: (notes: unknown) => Note[]): Duet {
  const base = newDuet();
  if (input === undefined) return base;
  if (!input || typeof input !== 'object') throw new TypeError('song.duet must be an object');
  const d = {...base, ...(input as Record<string, unknown>)};
  if (!DUET_PARTS.some(([id]) => id === d.part)) throw new TypeError(`song.duet.part must be one of ${DUET_PARTS.map(p => p[0]).join(', ')}`);
  if (typeof d.voice !== 'string' || !VOICE_PRESETS.some(v => v.id === d.voice)) throw new TypeError(`song.duet.voice must be a voice preset id (${VOICE_PRESETS.map(v => v.id).join(', ')})`);
  if (typeof d.lyrics !== 'string' || d.lyrics.length > 2000) throw new TypeError('song.duet.lyrics must be text up to 2000 characters');
  return {part: d.part as DuetPart, voice: d.voice, notes: validateNotes(d.notes), lyrics: d.lyrics};
}
