/**
 * A show: spoken lines and sung numbers strung together into one score, with
 * one set of word cues (for floating words and the karaoke line). Each item
 * is planned on its own and placed after the previous one.
 */
import {compileScore, type Score, type ScoreEvent} from './engine';
import {PARAM_NAMES, type Patch} from './params';
import {isVowel} from './phonemes';
import {planSong, planSpeech, type LyricCue, type Note, type SongStyle} from './planner';
import type {Lexicon} from './text';

export type ShowItem =
  | {kind: 'say'; text: string; rate?: number; expression?: number; voice?: Patch; pause?: number}
  | {kind: 'sing'; bpm: number; lyrics: string; notes: Note[]; style?: SongStyle; voice?: Patch; pause?: number};

export interface ShowSection {
  kind: 'say' | 'sing';
  start: number;
  end: number;
  /** Seconds per beat for a sung section (0 for speech). */
  beat: number;
}

export interface ShowPlan {
  score: Score;
  cues: LyricCue[];
  sections: ShowSection[];
  length: number;
}

export function planShow(items: ShowItem[], lexicon: Lexicon, voice: Patch): ShowPlan {
  const events: ScoreEvent[] = [];
  const cues: LyricCue[] = [];
  const sections: ShowSection[] = [];
  let t0 = 0;
  for (const item of items) {
    const v = {...voice, ...(item.voice ?? {})};
    let score: Score;
    let local: LyricCue[] = [];
    let beat = 0;
    if (item.kind === 'say') {
      const plan = planSpeech(item.text, lexicon, {voice: v, rate: item.rate ?? 1, expression: item.expression ?? 0.8});
      score = plan.score;
      // One cue per word: consonant onset, first vowel, end.
      const byWord = new Map<number, {start: number; vowel: number; end: number}>();
      for (const s of plan.segments) {
        if (s.symbol === 'SIL' || s.word < 0) continue;
        const w = byWord.get(s.word) ?? {start: s.start, vowel: Infinity, end: s.end};
        w.start = Math.min(w.start, s.start);
        w.end = Math.max(w.end, s.end);
        if (isVowel(s.symbol)) w.vowel = Math.min(w.vowel, s.start);
        byWord.set(s.word, w);
      }
      local = [...byWord.entries()].map(([k, w]) => {
        const word = plan.words[k];
        const text = word.text + (word.boundary === 'question' ? '?' : word.boundary === 'exclaim' ? '!' : word.boundary === 'period' ? '.' : word.boundary === 'comma' ? ',' : '');
        return {text, start: w.start, vowel: Number.isFinite(w.vowel) ? w.vowel : w.start, end: w.end, midi: 0};
      });
    } else {
      const plan = planSong(item.notes, item.lyrics, lexicon, {bpm: item.bpm, voice: v, style: item.style ?? 'cartoon'});
      score = plan.score;
      local = plan.cues;
      beat = 60 / item.bpm;
    }
    for (let i = 0; i < score.events.length; i += 4) {
      events.push([score.events[i] + t0, PARAM_NAMES[score.events[i + 1]], score.events[i + 2], score.events[i + 3]]);
    }
    for (const c of local) cues.push({...c, start: c.start + t0, vowel: c.vowel + t0, end: c.end + t0});
    sections.push({kind: item.kind, start: t0, end: t0 + score.length, beat});
    t0 += score.length + (item.pause ?? 0.15);
  }
  return {score: compileScore(events, t0), cues, sections, length: t0};
}

/**
 * "Boop Bop, Live!": an original lounge set for the portrait. She greets the
 * room, scats, sings about her own mouth, brags about her physics, drops a
 * beatbox break and closes on a gag.
 */
const SWING = 2 / 3;
const n = (start: number, length: number, midi: number): Note => ({start, length, midi});
export const LOUNGE_SET: ShowItem[] = [
  {kind: 'say', text: 'Hello, hello! Is this thing on?', rate: 0.95, expression: 1, pause: 0.35},
  {kind: 'say', text: "I'm just a tube, with a tongue. Hit it!", rate: 0.82, expression: 1, pause: 0.1},
  {
    kind: 'sing', bpm: 150, lyrics: 'doo bee doo bee doo wah - shoo bop shoo bop bah!',
    notes: [n(0, 0.35, 67), n(SWING, 0.3, 70), n(1, 0.35, 67), n(1 + SWING, 0.3, 70), n(2, 0.35, 72), n(2 + SWING, 0.9, 74), n(3 + SWING, 0.3, 69),
      n(4, 0.35, 65), n(4 + SWING, 0.3, 67), n(5, 0.35, 65), n(5 + SWING, 0.3, 67), n(6, 1.4, 50)],
  },
  {
    // The verse is slower and straight, with the body part held: the words must land.
    kind: 'sing', bpm: 132, lyrics: 'my tongue goes la la la! my lips go boop boop boop! my nose goes hmm hmm! my jaw goes wah wah wah!',
    notes: [n(0, 0.45, 64), n(0.5, 0.9, 67), n(1.5, 0.45, 65), n(2, 0.4, 72), n(2.5, 0.4, 74), n(3, 0.9, 76),
      n(4, 0.45, 64), n(4.5, 0.9, 67), n(5.5, 0.45, 65), n(6, 0.4, 60), n(6.5, 0.4, 55), n(7, 0.9, 50),
      n(8, 0.45, 64), n(8.5, 0.9, 67), n(9.5, 0.45, 65), n(10, 0.8, 71), n(11, 0.9, 67),
      n(12, 0.45, 64), n(12.5, 0.9, 67), n(13.5, 0.45, 65), n(14, 0.4, 72), n(14.5, 0.4, 70), n(15, 1.4, 67)],
    pause: 0.3,
  },
  {kind: 'say', text: 'No samples. No auto tune. Just physics!', rate: 0.9, expression: 1, pause: 0.25},
  {
    kind: 'sing', bpm: 150, lyrics: 'boom tss kh tss boom boom tss kh tss boom tk pff!',
    notes: [n(0, 0.3, 45), n(0.5, 0.2, 60), n(1, 0.2, 60), n(1.5, 0.2, 60), n(2, 0.3, 45), n(2.5, 0.3, 45), n(3, 0.2, 60), n(3.5, 0.2, 60),
      n(4, 0.2, 60), n(4.5, 0.3, 45), n(5, 0.2, 60), n(5.5, 0.4, 60)],
    pause: 0.2,
  },
  {
    kind: 'sing', bpm: 150, lyrics: 'bee bop bee boop hey! ho! hey! ho! yay - -',
    notes: [n(0, 0.35, 72), n(SWING, 0.3, 67), n(1, 0.35, 74), n(1 + SWING, 0.3, 67), n(2, 0.6, 76), n(3, 0.6, 55), n(4, 0.6, 76), n(5, 0.6, 50),
      n(6, 1.5, 72), n(7.5, 1, 76), n(8.5, 1.5, 79)],
    pause: 0.45,
  },
  {kind: 'say', text: 'Thank you! Thank you! Tip your physicist!', rate: 0.8, expression: 1},
];
