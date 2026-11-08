/**
 * Gesture planner. Turns timed phone segments into engine score events on
 * independent articulator tiers:
 *   - tongue body, jaw, throat, rhotic: vowel-to-vowel trajectory with
 *     consonants that need the tongue body superimposed (after Öhman 1966);
 *   - tongue tip, lips, dorsum, velum, glottis: local consonant gestures.
 * The engine's critically damped articulator dynamics turn these step
 * targets into smooth movements, identically in live and offline playback.
 */
import {compileScore, type Score, type ScoreEvent} from './engine';
import {clampParam, defaultPatch, PARAM_ID, type ParamName, type Patch, VOICE_PARAMS, midiToHz} from './params';
import {AFFRICATE_RELEASE, isVowel, PHONEMES, SCHWA, vowelTarget, type Phone} from './phonemes';
import {phonemize, parsePhonemeInput, syllabify, type Boundary, type Lexicon, type Word} from './text';

export interface Segment {
  symbol: string; // ARPABET or 'SIL'
  stress: number;
  start: number;
  end: number;
  word: number;
  /** Strong prosodic boundary after this segment. */
  boundary?: Boundary;
  label?: string;
}

const LEAD_SCALE = 2.4; // start a movement ~2.4 time constants before its target time

function voiceDefaults(voice: Patch) {
  const all = {...defaultPatch(), ...voice};
  return all;
}

/** Initial events: voice character and a neutral resting posture. */
function preamble(voice: Patch): ScoreEvent[] {
  const all = voiceDefaults(voice);
  const ev: ScoreEvent[] = [];
  for (const name of VOICE_PARAMS) ev.push([0, name, all[name], 0]);
  const rest: Patch = {...SCHWA, tipClose: 0, dorsumClose: 0, velum: 0, lateral: 0, voicing: 1, gate: 0, tipPlace: 0.38};
  for (const [k, v] of Object.entries(rest)) ev.push([0, k as ParamName, v!, 0]);
  return ev;
}

/** Articulatory events for a list of timed segments. */
export function articulate(segments: Segment[], voice: Patch): ScoreEvent[] {
  // Every gesture event remembers the segment that produced it (-1: global).
  type Tagged = {t: number; name: ParamName; value: number; tau: number; seg: number; order: number};
  const tagged: Tagged[] = [];
  const at = (t: number, name: ParamName, value: number, tau: number, seg = -1) =>
    tagged.push({t: Math.max(0, t), name, value: clampParam(name, value), tau, seg, order: tagged.length});
  // Intervals during which a consonant owns an articulator (closure onset to
  // release); later segments' movements of that articulator wait for the release.
  type Hold = {seg: number; name: ParamName; start: number; end: number; tau: number};
  const holds: Hold[] = [];
  const vowelIdx = segments.map((s, i) => (isVowel(s.symbol) ? i : -1)).filter(i => i >= 0);
  const nextVowel = (i: number) => segments[vowelIdx.find(v => v > i) ?? -1];
  const prevVowel = (i: number) => segments[[...vowelIdx].reverse().find(v => v < i) ?? -1];

  // Gate: on through each phrase, off in pauses.
  let inPhrase = false;
  segments.forEach((s, i) => {
    if (s.symbol === 'SIL') {
      if (inPhrase) at(s.start, 'gate', 0, 20);
      inPhrase = false;
    } else if (!inPhrase) {
      at(s.start - 0.03, 'gate', 1, 10);
      inPhrase = true;
    }
    if (i === segments.length - 1 && inPhrase) at(s.end, 'gate', 0, 40);
  });

  // Tongue-body anchors: vowels plus consonants that need the dorsum.
  type Anchor = {time: number; target: Patch; tau?: number; lead?: number; seg: number};
  const anchors: Anchor[] = [];
  segments.forEach((s, i) => {
    if (s.symbol === 'SIL') return;
    const ph = PHONEMES[s.symbol];
    const dur = s.end - s.start;
    if (isVowel(s.symbol)) {
      const target = vowelTarget({symbol: s.symbol, stress: s.stress});
      if (ph.offglide) {
        anchors.push({time: s.start + 0.22 * dur, target, seg: i});
        anchors.push({time: s.start + 0.8 * dur, target: {...ph.offglide, rhotic: 0}, seg: i});
      } else {
        anchors.push({time: s.start + 0.38 * dur, target, seg: i});
      }
      return;
    }
    if (s.symbol === 'HH') {
      // /h/ takes the following vowel's shape (voiceless onset).
      const v = nextVowel(i);
      if (v) anchors.push({time: s.start + 0.2 * dur, target: vowelTarget({symbol: v.symbol, stress: v.stress}), seg: i});
      return;
    }
    const t = ph.target;
    const body: Patch = {};
    for (const k of ['tongueX', 'tongueY', 'rhotic', 'jaw'] as ParamName[]) if (t[k] !== undefined) body[k] = t[k];
    if (Object.keys(body).length) {
      if (s.symbol === 'R') body.jaw = 0.55;
      // Consonantal tongue-body targets are extreme and brief: move early
      // enough (4 time constants) to get close to them.
      anchors.push({time: s.start + 0.5 * dur, target: body, tau: 18, lead: 4, seg: i});
    }
  });
  anchors.sort((a, b) => a.time - b.time);
  anchors.forEach((a, k) => {
    const gap = k ? a.time - anchors[k - 1].time : 0.15;
    const tau = a.tau ?? Math.min(48, Math.max(14, gap * 1000 * 0.3));
    const start = Math.max(k ? anchors[k - 1].time : 0, a.time - ((a.lead ?? LEAD_SCALE) * tau) / 1000);
    for (const [name, value] of Object.entries(a.target)) {
      if (['tongueX', 'tongueY', 'jaw', 'throat', 'rhotic', 'lipOpen', 'lipRound'].includes(name)) at(start, name as ParamName, value!, tau, a.seg);
    }
  });

  // Local consonant gestures.
  segments.forEach((s, i) => {
    if (s.symbol === 'SIL' || isVowel(s.symbol)) return;
    const ph = PHONEMES[s.symbol];
    const t = ph.target;
    const dur = s.end - s.start;
    const next = segments[i + 1];
    const nv = nextVowel(i) ?? prevVowel(i);
    const vowelLips = nv ? vowelTarget({symbol: nv.symbol, stress: nv.stress}) : SCHWA;
    const complete = ph.manner === 'stop' || ph.manner === 'nasal' || ph.manner === 'affricate';
    const closeTau = s.symbol === 'DX' ? 4 : complete ? 9 : 14;
    // Closures aim past contact (engine: contact at 92%); a critically damped
    // move reaches 92% after ~4.2 time constants, so start that early to
    // have the seal complete at segment start. Fricatives need ~3.5 tau to settle.
    // After a pause the articulators are already in place when the breath starts.
    const prevSeg = segments[i - 1];
    const phraseInitial = !prevSeg || prevSeg.symbol === 'SIL';
    const onset = phraseInitial ? Math.max(prevSeg?.start ?? 0, s.start - 0.1) : s.start - ((complete ? 4.2 : 3.5) * closeTau) / 1000;
    const releaseTau = ph.manner === 'stop' ? 6 : ph.manner === 'fricative' ? 14 : 12;
    const nextIsSame = (param: ParamName) => next && next.symbol !== 'SIL' && !isVowel(next.symbol) && PHONEMES[next.symbol].target[param] !== undefined;

    // Position the tip before it closes.
    if (t.tipPlace !== undefined) at(s.start - 0.07, 'tipPlace', t.tipPlace, 18, i);
    if (t.jaw !== undefined && ph.manner !== 'approximant') at(onset - 0.02, 'jaw', t.jaw, 22, i);
    if (t.lipRound !== undefined) at(onset - 0.03, 'lipRound', t.lipRound, 25, i);

    const closures: ParamName[] = ['lipOpen', 'tipClose', 'dorsumClose'];
    for (const param of closures) {
      if (t[param] === undefined) continue;
      // /ð/ after a pause or a stop/nasal is usually a brief dental stop
      // released into the fricative ("the" → [d̪ə]).
      const stopped = s.symbol === 'DH' && param === 'tipClose' && (phraseInitial || ['stop', 'nasal'].includes(PHONEMES[prevSeg.symbol]?.manner));
      at(onset, param, stopped ? 1 : t[param]!, closeTau, i);
      if (stopped) at(s.start + 0.45 * dur, param, t[param]!, 6, i);
      holds.push({seg: i, name: param, start: onset, end: s.end, tau: releaseTau});
      if (ph.manner === 'affricate' && AFFRICATE_RELEASE[s.symbol]) {
        const r = AFFRICATE_RELEASE[s.symbol];
        at(s.start + 0.55 * dur, 'tipClose', r.tipClose!, 6, i);
        at(s.start + 0.45 * dur, 'tipPlace', r.tipPlace!, 10, i);
      }
      if (!nextIsSame(param)) {
        const rest = param === 'lipOpen' ? vowelLips.lipOpen ?? 0.6 : 0;
        at(s.end - (param === 'lipOpen' ? 0.004 : 0.002), param, rest, releaseTau, i);
      }
    }
    if (t.lateral) {
      at(onset, 'lateral', 1, 10, i);
      at(s.end, 'lateral', 0, 15, i);
    }
    if (t.lipRound !== undefined && (!next || isVowel(next.symbol) || next.symbol === 'SIL')) {
      at(s.end, 'lipRound', vowelLips.lipRound ?? 0.1, 30, i);
    }
    // Velum: anticipatory lowering, raise after.
    if (t.velum) {
      at(s.start - 0.06, 'velum', 1, 22, i);
      if (!(next && PHONEMES[next.symbol]?.target.velum)) at(s.end + 0.01, 'velum', 0, 25, i);
    }
    // Glottis.
    if (!ph.voiced) {
      // Stops and affricates abduct once the seal is complete (an open glottis
      // behind a narrowing tip would hiss); fricatives slightly before the
      // constriction is reached.
      const closing = ph.manner === 'stop' || ph.manner === 'affricate';
      at(closing ? s.start : s.start - 0.012, 'voicing', 0, 7, i);
      const afterS = prevSeg && prevSeg.word === s.word && prevSeg.symbol === 'S';
      const aspirated = ph.manner === 'stop' && !afterS && next && (isVowel(next.symbol) ? next.stress > 0 : next.symbol === 'SIL' || ['R', 'L', 'W', 'Y'].includes(next.symbol));
      // Voice onset time after release; adduction takes ~12 ms to reach the
      // point where the folds start to vibrate, so the command leads it.
      const vot = ph.manner === 'stop' ? (aspirated ? 0.055 : 0.015) : ph.manner === 'affricate' ? 0.02 : 0.0;
      const following = next && next.symbol !== 'SIL' && !isVowel(next.symbol) && !PHONEMES[next.symbol].voiced;
      if (!following) at(s.end + Math.max(0, vot - 0.012), 'voicing', 1, 8, i);
    } else if (ph.manner === 'fricative' || ph.manner === 'stop' || ph.manner === 'affricate') {
      // Voiced obstruents: the glottis opens partly, keeping the folds
      // vibrating while feeding enough flow for frication / pressure build-up.
      at(s.start - 0.01, 'voicing', ph.manner === 'stop' ? 0.85 : 0.66, 10, i);
      at(s.end, 'voicing', 1, 10, i);
    }
  });
  return resolveGestures(tagged, holds, preamble(voice));
}

/**
 * Turn segment-tagged events into a score. Movements of an articulator that a
 * consonant holds closed wait for its release (and then move at release
 * speed), and once a later segment has started moving an articulator, events
 * from earlier segments for it (e.g. a restore after a voiced fricative) are
 * dropped, so later gestures are never undone by earlier ones.
 */
function resolveGestures(
  tagged: Array<{t: number; name: ParamName; value: number; tau: number; seg: number; order: number}>,
  holds: Array<{seg: number; name: ParamName; start: number; end: number; tau: number}>,
  ev: ScoreEvent[],
): ScoreEvent[] {
  holds.sort((a, b) => a.start - b.start);
  for (const e of tagged) {
    if (e.seg < 0) continue;
    for (const h of holds) {
      if (h.name === e.name && h.seg < e.seg && e.t >= h.start && e.t < h.end) {
        e.t = h.end;
        e.tau = Math.min(e.tau, h.tau);
      }
    }
  }
  tagged.sort((a, b) => a.t - b.t || a.seg - b.seg || a.order - b.order);
  const latest = new Map<ParamName, number>();
  for (const e of tagged) {
    if (e.seg >= 0) {
      const owner = latest.get(e.name) ?? -1;
      if (e.seg < owner) continue;
      latest.set(e.name, e.seg);
    }
    ev.push([e.t, e.name, e.value, e.tau]);
  }
  ev.sort((a, b) => a[0] - b[0]);
  return ev;
}

// ---- Speech -----------------------------------------------------------------

export interface SpeechOptions {
  /** Speaking-rate multiplier (1 = normal). */
  rate?: number;
  /** Intonation range, 0 flat .. 1 lively. */
  expression?: number;
  voice?: Patch;
}

export interface Plan {
  score: Score;
  segments: Segment[];
  words: Word[];
  warnings: string[];
}

function durationOf(seg: Phone, prev: Phone | undefined, next: Phone | undefined, final: boolean, rate: number): number {
  const ph = PHONEMES[seg.symbol];
  let d = ph.duration;
  if (isVowel(seg.symbol)) {
    d *= seg.stress === 1 ? 1.0 : seg.stress === 2 ? 0.85 : 0.6;
    if (seg.symbol === 'AH' && seg.stress === 0) d = 55;
    if (final) d *= 1.4;
    if (next && !isVowel(next.symbol) && !PHONEMES[next.symbol].voiced && !final) d *= 0.85;
  } else {
    const cluster = (prev && !isVowel(prev.symbol)) || (next && !isVowel(next.symbol));
    if (cluster) d *= 0.8;
    if (final) d *= 1.15;
  }
  return d / 1000 / rate;
}

/** Plan speech from words. */
export function planWords(words: Word[], opts: SpeechOptions = {}): Plan {
  const rate = Math.min(2.5, Math.max(0.4, opts.rate ?? 1));
  const expression = Math.min(1, Math.max(0, opts.expression ?? 0.6));
  const voice = {...defaultPatch(), ...(opts.voice ?? {})};
  const segments: Segment[] = [];
  let t = 0.08;
  segments.push({symbol: 'SIL', stress: 0, start: 0, end: t, word: -1});
  words.forEach((w, wi) => {
    const syll = syllabify(w.phones);
    const lastSyll = syll[syll.length - 1];
    w.phones.forEach((p, pi) => {
      const final = w.boundary !== 'word' && lastSyll.includes(p);
      const prev = pi > 0 ? w.phones[pi - 1] : wi > 0 && words[wi - 1].boundary === 'word' ? words[wi - 1].phones.at(-1) : undefined;
      const crossWord = pi === w.phones.length - 1;
      const next = !crossWord ? w.phones[pi + 1] : w.boundary === 'word' ? words[wi + 1]?.phones[0] : undefined;
      // American English flapping: T/D between a vowel and an unstressed vowel
      // ("water"), or word-finally before a vowel-initial word ("meet at").
      if ((p.symbol === 'T' || p.symbol === 'D') && pi > 0 && prev && isVowel(prev.symbol) && next && isVowel(next.symbol) && (crossWord || next.stress === 0)) {
        p = {symbol: 'DX', stress: 0};
      }
      const d = durationOf(p, w.phones[pi - 1], w.phones[pi + 1], final, rate);
      segments.push({symbol: p.symbol, stress: p.stress, start: t, end: t + d, word: wi});
      t += d;
    });
    if (w.boundary !== 'word') {
      segments[segments.length - 1].boundary = w.boundary;
      const pause = (w.boundary === 'comma' ? 0.18 : 0.38) / rate;
      segments.push({symbol: 'SIL', stress: 0, start: t, end: t + pause, word: -1});
      t += pause;
    }
  });
  if (segments[segments.length - 1].symbol !== 'SIL') {
    segments[segments.length - 1].boundary = 'period';
    segments.push({symbol: 'SIL', stress: 0, start: t, end: t + 0.25, word: -1});
    t += 0.25;
  }
  const events = articulate(segments, voice);
  events.push(...intonation(segments, voice.pitch, expression), ...dynamics(segments, voice.loudness));
  events.sort((a, b) => a[0] - b[0]);
  return {score: compileScore(events, t + 0.1), segments, words, warnings: []};
}

/** Statement declination with accents on stressed syllables; questions rise. */
function intonation(segments: Segment[], base: number, expression: number): ScoreEvent[] {
  const ev: ScoreEvent[] = [];
  const st = (semitones: number) => base * 2 ** (semitones / 12);
  let phraseStart = 0;
  const phrases: Array<[number, number]> = [];
  segments.forEach((s, i) => {
    if (s.symbol === 'SIL') {
      if (i > phraseStart) phrases.push([phraseStart, i]);
      phraseStart = i + 1;
    }
  });
  for (const [a, b] of phrases) {
    const seg = segments.slice(a, b);
    const vowels = seg.filter(s => isVowel(s.symbol));
    if (!vowels.length) continue;
    const t0 = seg[0].start;
    const t1 = seg[seg.length - 1].end;
    const end = seg[seg.length - 1].boundary ?? 'period';
    const accents = vowels.filter(v => v.stress === 1);
    const firstAccent = accents[0];
    ev.push([t0 - 0.05, 'pitch', st(1.0 * expression), 0]);
    vowels.forEach((v, k) => {
      const pos = (v.start - t0) / Math.max(0.2, t1 - t0);
      const declination = 1.2 * expression - 3.5 * expression * pos;
      const isLast = k === vowels.length - 1;
      let semis = declination;
      if (v.stress === 1) semis += (v === firstAccent ? 3.2 : 2.0) * expression;
      if (v.stress === 0) semis -= 0.8 * expression;
      if (isLast && end === 'question') semis = 4.5 * expression + 1;
      else if (isLast && end === 'exclaim') semis += 1.5 * expression;
      const peakTime = v.start + 0.3 * (v.end - v.start);
      ev.push([peakTime - 0.06, 'pitch', st(semis), 45]);
      if (isLast) {
        const fin = end === 'question' ? semis + 3 * expression : end === 'comma' ? semis - 0.5 : -4.5 * expression - 1;
        ev.push([v.start + 0.55 * (v.end - v.start), 'pitch', st(fin), 70]);
      }
    });
  }
  return ev;
}

function dynamics(segments: Segment[], loudness: number): ScoreEvent[] {
  const ev: ScoreEvent[] = [];
  for (const s of segments) {
    if (!isVowel(s.symbol)) continue;
    const delta = s.stress === 1 ? 0.06 : s.stress === 0 ? -0.07 : 0;
    ev.push([s.start - 0.02, 'loudness', clampParam('loudness', loudness + delta), 30]);
  }
  return ev;
}

export function planSpeech(input: string, lexicon: Lexicon, opts: SpeechOptions & {phonemes?: boolean} = {}): Plan {
  if (opts.phonemes) {
    const {words, errors} = parsePhonemeInput(input);
    const plan = planWords(words, opts);
    if (errors.length) plan.warnings.push(`Unknown phoneme tokens ignored: ${errors.slice(0, 8).join(', ')}`);
    return plan;
  }
  const words = phonemize(input, lexicon);
  const plan = planWords(words, opts);
  const guessed = words.filter(w => w.source === 'rules').map(w => w.text);
  if (guessed.length) plan.warnings.push(`Pronunciation guessed by rules: ${guessed.slice(0, 8).join(', ')}`);
  return plan;
}

// ---- Singing ------------------------------------------------------------------

export interface Note {
  /** Start in beats. */
  start: number;
  /** Length in beats. */
  length: number;
  /** MIDI note number. */
  midi: number;
}

export interface SongOptions {
  bpm: number;
  voice?: Patch;
  /** Fallback vowel when lyrics run out. */
  hum?: string;
}

export interface SungSyllable {
  phones: Phone[];
  text: string;
  word: number;
}

/**
 * Split lyrics into syllables. Hyphens in the lyrics ("hel-lo") are used as
 * display text when they agree with the phonetic syllable count. A lone "-"
 * extends the previous vowel over the next note (melisma).
 */
export function lyricSyllables(lyrics: string, lexicon: Lexicon): SungSyllable[] {
  const out: SungSyllable[] = [];
  const parts = lyrics.trim().split(/\s+/).filter(Boolean);
  parts.forEach((part, wi) => {
    if (part === '-' || part === '_') {
      out.push({phones: [], text: '–', word: wi});
      return;
    }
    const spelled = part.replace(/[^A-Za-z'-]/g, '').split('-').filter(Boolean);
    const word = phonemize(spelled.join(''), lexicon)[0];
    if (!word) return;
    const syl = syllabify(word.phones);
    syl.forEach((phones, k) => out.push({phones, text: spelled.length === syl.length ? spelled[k] : k === 0 ? spelled.join('') : '·', word: wi}));
  });
  return out;
}

export interface SongPlan extends Plan {
  assignments: Array<{note: number; syllable: number; text: string}>;
}

export function planSong(notes: Note[], lyrics: string, lexicon: Lexicon, opts: SongOptions): SongPlan {
  const bpm = Math.min(240, Math.max(30, opts.bpm));
  const beat = 60 / bpm;
  const voice = {...defaultPatch(), ...(opts.voice ?? {})};
  const syllables = lyricSyllables(lyrics, lexicon);
  const sorted = notes.map((n, i) => ({...n, index: i})).sort((a, b) => a.start - b.start || a.midi - b.midi);
  const lead = 0.25;
  const segments: Segment[] = [{symbol: 'SIL', stress: 0, start: 0, end: lead, word: -1}];
  const pitchEvents: ScoreEvent[] = [];
  const assignments: SongPlan['assignments'] = [];
  const hum: Phone[] = [{symbol: opts.hum ?? 'AA', stress: 1}];
  let syl = 0;
  let cursor = lead;
  sorted.forEach((n, k) => {
    const start = lead + n.start * beat;
    const end = lead + (n.start + n.length) * beat;
    const nextStart = k + 1 < sorted.length ? lead + sorted[k + 1].start * beat : Infinity;
    const legato = k > 0 && start - (lead + (sorted[k - 1].start + sorted[k - 1].length) * beat) < 0.02;
    let unit = syllables[syl];
    const melisma = unit && unit.phones.length === 0;
    if (unit) syl++;
    if (melisma && segments.length > 1) {
      // Extend the previous vowel; only the pitch moves.
      const lastVowel = [...segments].reverse().find(s => isVowel(s.symbol));
      if (lastVowel) {
        const trailing = segments.slice(segments.indexOf(lastVowel) + 1);
        const shift = Math.min(end, nextStart) - (trailing.length ? trailing[trailing.length - 1].end : lastVowel.end);
        lastVowel.end += shift;
        trailing.forEach(s => {
          s.start += shift;
          s.end += shift;
        });
        cursor = Math.max(cursor, lastVowel.end);
      }
      pitchEvents.push([start - 0.01, 'pitch', midiToHz(n.midi), 40]);
      assignments.push({note: n.index, syllable: syl - 1, text: '–'});
      return;
    }
    const phones = unit && unit.phones.length ? unit.phones : hum;
    assignments.push({note: n.index, syllable: unit ? syl - 1 : -1, text: unit?.text ?? 'ah'});
    const v = phones.findIndex(p => isVowel(p.symbol));
    const onset = v > 0 ? phones.slice(0, v) : [];
    const nucleus = v >= 0 ? phones[v] : hum[0];
    const coda = v >= 0 ? phones.slice(v + 1) : [];
    // Onset consonants end where the note starts, so the vowel lands on the beat.
    const onsetDur = onset.map(p => Math.min(0.09, PHONEMES[p.symbol].duration / 1000 * 0.85));
    const available = Math.max(0.03, start - cursor);
    const squeeze = Math.min(1, available / Math.max(1e-3, onsetDur.reduce((a, b) => a + b, 0)));
    let t = start - onsetDur.reduce((a, b) => a + b, 0) * squeeze;
    if (t - cursor > 0.06) {
      segments.push({symbol: 'SIL', stress: 0, start: cursor, end: t, word: -1});
    } else if (segments.length) {
      segments[segments.length - 1].end = t;
    }
    onset.forEach((p, i) => {
      const d = onsetDur[i] * squeeze;
      segments.push({symbol: p.symbol, stress: 0, start: t, end: t + d, word: k});
      t += d;
    });
    const stop = Math.min(end, nextStart - 0.005);
    const codaDur = coda.map(p => Math.min(0.08, PHONEMES[p.symbol].duration / 1000 * 0.75));
    const codaTotal = Math.min(codaDur.reduce((a, b) => a + b, 0), (stop - start) * 0.4);
    const vowelEnd = stop - codaTotal;
    segments.push({symbol: nucleus.symbol, stress: Math.max(1, nucleus.stress), start: t, end: vowelEnd, word: k, label: unit?.text});
    let c = vowelEnd;
    coda.forEach((p, i) => {
      const d = codaTotal * (codaDur[i] / Math.max(1e-3, codaDur.reduce((a, b) => a + b, 0)));
      segments.push({symbol: p.symbol, stress: 0, start: c, end: c + d, word: k});
      c += d;
    });
    cursor = c;
    pitchEvents.push([start - (legato ? 0.04 : 0.06), 'pitch', midiToHz(n.midi), legato ? 45 : 20]);
    // Delayed vibrato on held notes.
    if (end - start > 0.45) {
      pitchEvents.push([start - 0.06, 'vibratoDepth', 0, 60]);
      pitchEvents.push([start + 0.22, 'vibratoDepth', voice.vibratoDepth, 180]);
    }
    pitchEvents.push([start - 0.02, 'loudness', clampParam('loudness', voice.loudness + 0.04), 25]);
    pitchEvents.push([start + 0.12, 'loudness', voice.loudness, 120]);
  });
  segments.push({symbol: 'SIL', stress: 0, start: cursor, end: cursor + 0.3, word: -1, boundary: 'period'});
  const events = articulate(segments, voice);
  if (sorted.length) events.push([0, 'pitch', midiToHz(sorted[0].midi), 0]);
  events.push(...pitchEvents);
  events.sort((a, b) => a[0] - b[0]);
  return {score: compileScore(events, cursor + 0.4), segments, words: [], warnings: [], assignments};
}

/** A sustained vowel (or any shape) for a given time, e.g. for previews and renders of Play mode. */
export function planSustain(shape: Patch, voice: Patch, seconds: number): Score {
  const ev: ScoreEvent[] = preamble(voice);
  for (const [k, v] of Object.entries(shape)) ev.push([0, k as ParamName, v!, 0]);
  ev.push([0.02, 'gate', 1, 15], [Math.max(0.1, seconds), 'gate', 0, 60]);
  return compileScore(ev, seconds + 0.5);
}

/** Simulate the engine's articulator dynamics for display (200 Hz control rate). */
export function simulateTracks(score: Score, names: ParamName[], dt = 0.005): {times: Float32Array; tracks: Record<string, Float32Array>} {
  const ids = names.map(n => ({n, id: PARAM_ID[n]}));
  const steps = Math.ceil(score.length / dt) + 1;
  const times = new Float32Array(steps);
  const tracks: Record<string, Float32Array> = {};
  const state: Record<string, {x: number; v: number; target: number; w: number}> = {};
  const base = defaultPatch();
  for (const {n} of ids) {
    tracks[n] = new Float32Array(steps);
    state[n] = {x: base[n], v: 0, target: base[n], w: 1000 / 30};
  }
  const ev = score.events;
  let e = 0;
  for (let s = 0; s < steps; s++) {
    const t = s * dt;
    times[s] = t;
    while (e < ev.length / 4 && ev[e * 4] <= t) {
      const id = ev[e * 4 + 1];
      const match = ids.find(x => x.id === id);
      if (match) {
        const st = state[match.n];
        const tau = ev[e * 4 + 3];
        if (tau === 0) {
          st.x = st.target = ev[e * 4 + 2];
          st.v = 0;
        } else {
          st.target = ev[e * 4 + 2];
          st.w = 1000 / Math.max(0.5, tau < 0 ? 30 : tau);
        }
      }
      e++;
    }
    for (const {n} of ids) {
      const st = state[n];
      const x0 = st.x - st.target;
      const b = st.v + st.w * x0;
      const k = Math.exp(-st.w * dt);
      st.x = st.target + (x0 + b * dt) * k;
      st.v = (st.v - st.w * b * dt) * k;
      tracks[n][s] = st.x;
    }
  }
  return {times, tracks};
}

