import type {Note, SongStyle} from './planner';
import {validatePatch, type Patch} from './params';
import {validateDirections, type WordDirection} from './direction';

export interface TakePart {
  notes: Note[];
  lyrics: string;
  bpm: number;
  voice: Patch;
  style: SongStyle;
  /** Mouth shape for a phrase played on keys without lyrics. */
  shape?: Patch;
  directions?: WordDirection[];
}

export interface JamTake {id: string; call: TakePart; reply: TakePart}
export type PartName = 'call' | 'reply';
export const MAX_TAKES = 12;

export function validateTakes(raw: unknown, checkNotes: (list: unknown) => Note[]): JamTake[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_TAKES) throw new TypeError('Expected up to 12 jam takes');
  const ids = new Set<string>();
  const part = (p: TakePart) => {
    if (!p || !Number.isFinite(p.bpm) || p.bpm < 30 || p.bpm > 240 || typeof p.lyrics !== 'string' || p.lyrics.length > 8000 ||
        !['natural', 'cartoon', 'yodel'].includes(p.style)) throw new TypeError('Invalid jam take part');
    const notes = checkNotes(p.notes);
    if (notes.some(n => (n.start + n.length) * 60 / p.bpm > 360)) throw new RangeError('Take part exceeds six minutes');
    const directions = validateDirections(p.directions);
    return {notes, lyrics: p.lyrics, bpm: p.bpm, style: p.style, voice: validatePatch(p.voice),
      ...(p.shape ? {shape: validatePatch(p.shape)} : {}), ...(directions.length ? {directions} : {})};
  };
  return raw.map(t => {
    if (!t || typeof t.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(t.id) || ids.has(t.id)) throw new TypeError('Invalid or duplicate jam take ID');
    ids.add(t.id);
    const call = part(t.call), reply = part(t.reply);
    const length = (side: TakePart) => side.notes.reduce((end, n) => Math.max(end, n.start + n.length), 0) * 60 / side.bpm;
    if (call.notes.length + reply.notes.length > 2048 || length(call) + length(reply) > 360) throw new RangeError('A take can contain up to 2,048 notes and six minutes of music');
    return {id: t.id, call, reply};
  });
}
