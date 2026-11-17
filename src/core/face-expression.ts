import {isVowel} from './phonemes';
import {SONG_LEAD, type Note, type Segment} from './planner';

export const EXPRESSIONS = ['earnest', 'dreamy', 'wry'] as const;
export type Expression = (typeof EXPRESSIONS)[number];
export const defaultExpression = (index: number): Expression => EXPRESSIONS[index % EXPRESSIONS.length];

interface FaceNote {
  start: number;
  attack: number;
  end: number;
  pitch: number;
  accent: number;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

/** Pitch is relative to the singer's own range. The planner labels segments by note
 * in score order. A melisma can share a vowel across several pitches. */
export function planFaceNotes(notes: Note[], segments: Segment[], bpm: number): FaceNote[] {
  if (!notes.length) return [];
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const pitches = sorted.map((n) => n.midi);
  const low = Math.min(...pitches),
    high = Math.max(...pitches);
  const beat = 60 / bpm;
  const onsets = new Map<number, Segment>(),
    vowels = new Map<number, Segment>();
  for (const s of segments) {
    if (s.word < 0 || s.end <= s.start) continue;
    if (!onsets.has(s.word)) onsets.set(s.word, s);
    if (isVowel(s.symbol) && !vowels.has(s.word)) vowels.set(s.word, s);
  }
  return sorted.map((n, i) => {
    const at = SONG_LEAD + n.start * beat;
    const onset = onsets.get(i),
      vowel = vowels.get(i);
    const previous = sorted[i - 1];
    const entrance = !previous || (n.start - previous.start - previous.length) * beat > 0.2;
    const leap = previous && !entrance ? Math.min(1, Math.abs(n.midi - previous.midi) / 7) : 0;
    return {
      start: Math.max(previous ? SONG_LEAD + previous.start * beat : 0, Math.min(at, onset?.start ?? at) - 0.05),
      attack: Math.max(at, vowel?.start ?? at),
      end: SONG_LEAD + (n.start + n.length) * beat,
      pitch: 0.5 + (n.midi - (high + low) / 2) / Math.max(8, high - low),
      accent: Math.min(1, 0.2 + (vowel?.stress ? 0.38 : 0) + 0.25 * Number(entrance) + 0.3 * leap),
    };
  });
}

export interface FacePose {
  /** Outer and inner brow lift and the amount by which one side leads (artwork pixels). */
  outer: number;
  inner: number;
  asymmetry: number;
  /** 0 is the original aperture, 1 is closed, a negative value opens the lids. */
  lid: number;
  lidAsymmetry: number;
  gazeX: number;
  gazeY: number;
}
const neutral: FacePose = {outer: 0, inner: 0, asymmetry: 0, lid: 0, lidAsymmetry: 0, gazeX: 0, gazeY: 0};

/** Use absolute song time for the stage, seeking and video excerpts. Adjacent
 * notes crossfade at the new attack; separated phrases settle to neutral. */
export function faceAt(notes: ReturnType<typeof planFaceNotes>, style: Expression, time: number): FacePose {
  let lo = 0,
    hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid].start <= time) lo = mid + 1;
    else hi = mid;
  }
  if (!lo) return neutral;
  const note = notes[lo - 1];
  const untilNext = (notes[lo]?.start ?? Infinity) - note.start;
  const riseTime = Math.min(Math.max(0.08, note.attack - note.start + 0.07), untilNext);
  const rise = ease((time - note.start) / Math.max(0.001, riseTime));
  let voice = 0,
    accent = 0,
    pitch = 0,
    hold = 0;
  function add(n: FaceNote, weight: number) {
    const w = weight * (1 - ease((time - n.end) / 0.23));
    const age = Math.max(0, Math.min(time, n.end) - n.attack);
    voice += w;
    accent += w * n.accent * (1 - 0.75 * ease(age / 0.32));
    pitch += w * n.pitch;
    hold += w * ease((age - 0.16) / 0.42);
  }
  if (lo > 1) add(notes[lo - 2], 1 - rise);
  add(note, rise);
  if (!voice) return neutral;
  if (style === 'dreamy')
    return {
      outer: 9 * voice + 8 * hold,
      inner: 11 * voice + 9 * pitch,
      asymmetry: 2 * accent,
      lid: 0.23 * voice + 0.62 * hold + 0.1 * pitch,
      lidAsymmetry: 0,
      gazeX: -6 * voice,
      gazeY: 5 * voice + 4 * hold,
    };
  if (style === 'wry') {
    const low = voice - pitch;
    return {
      outer: 4 * voice,
      inner: -7 * voice,
      asymmetry: 12 * voice + 13 * accent + 4 * low,
      lid: 0.12 * voice + 0.27 * accent + 0.15 * low,
      lidAsymmetry: 0.15 * voice,
      gazeX: 10 * voice + 4 * low,
      gazeY: -2 * accent,
    };
  }
  return {
    outer: -4 * voice + 12 * pitch,
    inner: 4 * voice + 18 * pitch + 12 * accent,
    asymmetry: 2 * accent,
    lid: 0.17 * voice - 0.31 * pitch - 0.19 * accent,
    lidAsymmetry: 0,
    gazeX: 0,
    gazeY: -7 * pitch - 2 * accent,
  };
}
