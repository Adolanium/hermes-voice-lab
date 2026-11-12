/**
 * Score import: MusicXML (.musicxml/.xml, compressed .mxl) and Standard MIDI Files to one
 * monophonic line of notes plus a lyric string in the planner's format (see `lyricSyllables`).
 * Zero dependencies; runs in Node 20+ and browsers. All input is treated as untrusted.
 */
import type {Note} from './planner';

export interface ImportedScore {
  bpm: number;
  notes: Note[];
  lyrics: string;
  /** Every part (MusicXML) or track (MIDI) in the file, with its note count as written. */
  parts: Array<{id: string; name: string; notes: number}>;
  /** The id of the part the notes came from ('' when the file has none). */
  part: string;
  warnings: string[];
}

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_NOTES = 20000;
/** Notes read before voices, chords and ties are reduced. */
const MAX_RAW = 200000;
/** Measures played after repeats are unrolled. */
const MAX_MEASURES = 50000;
const MAX_ELEMENTS = 3_000_000;
const MAX_REPEAT_TIMES = 32;
const MAX_ZIP_ENTRIES = 10000;
const MIN_LEN = 0.0625;
const MAX_LEN = 64;
const GRID = 960;
const LOW = 36;
const HIGH = 96;
/** Longest single duration (beats) taken at face value; anything longer is malformed. */
const MAX_DURATION = 4096;

type SyllableKind = 'single' | 'begin' | 'middle' | 'end';
interface Lyric {
  text: string;
  /** Closing punctuation, kept only at the end of a word. */
  trail: string;
  kind: SyllableKind;
}
interface Ev {
  start: number;
  end: number;
  midi: number;
  lyric?: Lyric;
}

// ---- Shared: lyric text, monophonic line, result ----------------------------------------------

/** One score syllable as letters the planner accepts, or null when it has none. */
function cleanSyllable(raw: string): {text: string; trail: string} | null {
  // Hangul is kept as written: the Korean front end reads it, one block per note.
  const hangul = raw.normalize('NFC').match(/[\uAC00-\uD7A3]+/)?.[0];
  if (hangul) return {text: hangul, trail: /[!?.,]+$/.exec(raw.trim())?.[0] ?? ''};
  const plain = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'");
  // Two words elided onto one note: the note can carry one syllable, so the first is sung.
  const word = plain.split(/[\s_]+/).find(w => /[A-Za-z]/.test(w));
  if (!word) return null;
  return {text: word.replace(/[^A-Za-z']/g, ''), trail: /[!?.,]+$/.exec(word)?.[0] ?? ''};
}

/**
 * The lyric string for a line of notes: a word's syllables joined with hyphens, `-` for a note
 * that extends the previous syllable, `la` for notes before the first lyric.
 */
function buildLyrics(evs: Ev[], warnings: string[]): string {
  if (!evs.some(e => e.lyric)) {
    if (evs.length) warnings.push('This part has no lyrics; it will be hummed.');
    return '';
  }
  const tokens: string[] = [];
  let word: Lyric[] | null = null;
  let inWord = false;
  let sung = false;
  let split = 0;
  const flush = () => {
    if (word) tokens.push(word.map(l => l.text).join('-') + word[word.length - 1].trail);
    word = null;
  };
  for (const e of evs) {
    const l = e.lyric;
    if (!l) {
      flush();
      tokens.push(sung ? '-' : 'la');
      continue;
    }
    const continues = inWord && (l.kind === 'middle' || l.kind === 'end');
    if (continues && word) word.push(l);
    else {
      // A melisma inside a word cannot be written in the lyric format: the word is split there.
      if (continues) split++;
      flush();
      word = [l];
    }
    inWord = l.kind === 'begin' || l.kind === 'middle';
    sung = true;
  }
  flush();
  if (split) warnings.push(`${split} word${split === 1 ? ' has' : 's have'} a melisma inside and ${split === 1 ? 'was' : 'were'} split there.`);
  return tokens.join(' ');
}

/** Sort, make monophonic, fit the pitch range and the length limits, and build the result. */
function finish(input: Ev[], bpm: number, parts: ImportedScore['parts'], part: string, warnings: string[]): ImportedScore {
  const round = (x: number) => Math.round(x * GRID) / GRID;
  let bad = 0;
  const sorted: Ev[] = [];
  for (const e of input) {
    if (Number.isFinite(e.start) && Number.isFinite(e.end) && Number.isFinite(e.midi) && e.start >= 0 && e.midi >= 0 && e.midi <= 127) {
      sorted.push({...e, start: round(e.start), midi: Math.round(e.midi)});
    } else bad++;
  }
  if (bad) warnings.push(`${bad} malformed note${bad === 1 ? ' was' : 's were'} skipped.`);
  sorted.sort((a, b) => a.start - b.start || b.midi - a.midi);

  // One note at a time: the highest of simultaneous onsets, and an earlier note gives way to
  // a later one (it is cut short, or dropped when it would be shorter than the minimum).
  const line: Ev[] = [];
  let dropped = 0;
  for (const e of sorted) {
    let last = line[line.length - 1];
    if (last && e.start === last.start) {
      last.lyric ??= e.lyric;
      dropped++;
      continue;
    }
    while (last && e.start - last.start < MIN_LEN) {
      line.pop();
      dropped++;
      e.lyric ??= last.lyric;
      last = line[line.length - 1];
    }
    if (last && last.end > e.start) last.end = e.start;
    line.push(e);
  }
  if (dropped) warnings.push(`${dropped} overlapping note${dropped === 1 ? ' was' : 's were'} dropped to keep one note at a time.`);
  if (line.length > MAX_NOTES) {
    warnings.push(`Only the first ${MAX_NOTES} notes were imported.`);
    line.length = MAX_NOTES;
  }

  if (line.length) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of line) {
      lo = Math.min(lo, e.midi);
      hi = Math.max(hi, e.midi);
    }
    if (lo < LOW || hi > HIGH) {
      // Move the whole line by octaves when that fits; fold single notes only when it cannot.
      const k = lo < LOW ? 12 * Math.ceil((LOW - lo) / 12) : -12 * Math.ceil((hi - HIGH) / 12);
      if (lo + k >= LOW && hi + k <= HIGH) {
        for (const e of line) e.midi += k;
        warnings.push(`The melody was transposed ${Math.abs(k) / 12} octave${Math.abs(k) === 12 ? '' : 's'} ${k > 0 ? 'up' : 'down'} to fit the singer's range.`);
      } else {
        let moved = 0;
        for (const e of line) {
          const m = e.midi < LOW ? e.midi + 12 * Math.ceil((LOW - e.midi) / 12) : e.midi > HIGH ? e.midi - 12 * Math.ceil((e.midi - HIGH) / 12) : e.midi;
          if (m !== e.midi) moved++;
          e.midi = m;
        }
        warnings.push(`${moved} note${moved === 1 ? '' : 's'} outside the singer's range ${moved === 1 ? 'was' : 'were'} moved by octaves into it.`);
      }
    }
    if (line[0].start > 4) {
      const shift = Math.floor(line[0].start);
      for (const e of line) {
        e.start = round(e.start - shift);
        e.end -= shift;
      }
      warnings.push(`${shift} beats of silence before the first note were removed.`);
    }
  }

  const notes: Note[] = line.map(e => ({start: e.start, length: Math.min(MAX_LEN, Math.max(MIN_LEN, round(e.end - e.start))), midi: e.midi}));
  return {bpm, notes, lyrics: buildLyrics(line, warnings), parts, part, warnings};
}

// ---- XML ----------------------------------------------------------------------------------------

interface El {
  name: string;
  /** The raw attribute text of the start tag. */
  attrs: string;
  kids: El[];
  /** Raw character data (entities not yet decoded). */
  text: string;
}

const ENTITIES: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,8});/g, (all, body: string) => {
    if (body[0] !== '#') return ENTITIES[body] ?? all;
    const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  });
}

/** A tolerant, non-validating XML reader: elements, attributes and text; no recursion. */
function parseXml(src: string): El {
  const root: El = {name: '#document', attrs: '', kids: [], text: ''};
  const stack: El[] = [root];
  const n = src.length;
  let i = 0;
  let count = 0;
  const local = (name: string) => name.slice(name.lastIndexOf(':') + 1);
  while (i < n) {
    const lt = src.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt < 0) break;
    // Only leaf text matters; skip the indentation between elements.
    if (lt > i && !top.kids.length) top.text += src.slice(i, lt);
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      top.text += src.slice(lt + 9, e < 0 ? n : e).replace(/&/g, '&amp;');
      i = e < 0 ? n : e + 3;
    } else if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2);
      i = e < 0 ? n : e + 2;
    } else if (src.startsWith('<!', lt)) {
      // DOCTYPE, possibly with an internal subset in brackets.
      let e = lt + 2;
      let depth = 0;
      for (; e < n; e++) {
        const c = src.charCodeAt(e);
        if (c === 91) depth++;
        else if (c === 93) depth--;
        else if (c === 62 && depth <= 0) break;
      }
      i = e + 1;
    } else if (src.charCodeAt(lt + 1) === 47) {
      const e = src.indexOf('>', lt);
      const name = local(src.slice(lt + 2, e < 0 ? n : e).trim());
      // Close the nearest open element of that name; ignore a stray end tag.
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = e < 0 ? n : e + 1;
    } else {
      let e = lt + 1;
      let quote = 0;
      for (; e < n; e++) {
        const c = src.charCodeAt(e);
        if (quote) {
          if (c === quote) quote = 0;
        } else if (c === 34 || c === 39) quote = c;
        else if (c === 62) break;
      }
      const body = src.slice(lt + 1, e);
      i = e + 1;
      const selfClosing = body.endsWith('/');
      const m = /^([^\s/]+)/.exec(body);
      if (!m) continue;
      if (++count > MAX_ELEMENTS) throw new Error('The score is too large to import (too many XML elements).');
      const el: El = {name: local(m[1]), attrs: body.slice(m[1].length, selfClosing ? -1 : undefined), kids: [], text: ''};
      top.kids.push(el);
      if (!selfClosing) stack.push(el);
    }
  }
  return root;
}

const kid = (el: El | undefined, name: string): El | undefined => el?.kids.find(k => k.name === name);
const kidsOf = (el: El | undefined, name: string): El[] => (el ? el.kids.filter(k => k.name === name) : []);
const textOf = (el: El | undefined): string => (el ? decodeEntities(el.text).trim() : '');

const ATTR_CACHE = new Map<string, RegExp>();
function attr(el: El | undefined, name: string): string | undefined {
  if (!el || !el.attrs) return undefined;
  let re = ATTR_CACHE.get(name);
  if (!re) ATTR_CACHE.set(name, (re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`)));
  const m = re.exec(el.attrs);
  return m ? decodeEntities(m[1] ?? m[2]) : undefined;
}

/** Every descendant in document order, without recursion. */
function walk(el: El, visit: (e: El) => void) {
  const stack: El[] = [el];
  while (stack.length) {
    const e = stack.pop()!;
    visit(e);
    for (let k = e.kids.length - 1; k >= 0; k--) stack.push(e.kids[k]);
  }
}

/** A plain decimal number, or NaN (never Infinity, never a partial parse). */
function num(s: string | undefined): number {
  if (s === undefined) return NaN;
  const t = s.trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

// ---- MusicXML -----------------------------------------------------------------------------------

const STEPS: Record<string, number> = {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11};
const BEAT_UNITS: Record<string, number> = {long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625};

interface XmlNote extends Ev {
  voice: string;
  chord: boolean;
  tieStart: boolean;
  tieStop: boolean;
}

interface MeasureMarks {
  forward: boolean;
  /** Times the section is played when this measure ends with a backward repeat; 0 for none. */
  back: number;
  endingStart: number[] | null;
  endingStop: boolean;
}

const isSounded = (note: El) => !!kid(note, 'pitch') && !kid(note, 'grace') && !kid(note, 'cue');

/** A lyric element's verse number; unnumbered verses count by position. */
function verseOf(lyric: El, index: number): number {
  const v = parseInt(attr(lyric, 'number') ?? '', 10);
  return Number.isFinite(v) ? v : index + 1;
}

function lyricOf(note: El, verse: number): Lyric | undefined {
  const lyrics = kidsOf(note, 'lyric');
  for (let k = 0; k < lyrics.length; k++) {
    if (verseOf(lyrics[k], k) !== verse) continue;
    const clean = cleanSyllable(textOf(kid(lyrics[k], 'text')));
    if (!clean) continue;
    const syllabic = textOf(kid(lyrics[k], 'syllabic'));
    const kind: SyllableKind = syllabic === 'begin' || syllabic === 'middle' || syllabic === 'end' ? syllabic : 'single';
    return {...clean, kind};
  }
  return undefined;
}

/** What a part holds, read in written order: note count and the first verse's number. */
function surveyPart(part: El): {measures: El[]; notes: number; verse: number} {
  const measures = kidsOf(part, 'measure');
  let notes = 0;
  let verse = Infinity;
  for (const m of measures) {
    for (const note of m.kids) {
      if (note.name !== 'note' || !isSounded(note)) continue;
      notes++;
      const lyrics = kidsOf(note, 'lyric');
      for (let k = 0; k < lyrics.length; k++) {
        if (cleanSyllable(textOf(kid(lyrics[k], 'text')))) verse = Math.min(verse, verseOf(lyrics[k], k));
      }
    }
  }
  return {measures, notes, verse};
}

function marksOf(measure: El): MeasureMarks {
  const marks: MeasureMarks = {forward: false, back: 0, endingStart: null, endingStop: false};
  for (const barline of kidsOf(measure, 'barline')) {
    const repeat = kid(barline, 'repeat');
    const direction = attr(repeat, 'direction');
    if (direction === 'forward') marks.forward = true;
    if (direction === 'backward') {
      const times = parseInt(attr(repeat, 'times') ?? '', 10);
      marks.back = Number.isFinite(times) && times >= 1 ? Math.min(times, MAX_REPEAT_TIMES) : 2;
    }
    for (const ending of kidsOf(barline, 'ending')) {
      const type = attr(ending, 'type');
      if (type === 'start') {
        const numbers = (attr(ending, 'number') ?? '')
          .split(/[,\s]+/)
          .map(s => parseInt(s, 10))
          .filter(v => Number.isFinite(v) && v >= 1 && v <= MAX_REPEAT_TIMES);
        marks.endingStart = numbers.length ? numbers : [1];
      } else if (type === 'stop' || type === 'discontinue') marks.endingStop = true;
    }
  }
  return marks;
}

/** The order measures are played in once repeats and numbered endings are unrolled. */
function unroll(marks: MeasureMarks[]): {order: number[]; capped: boolean} {
  const n = marks.length;
  // The ending bracket each measure sits under, and the highest number in its run of brackets.
  const ending: Array<number[] | null> = [];
  let open: number[] | null = null;
  for (const m of marks) {
    if (m.endingStart) open = m.endingStart;
    ending.push(open);
    if (m.endingStop) open = null;
  }
  const groupMax = new Array<number>(n).fill(0);
  for (let i = 0; i < n; ) {
    if (!ending[i]) {
      i++;
      continue;
    }
    let j = i;
    let max = 0;
    for (; j < n && ending[j]; j++) max = Math.max(max, ...ending[j]!);
    for (let k = i; k < j; k++) groupMax[k] = max;
    i = j;
  }
  const order: number[] = [];
  let i = 0;
  let start = 0;
  let pass = 1;
  while (i < n) {
    if (order.length >= MAX_MEASURES) return {order, capped: true};
    const m = marks[i];
    if (m.forward && i !== start) {
      start = i;
      pass = 1;
    }
    const e = ending[i];
    const leavesEndings = !!e && (i + 1 >= n || !ending[i + 1]);
    if (e && !e.includes(pass)) {
      if (leavesEndings) {
        start = i + 1;
        pass = 1;
      }
      i++;
      continue;
    }
    order.push(i);
    if (m.back) {
      if (pass < (e ? Math.max(groupMax[i], m.back) : m.back)) {
        pass++;
        i = start;
        continue;
      }
      if (!e) {
        start = i + 1;
        pass = 1;
      }
    }
    if (leavesEndings) {
      start = i + 1;
      pass = 1;
    }
    i++;
  }
  return {order, capped: false};
}

/** The score's tempos in quarter notes per minute, in written order. */
function temposOf(root: El): number[] {
  const out: number[] = [];
  const add = (bpm: number) => {
    if (bpm >= 5 && bpm <= 1000) out.push(bpm);
  };
  walk(root, e => {
    if (e.name === 'sound') add(num(attr(e, 'tempo')));
    else if (e.name === 'metronome') {
      const perMinute = /\d+(\.\d+)?/.exec(textOf(kid(e, 'per-minute')))?.[0];
      if (!perMinute) return;
      const unit = BEAT_UNITS[textOf(kid(e, 'beat-unit'))] ?? 1;
      // Dots before <per-minute> belong to the beat unit: each adds half of the one before.
      let dots = 0;
      for (const k of e.kids) {
        if (k.name === 'per-minute') break;
        if (k.name === 'beat-unit-dot') dots++;
      }
      add(Number(perMinute) * unit * (2 - Math.pow(0.5, Math.min(dots, 4))));
    }
  });
  return out;
}

/** score-timewise (measures holding parts) rearranged as parts holding measures. */
function partsOfTimewise(root: El): El[] {
  const parts = new Map<string, El>();
  for (const measure of kidsOf(root, 'measure')) {
    for (const p of kidsOf(measure, 'part')) {
      const id = attr(p, 'id') ?? '';
      let part = parts.get(id);
      if (!part) parts.set(id, (part = {name: 'part', attrs: p.attrs, kids: [], text: ''}));
      part.kids.push({name: 'measure', attrs: measure.attrs, kids: p.kids, text: ''});
    }
  }
  return [...parts.values()];
}

/** Play one part: unroll its repeats and read every sounded note with its time in beats. */
function playPart(measures: El[], verse: number, warnings: string[]): XmlNote[] {
  // Divisions in force at the start of each measure as written, so a repeat jumps back correctly.
  const divisionsAt: number[] = [];
  let divisions = 1;
  let jumps = false;
  for (const m of measures) {
    divisionsAt.push(divisions);
    for (const k of m.kids) {
      if (k.name === 'attributes') {
        const d = num(textOf(kid(k, 'divisions')));
        if (d > 0) divisions = d;
      } else if (k.name === 'direction' || k.name === 'sound') {
        walk(k, e => {
          if (e.name === 'segno' || e.name === 'coda' || (e.name === 'sound' && /(?:^|\s)(dacapo|dalsegno|tocoda|fine|segno|coda)\s*=/.test(e.attrs))) jumps = true;
        });
      }
    }
  }
  if (jumps) warnings.push('D.C., D.S., segno and coda jumps are not followed; the score is read straight through.');
  const {order, capped} = unroll(measures.map(marksOf));
  if (capped) warnings.push(`Repeats were cut off after ${MAX_MEASURES} measures.`);

  const out: XmlNote[] = [];
  let skipped = 0;
  let measureStart = 0;
  const duration = (el: El, div: number) => {
    const d = num(textOf(kid(el, 'duration'))) / div;
    return d >= 0 && d <= MAX_DURATION ? d : NaN;
  };
  play: for (const index of order) {
    let div = divisionsAt[index];
    let pos = 0;
    let reach = 0;
    let lastStart = 0;
    for (const k of measures[index].kids) {
      if (k.name === 'attributes') {
        const d = num(textOf(kid(k, 'divisions')));
        if (d > 0) div = d;
      } else if (k.name === 'backup') {
        const d = duration(k, div);
        if (d >= 0) pos = Math.max(0, pos - d);
      } else if (k.name === 'forward') {
        const d = duration(k, div);
        if (d >= 0) pos += d;
        reach = Math.max(reach, pos);
      } else if (k.name === 'note') {
        if (kid(k, 'grace')) continue;
        const d = duration(k, div);
        if (Number.isNaN(d)) {
          skipped++;
          continue;
        }
        const chord = !!kid(k, 'chord');
        const start = chord ? lastStart : pos;
        if (!chord) {
          lastStart = pos;
          pos += d;
          reach = Math.max(reach, pos);
        }
        const pitch = kid(k, 'pitch');
        if (!pitch || kid(k, 'rest') || kid(k, 'cue')) continue;
        const step = STEPS[textOf(kid(pitch, 'step')).toUpperCase()];
        const octave = num(textOf(kid(pitch, 'octave')));
        const alter = kid(pitch, 'alter') ? num(textOf(kid(pitch, 'alter'))) : 0;
        const midi = 12 * (octave + 1) + step + Math.round(Number.isNaN(alter) ? 0 : alter);
        if (!Number.isInteger(midi) || midi < 0 || midi > 127 || d === 0) {
          skipped++;
          continue;
        }
        let ties = kidsOf(k, 'tie').map(t => attr(t, 'type'));
        if (!ties.length) ties = kidsOf(kid(k, 'notations'), 'tied').map(t => attr(t, 'type'));
        out.push({
          start: measureStart + start,
          end: measureStart + start + d,
          midi,
          lyric: lyricOf(k, verse),
          voice: textOf(kid(k, 'voice')) || '1',
          chord,
          tieStart: ties.includes('start') || ties.includes('continue'),
          tieStop: ties.includes('stop') || ties.includes('continue'),
        });
        if (out.length >= MAX_RAW) {
          warnings.push(`Only the first ${MAX_RAW} notes of the part were read.`);
          break play;
        }
      }
    }
    measureStart += reach;
  }
  if (skipped) warnings.push(`${skipped} malformed note${skipped === 1 ? ' was' : 's were'} skipped.`);
  return out;
}

/** One voice of a part as single notes: chords reduced to their top note, ties merged. */
function reduceVoice(raw: XmlNote[], warnings: string[]): Ev[] {
  // The vocal line is the voice that carries the lyrics; without lyrics, the busiest voice.
  const voices = new Map<string, {notes: number; lyrics: number}>();
  for (const n of raw) {
    let v = voices.get(n.voice);
    if (!v) voices.set(n.voice, (v = {notes: 0, lyrics: 0}));
    v.notes++;
    if (n.lyric) v.lyrics++;
  }
  let voice = '';
  let best = {notes: -1, lyrics: -1};
  for (const [name, v] of voices) {
    if (v.lyrics > best.lyrics || (v.lyrics === best.lyrics && v.notes > best.notes)) {
      voice = name;
      best = v;
    }
  }
  if (voices.size > 1) warnings.push(`The part has ${voices.size} voices; voice ${voice} was kept and the rest dropped.`);

  const single: XmlNote[] = [];
  let chords = 0;
  for (const n of raw) {
    if (n.voice !== voice) continue;
    const head = single[single.length - 1];
    if (n.chord && head && head.start === n.start) {
      if (!chords++) warnings.push('Chords were reduced to their highest note.');
      if (n.midi > head.midi) single[single.length - 1] = {...n, lyric: head.lyric ?? n.lyric, chord: false};
      else head.lyric ??= n.lyric;
    } else single.push({...n, chord: false});
  }
  single.sort((a, b) => a.start - b.start);

  const out: XmlNote[] = [];
  const tied = new Map<number, XmlNote>();
  for (const n of single) {
    const from = tied.get(n.midi);
    if (n.tieStop && from && Math.abs(n.start - from.end) < 0.01) {
      from.end = n.end;
      if (!n.tieStart) tied.delete(n.midi);
      continue;
    }
    out.push(n);
    if (n.tieStart) tied.set(n.midi, n);
    else tied.delete(n.midi);
  }
  return out;
}

export function importMusicXml(xml: string, opts: {part?: string} = {}): ImportedScore {
  if (typeof xml !== 'string') throw new Error('MusicXML import needs the file as text.');
  if (xml.length > MAX_BYTES) throw new Error('The score is too large to import (over 20 MB).');
  if (!/<(?:[\w.-]+:)?score-(?:partwise|timewise)[\s>/]/.test(xml)) {
    throw new Error('This is not a MusicXML score (no <score-partwise> element).');
  }
  let root: El | undefined;
  walk(parseXml(xml), e => {
    if (!root && (e.name === 'score-partwise' || e.name === 'score-timewise')) root = e;
  });
  if (!root) throw new Error('This is not a MusicXML score (no <score-partwise> element).');
  const warnings: string[] = [];

  const names = new Map<string, string>();
  walk(kid(root, 'part-list') ?? {name: '', attrs: '', kids: [], text: ''}, e => {
    if (e.name === 'score-part') names.set(attr(e, 'id') ?? '', textOf(kid(e, 'part-name')));
  });
  const partEls = root.name === 'score-timewise' ? partsOfTimewise(root) : kidsOf(root, 'part');
  const surveyed = partEls.map((el, k) => {
    const id = attr(el, 'id') ?? `P${k + 1}`;
    return {id, name: names.get(id) || id, ...surveyPart(el)};
  });
  const parts = surveyed.map(p => ({id: p.id, name: p.name, notes: p.notes}));

  const tempos = temposOf(root);
  const bpm = tempos.length ? Math.round(tempos[0] * 1000) / 1000 : 120;
  if (tempos.some(t => Math.abs(t - tempos[0]) > 0.01)) warnings.push(`The tempo changes during the score; the first tempo (${bpm} bpm) is used throughout.`);

  if (!surveyed.length) {
    warnings.push('The score has no parts.');
    return {bpm, notes: [], lyrics: '', parts, part: '', warnings};
  }
  let chosen = opts.part !== undefined ? surveyed.find(p => p.id === opts.part) : undefined;
  if (opts.part !== undefined && !chosen) warnings.push(`The score has no part "${opts.part}"; another was chosen.`);
  chosen ??= surveyed.find(p => Number.isFinite(p.verse) && p.notes > 0) ?? surveyed[0];

  const line = reduceVoice(playPart(chosen.measures, chosen.verse, warnings), warnings);
  return finish(line, bpm, parts, chosen.id, warnings);
}

// ---- Standard MIDI File -------------------------------------------------------------------------

interface MidiNote {
  tick: number;
  end: number;
  midi: number;
  channel: number;
}
interface MidiText {
  tick: number;
  text: string;
}
interface MidiTrack {
  name: string;
  notes: MidiNote[];
  lyrics: MidiText[];
  texts: MidiText[];
  tempos: Array<{tick: number; bpm: number}>;
}

function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  } catch {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return s;
  }
}

/** Read one MTrk chunk. Stops quietly at the first byte that makes no sense. */
function readTrack(b: Uint8Array, from: number, to: number, budget: {notes: number}): MidiTrack {
  const track: MidiTrack = {name: '', notes: [], lyrics: [], texts: [], tempos: []};
  const open = new Map<number, MidiNote[]>();
  let p = from;
  let tick = 0;
  let status = 0;
  const varlen = () => {
    let v = 0;
    for (let k = 0; k < 4 && p < to; k++) {
      const c = b[p++];
      v = v * 128 + (c & 0x7f);
      if (!(c & 0x80)) break;
    }
    return v;
  };
  const noteOff = (key: number) => {
    const n = open.get(key)?.shift();
    if (n) n.end = tick;
  };
  while (p < to) {
    tick += varlen();
    if (p >= to) break;
    let s = b[p];
    if (s & 0x80) p++;
    else if (status) s = status;
    else break;
    if (s === 0xff) {
      const type = b[p++];
      const length = varlen();
      const data = b.subarray(p, Math.min(to, p + length));
      p += length;
      if (type === 0x2f) break;
      if (type === 0x51 && data.length >= 3) {
        const micros = (data[0] << 16) | (data[1] << 8) | data[2];
        if (micros > 0) track.tempos.push({tick, bpm: 60e6 / micros});
      } else if (type === 0x03 && !track.name) track.name = decodeBytes(data).trim().slice(0, 200);
      else if ((type === 0x05 || type === 0x01) && data.length <= 1024 && track.lyrics.length + track.texts.length < MAX_RAW) {
        (type === 0x05 ? track.lyrics : track.texts).push({tick, text: decodeBytes(data)});
      }
    } else if (s === 0xf0 || s === 0xf7) {
      p += varlen();
    } else if (s >= 0xf0) {
      break;
    } else {
      status = s;
      const kind = s & 0xf0;
      const channel = s & 0x0f;
      const d1 = b[p++] & 0x7f;
      const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : b[p++] & 0x7f;
      if (p > to) break;
      const key = channel * 128 + d1;
      if (kind === 0x90 && d2 > 0) {
        if (budget.notes <= 0) continue;
        budget.notes--;
        const n: MidiNote = {tick, end: -1, midi: d1, channel};
        track.notes.push(n);
        const stack = open.get(key);
        if (stack) stack.push(n);
        else open.set(key, [n]);
      } else if (kind === 0x80 || kind === 0x90) noteOff(key);
    }
  }
  // Notes never switched off end with the track.
  for (const n of track.notes) if (n.end < 0) n.end = tick;
  return track;
}

/** Karaoke lyric events as syllables: which start a word, which carry on. */
function midiSyllables(events: MidiText[]): Array<{tick: number; lyric: Lyric}> {
  const items: Array<{tick: number; text: string; trail: string; lead: boolean; space: boolean; hyphen: boolean; breakBefore: boolean}> = [];
  let pendingBreak = false;
  for (const ev of events) {
    const raw = ev.text;
    const clean = cleanSyllable(raw.replace(/^[\s/\\]+/, ''));
    if (!clean) {
      // A bare line break or punctuation still ends the word.
      pendingBreak = true;
      continue;
    }
    items.push({tick: ev.tick, ...clean, lead: /^[\s/\\]/.test(raw), space: /\s$/.test(raw), hyphen: /-\s*$/.test(raw), breakBefore: pendingBreak});
    pendingBreak = false;
  }
  // With word spaces in the file, a syllable without one carries on the word (karaoke files);
  // without any, only a trailing hyphen joins syllables.
  const spaced = items.some(it => it.lead || it.space);
  const starts = items.map((it, k) => {
    if (k === 0 || it.breakBefore) return true;
    const prev = items[k - 1];
    if (prev.hyphen) return false;
    return spaced ? it.lead || prev.space : true;
  });
  return items.map((it, k) => {
    const more = k + 1 < items.length && !starts[k + 1];
    const kind: SyllableKind = starts[k] ? (more ? 'begin' : 'single') : more ? 'middle' : 'end';
    return {tick: it.tick, lyric: {text: it.text, trail: it.trail, kind}};
  });
}

/** A track's lyric events: lyric metas, or text metas when it has no lyric metas and several timed texts. */
function lyricEventsOf(track: MidiTrack): MidiText[] {
  if (track.lyrics.length) return track.lyrics;
  const texts = track.texts.filter(t => !t.text.startsWith('@'));
  return texts.filter(t => t.tick > 0).length >= 2 ? texts : [];
}

export function importMidi(bytes: Uint8Array, opts: {track?: number} = {}): ImportedScore {
  if (!(bytes instanceof Uint8Array)) throw new Error('MIDI import needs the file as bytes.');
  if (bytes.length > MAX_BYTES) throw new Error('The MIDI file is too large to import (over 20 MB).');
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  const u32 = (at: number) => bytes[at] * 0x1000000 + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
  const u16 = (at: number) => (bytes[at] << 8) | bytes[at + 1];
  // The header normally opens the file; RIFF-wrapped files have it a little further in.
  let head = -1;
  for (let k = 0; k + 14 <= bytes.length && k < 256; k++) {
    if (bytes[k] === 0x4d && tag(k) === 'MThd') {
      head = k;
      break;
    }
  }
  if (head < 0) throw new Error('This is not a MIDI file (no MThd header).');
  const warnings: string[] = [];
  const format = u16(head + 8);
  const division = u16(head + 12);
  let ticksPerBeat = division;
  let timecode = false;
  if (division & 0x8000) {
    // SMPTE time: ticks are fractions of a second. Read as 120 bpm, where a beat is half a second.
    timecode = true;
    ticksPerBeat = ((256 - (division >> 8)) * (division & 0xff)) / 2;
    warnings.push('The file is timed in seconds, not beats; it is read as 120 bpm.');
  }
  if (!(ticksPerBeat > 0)) throw new Error('This MIDI file has no usable time division.');
  if (format === 2) warnings.push('The file holds independent patterns (format 2); each is listed as a track.');

  const tracks: MidiTrack[] = [];
  const budget = {notes: MAX_RAW};
  for (let p = head + 8 + u32(head + 4); p + 8 <= bytes.length && tracks.length < 1024; ) {
    const end = Math.min(bytes.length, p + 8 + u32(p + 4));
    if (tag(p) === 'MTrk') tracks.push(readTrack(bytes, p + 8, end, budget));
    p = end;
  }
  if (budget.notes <= 0) warnings.push(`Only the first ${MAX_RAW} notes of the file were read.`);

  // Channel 10 is percussion: not something to sing.
  const pitched = tracks.map(t => t.notes.filter(n => n.channel !== 9));
  const parts = tracks.map((t, k) => ({id: String(k), name: t.name || `Track ${k + 1}`, notes: pitched[k].length}));

  const tempos = tracks.flatMap(t => t.tempos).sort((a, b) => a.tick - b.tick);
  const bpm = timecode || !tempos.length ? 120 : Math.round(tempos[0].bpm * 1000) / 1000;
  if (!timecode && tempos.some(t => Math.abs(t.bpm - tempos[0].bpm) > 0.01)) warnings.push(`The tempo changes during the file; the first tempo (${bpm} bpm) is used throughout.`);

  if (!tracks.length) {
    warnings.push('The MIDI file has no tracks.');
    return {bpm, notes: [], lyrics: '', parts, part: '', warnings};
  }
  let chosen = -1;
  if (opts.track !== undefined) {
    if (Number.isInteger(opts.track) && opts.track >= 0 && opts.track < tracks.length) chosen = opts.track;
    else warnings.push(`The file has no track ${opts.track}; another was chosen.`);
  }
  if (chosen < 0) chosen = tracks.findIndex((t, k) => pitched[k].length > 0 && lyricEventsOf(t).length > 0);
  if (chosen < 0) chosen = pitched.reduce((best, notes, k) => (notes.length > pitched[best].length ? k : best), 0);

  let notes = pitched[chosen];
  if (!notes.length && tracks[chosen].notes.length) warnings.push('The chosen track only has percussion; nothing was imported.');
  // A track that mixes channels (every format 0 file): the busiest channel is the line.
  const channels = new Map<number, number>();
  for (const n of notes) channels.set(n.channel, (channels.get(n.channel) ?? 0) + 1);
  if (channels.size > 1) {
    const keep = [...channels].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    notes = notes.filter(n => n.channel === keep);
    warnings.push(`The track uses ${channels.size} channels; channel ${keep + 1} was kept and the rest dropped.`);
  }
  // Highest note of each onset, so a lyric lands on the note that is kept.
  notes = [...notes].sort((a, b) => a.tick - b.tick || b.midi - a.midi);
  const line: Array<MidiNote & {lyric?: Lyric}> = notes.filter((n, k) => k === 0 || n.tick !== notes[k - 1].tick);
  const chords = notes.length - line.length;
  if (chords) warnings.push(`${chords} simultaneous note${chords === 1 ? ' was' : 's were'} dropped; the highest of each chord is kept.`);

  // Lyrics: the track's own, or those of a words-only track (karaoke files keep them apart).
  let events = lyricEventsOf(tracks[chosen]);
  if (!events.length) events = tracks.filter((t, k) => !pitched[k].length).map(lyricEventsOf).find(e => e.length) ?? [];
  const slack = Math.max(1, ticksPerBeat / 16);
  let at = 0;
  let unplaced = 0;
  for (const s of midiSyllables([...events].sort((a, b) => a.tick - b.tick))) {
    while (at < line.length && line[at].tick < s.tick - slack) at++;
    if (at < line.length && line[at].tick - s.tick <= ticksPerBeat) line[at++].lyric = s.lyric;
    else unplaced++;
  }
  if (unplaced) warnings.push(`${unplaced} lyric syllable${unplaced === 1 ? ' was' : 's were'} not on a note and ${unplaced === 1 ? 'was' : 'were'} left out.`);

  const evs: Ev[] = line.map(n => ({start: n.tick / ticksPerBeat, end: n.end / ticksPerBeat, midi: n.midi, lyric: n.lyric}));
  return finish(evs, bpm, parts, String(chosen), warnings);
}

// ---- Files: .musicxml / .xml, .mxl (zip), .mid / .midi ------------------------------------------

/** XML bytes as text: UTF-8 unless a byte-order mark or the declaration says otherwise. */
function decodeXmlBytes(bytes: Uint8Array): string {
  let label = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) label = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) label = 'utf-16be';
  else if (bytes[0] === 0x3c && bytes[1] === 0) label = 'utf-16le';
  else if (bytes[0] === 0 && bytes[1] === 0x3c) label = 'utf-16be';
  else {
    let headText = '';
    for (let k = 0; k < Math.min(200, bytes.length); k++) headText += String.fromCharCode(bytes[k]);
    const declared = /^(?:ï»¿)?<\?xml[^>]*encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(headText)?.[1];
    if (declared) label = declared;
  }
  let text: string;
  try {
    text = new TextDecoder(label).decode(bytes);
  } catch {
    text = new TextDecoder('utf-8').decode(bytes);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('Compressed scores (.mxl) cannot be opened here: no DecompressionStream.');
  const reader = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw new Error('The score is too large to import (over 20 MB unpacked).');
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('The score is too large')) throw err;
    throw new Error('The compressed score (.mxl) is damaged and could not be unpacked.');
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The score inside a compressed MusicXML (.mxl) archive, as text. */
async function readMxl(bytes: Uint8Array): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const damaged = () => new Error('This is not a compressed MusicXML file (.mxl): the zip archive is damaged.');
  // The end-of-central-directory record sits at the end, before an optional comment.
  let eocd = -1;
  for (let p = bytes.length - 22; p >= 0 && p >= bytes.length - 22 - 65535; p--) {
    if (view.getUint32(p, true) === 0x06054b50) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0) throw new Error('This is not a compressed MusicXML file (.mxl): no zip directory.');
  const count = Math.min(view.getUint16(eocd + 10, true), MAX_ZIP_ENTRIES);
  const entries: Array<{name: string; method: number; packed: number; size: number; header: number}> = [];
  let p = view.getUint32(eocd + 16, true);
  for (let k = 0; k < count; k++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) break;
    const nameLength = view.getUint16(p + 28, true);
    entries.push({
      name: decodeBytes(bytes.subarray(p + 46, p + 46 + nameLength)),
      method: view.getUint16(p + 10, true),
      packed: view.getUint32(p + 20, true),
      size: view.getUint32(p + 24, true),
      header: view.getUint32(p + 42, true),
    });
    p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  const read = async (name: string): Promise<Uint8Array | undefined> => {
    const e = entries.find(x => x.name === name) ?? entries.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!e) return undefined;
    if (e.size > MAX_BYTES || e.packed > MAX_BYTES) throw new Error('The score is too large to import (over 20 MB unpacked).');
    if (e.header + 30 > bytes.length || view.getUint32(e.header, true) !== 0x04034b50) throw damaged();
    const from = e.header + 30 + view.getUint16(e.header + 26, true) + view.getUint16(e.header + 28, true);
    if (from + e.packed > bytes.length) throw damaged();
    const data = bytes.subarray(from, from + e.packed);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateRaw(data, MAX_BYTES);
    throw new Error('The compressed score (.mxl) uses a compression method that is not supported.');
  };
  let rootfile: string | undefined;
  const container = await read('META-INF/container.xml');
  if (container) {
    const tagText = /<rootfile\b[^>]*>/.exec(decodeXmlBytes(container))?.[0] ?? '';
    const m = /\bfull-path\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(tagText);
    if (m) rootfile = decodeEntities(m[1] ?? m[2]).replace(/^\/+/, '');
  }
  let score = rootfile ? await read(rootfile) : undefined;
  if (!score) {
    const first = entries.find(e => /\.(musicxml|xml)$/i.test(e.name) && !/^META-INF\//i.test(e.name));
    if (first) score = await read(first.name);
  }
  if (!score) throw new Error('The compressed score (.mxl) has no MusicXML file inside.');
  return decodeXmlBytes(score);
}

/** Import a score file by its extension (and, failing that, by what its first bytes say). */
export async function importScoreFile(name: string, bytes: Uint8Array, opts: {part?: string} = {}): Promise<ImportedScore> {
  if (!(bytes instanceof Uint8Array)) throw new Error('Score import needs the file as bytes.');
  if (bytes.length > MAX_BYTES) throw new Error('The file is too large to import (over 20 MB).');
  const ext = /\.([A-Za-z0-9]+)$/.exec(name)?.[1].toLowerCase() ?? '';
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  const kind =
    magic === 'MThd' ? 'midi'
    : magic === 'PK\u0003\u0004' ? 'mxl'
    : ext === 'mid' || ext === 'midi' || ext === 'kar' || magic === 'RIFF' ? 'midi'
    : ext === 'mxl' ? 'mxl'
    : ext === 'musicxml' || ext === 'xml' ? 'xml'
    : bytes.length && (bytes[0] === 0x3c || bytes[0] === 0xef || bytes[0] === 0xff || bytes[0] === 0xfe) ? 'xml'
    : '';
  if (kind === 'midi') {
    const track = opts.part !== undefined && /^\d+$/.test(opts.part) ? Number(opts.part) : undefined;
    if (opts.part !== undefined && track === undefined) {
      const out = importMidi(bytes);
      out.warnings.unshift(`The file has no track "${opts.part}"; another was chosen.`);
      return out;
    }
    return importMidi(bytes, {track});
  }
  if (kind === 'mxl') return importMusicXml(await readMxl(bytes), opts);
  if (kind === 'xml') return importMusicXml(decodeXmlBytes(bytes), opts);
  throw new Error(`"${name}" is not a score this can import: use MusicXML (.musicxml, .xml, .mxl) or MIDI (.mid).`);
}
