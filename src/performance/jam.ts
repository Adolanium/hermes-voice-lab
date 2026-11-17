/**
 * Jam with Hermes: the user plays a phrase on the keys, Voice Lab writes it down as a melody
 * and sends it to the conversation, and the agent answers with a phrase of its own for her to sing.
 */
import type {Note} from '../core/planner';
import {isVowel, type Phone} from '../core/phonemes';
import {noteName} from '../core/params';

/** Silence after the last key that ends a phrase, in seconds. */
export const PHRASE_GAP = 1.4;
/** Rhythm grid of a written phrase, in beats (a sixteenth note). */
export const GRID = 0.25;
export const MAX_NOTES = 24;
export const MAX_BEATS = 16;
/** Limits on an answer, matching the jam tool. */
export const ANSWER_NOTES = 32;
export const ANSWER_BEATS = 32;

export interface Phrase {notes: Note[]; words: string[]; lyrics?: string; bpm: number}
export interface JamAnswer {turnId?: string; notes: Note[]; lyrics: string; bpm: number}

/** One played syllable, including its original spelling for a complete word. */
export interface CapturedLyric {token: string; first: boolean; last: boolean; phones: Phone[]}
interface Segment {midi: number; on: number; off: number | null; text?: string; lyric?: CapturedLyric}

function writtenLyrics(segments: Segment[]): string {
  if (!segments.some(s => s.text)) return '';
  const tokens: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const {lyric, text} = segments[i];
    if (!lyric) { tokens.push(text || '-'); continue; }
    let end = i;
    while (!segments[end].lyric?.last && end + 1 < segments.length && segments[end + 1].lyric?.token === lyric.token && !segments[end + 1].lyric?.first) end++;
    if (lyric.first && segments[end].lyric?.last) {
      tokens.push(lyric.token);
      i = end;
    } else {
      // A take may start or end inside a word. Keep the syllable that was actually sung.
      const phones = lyric.phones.map(p => p.symbol + (isVowel(p.symbol) ? p.stress : '') +
        (p.aspirated === undefined ? '' : p.aspirated ? '^' : '=') + (p.nasalized ? '~' : '') + (p.breathy ? '%' : '') + (p.unreleased ? '-' : ''));
      tokens.push(phones.length ? '[' + phones.join('+') + ']' : '-');
    }
  }
  return tokens.join(' ');
}

/**
 * Records what the user played as the monophonic line the voice actually sang: the newest held key
 * sounds, and releasing it returns to a key still held (as the performance controller does).
 */
export class PhraseRecorder {
  private segments: Segment[] = [];
  private stack: Array<{source: string; midi: number; text?: string; lyric?: CapturedLyric}> = [];


  get holding() { return this.stack.length > 0; }
  get empty() { return this.segments.length === 0; }

  noteOn(source: string, midi: number, t: number) {
    this.stack = this.stack.filter(h => h.source !== source);
    this.stack.push({source, midi});
    this.sound(midi, t);
  }

  noteOff(source: string, t: number) {
    const top = this.stack.at(-1);
    this.stack = this.stack.filter(h => h.source !== source);
    if (top?.source !== source) return;
    const next = this.stack.at(-1);
    if (next) {
      this.sound(next.midi, t);
      if (next.text) this.sang(next.text, next.lyric);
    }
    else this.close(t);
  }

  /** The lyric syllable sung on the newest note, when the keys sing lyrics. */
  sang(text: string, lyric?: CapturedLyric) {
    const last = this.segments.at(-1);
    if (!text || !last) return;
    last.text = text;
    last.lyric = lyric;
    const held = this.stack.at(-1);
    if (held) Object.assign(held, {text, lyric});
  }

  /** Release everything (blur, Stop) without losing the notes. */
  releaseAll(t: number) {
    this.stack = [];
    this.close(t);
  }

  clear() {
    this.segments = [];
    this.stack = [];
  }

  /** The phrase so far, written on the grid at `bpm`, then cleared. Null when nothing was played. */
  take(bpm: number, now: number): Phrase | null {
    this.close(now);
    const notes = quantize(this.segments, bpm);
    const kept = this.segments.slice(0, notes.length);
    const phrase = notes.length ? {notes, words: kept.flatMap(s => s.text ? [s.text] : []), lyrics: writtenLyrics(kept), bpm} : null;
    this.clear();
    return phrase;
  }

  private sound(midi: number, t: number) {
    const last = this.segments.at(-1);
    if (last && last.off === null && last.midi === midi) return;
    this.close(t);
    this.segments.push({midi, on: t, off: null});
  }

  private close(t: number) {
    const last = this.segments.at(-1);
    if (last && last.off === null) last.off = Math.max(last.on, t);
  }
}

const snap = (beats: number) => Math.round(beats / GRID) * GRID;

/** Seconds → beats on the grid, keeping notes in order, at least one step long and inside the limits. */
export function quantize(segments: Array<{midi: number; on: number; off: number | null}>, bpm: number): Note[] {
  if (!segments.length) return [];
  const beat = 60 / bpm;
  const t0 = segments[0].on;
  const notes: Note[] = [];
  for (const s of segments) {
    let start = snap((s.on - t0) / beat);
    const prev = notes.at(-1);
    if (prev && start <= prev.start) start = prev.start + GRID;
    if (prev && prev.start + prev.length > start) prev.length = start - prev.start;
    const end = snap(((s.off ?? s.on) - t0) / beat);
    const length = Math.max(GRID, end - start);
    if (start >= MAX_BEATS || notes.length >= MAX_NOTES) break;
    notes.push({start, length: Math.min(length, MAX_BEATS - start), midi: Math.round(s.midi)});
  }
  return notes;
}

const beats = (n: number) => String(+n.toFixed(3));

/** Notes as the NOTE:BEATS tokens the agent's tools read, with rests in the gaps. */
export function melodyText(notes: Note[]): string {
  const out: string[] = [];
  let cursor = 0;
  for (const n of notes) {
    if (n.start > cursor + 1e-6) out.push(`r:${beats(n.start - cursor)}`);
    out.push(`${noteName(n.midi)}:${beats(n.length)}`);
    cursor = n.start + n.length;
  }
  return out.join(' ');
}

/** The chat message that hands the phrase to the agent. */
export function jamMessage(phrase: Phrase, turnId?: string): string {
  const sung = phrase.words.length ? `, singing “${phrase.words.join(' ')}”` : '';
  return `🎹 Jam · I played ${melodyText(phrase.notes)} at ${Math.round(phrase.bpm)} bpm${sung}. Your turn.${turnId ? ` turn_id=${turnId}` : ''}`;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A jam event's answer, checked; null when it is malformed or empty. */
export function readAnswer(payload: unknown): JamAnswer | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as {notes?: unknown; lyrics?: unknown; bpm?: unknown; turn_id?: unknown};
  if (!Array.isArray(p.notes)) return null;
  const notes: Note[] = [];
  for (const n of p.notes.slice(0, ANSWER_NOTES)) {
    const {start, length, midi} = (n ?? {}) as Record<string, unknown>;
    if (!finite(start) || !finite(length) || !finite(midi)) return null;
    if (start < 0 || start >= ANSWER_BEATS || length <= 0) continue;
    notes.push({start, length: Math.min(length, ANSWER_BEATS - start), midi: Math.min(96, Math.max(36, Math.round(midi)))});
  }
  if (!notes.length) return null;
  const bpm = finite(p.bpm) ? Math.min(240, Math.max(30, p.bpm)) : 96;
  if (p.turn_id !== undefined && (typeof p.turn_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(p.turn_id))) return null;
  return {...(typeof p.turn_id === 'string' ? {turnId: p.turn_id} : {}), notes, lyrics: typeof p.lyrics === 'string' ? p.lyrics.slice(0, 400) : '', bpm};
}
