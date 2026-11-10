/**
 * Text front end: normalisation, dictionary lookup, a small fallback
 * letter-to-sound rule set, and direct ARPABET input.
 */
import {PHONE_CODES} from './lexicon-codes.mjs';
import {isVowel, PALATALIZABLE, parsePhone, PHONEMES, type Phone} from './phonemes';

export interface Lexicon {
  lookup(word: string): Phone[] | null;
  size: number;
}

/** Decode the front-coded lexicon text produced by scripts/build-lexicon.mjs. */
export function decodeLexicon(text: string): Lexicon {
  const map = new Map<string, string>();
  let previous = '';
  for (const line of text.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 1) continue;
    const word = previous.slice(0, line.charCodeAt(0) - 0x30) + line.slice(1, tab);
    map.set(word, line.slice(tab + 1));
    previous = word;
  }
  return {
    size: map.size,
    lookup(word) {
      const code = map.get(word.toLowerCase());
      if (!code) return null;
      return Array.from(code, c => parsePhone(PHONE_CODES[c.charCodeAt(0) - 0x21])!);
    },
  };
}

export const EMPTY_LEXICON: Lexicon = {size: 0, lookup: () => null};

// ---- Normalisation -------------------------------------------------------

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberToWords(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n < 0) return `minus ${numberToWords(-n)}`;
  n = Math.floor(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberToWords(n % 100)}` : ''}`;
  if (n < 1_000_000) return `${numberToWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberToWords(n % 1000)}` : ''}`;
  return n.toString().split('').map(d => ONES[Number(d)]).join(' ');
}

export type Boundary = 'word' | 'comma' | 'period' | 'question' | 'exclaim';

export interface Token {
  text: string;
  /** Punctuation that follows the word, if any. */
  boundary: Boundary;
}

export function tokenize(input: string): Token[] {
  const text = input
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent ')
    .replace(/\d+(\.\d+)?/g, m => {
      const [whole, frac] = m.split('.');
      return ` ${numberToWords(Number(whole))}${frac ? ` point ${frac.split('').map(d => ONES[Number(d)]).join(' ')}` : ''} `;
    });
  const tokens: Token[] = [];
  const re = /([A-Za-z]+(?:'[A-Za-z]+)*)|([,;:—–-]+)|([.]+)|([?]+)|([!]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[1]) tokens.push({text: m[1].toLowerCase(), boundary: 'word'});
    else if (tokens.length) {
      const last = tokens[tokens.length - 1];
      last.boundary = m[2] ? (m[2].startsWith('-') && m[2].length === 1 ? last.boundary : 'comma') : m[3] ? 'period' : m[4] ? 'question' : 'exclaim';
    }
  }
  return tokens;
}

// ---- Fallback letter-to-sound -------------------------------------------

/**
 * Ordered rules: [pattern, phones]. Patterns are matched at the current
 * position; `$` in a pattern means "end of word". Written for this project as
 * a compact approximation; dictionary words never reach it.
 */
const RULES: Array<[string, string]> = [
  ['tion', 'SH AH0 N'], ['sion', 'ZH AH0 N'], ['ture', 'CH ER0'], ['ough', 'AO1'], ['augh', 'AO1'], ['eigh', 'EY1'],
  ['igh', 'AY1'], ['tch', 'CH'], ['dge', 'JH'], ['sch', 'S K'], ['ph', 'F'], ['sh', 'SH'], ['ch', 'CH'], ['th', 'TH'],
  ['wh', 'W'], ['ck', 'K'], ['ng$', 'NG'], ['nk', 'NG K'], ['qu', 'K W'], ['kn', 'N'], ['wr', 'R'], ['gh', ''],
  ['ee', 'IY1'], ['ea', 'IY1'], ['oo', 'UW1'], ['ou', 'AW1'], ['ow$', 'OW1'], ['ow', 'AW1'], ['oa', 'OW1'], ['oi', 'OY1'],
  ['oy', 'OY1'], ['ai', 'EY1'], ['ay', 'EY1'], ['au', 'AO1'], ['aw', 'AO1'], ['ie$', 'IY0'], ['ey$', 'IY0'], ['ew', 'UW1'],
  ['ar', 'AA1 R'], ['er', 'ER0'], ['ir', 'ER1'], ['ur', 'ER1'], ['or', 'AO1 R'], ['le$', 'AH0 L'], ['es$', 'Z'],
  ['ed$', 'D'], ['y$', 'IY0'], ['e$', ''], ['ss', 'S'], ['ll', 'L'], ['ff', 'F'], ['tt', 'T'], ['pp', 'P'], ['mm', 'M'],
  ['nn', 'N'], ['rr', 'R'], ['dd', 'D'], ['bb', 'B'], ['gg', 'G'], ['zz', 'Z'], ['c(?=[eiy])', 'S'], ['g(?=[ei])', 'JH'],
  ['x', 'K S'], ['a', 'AE1'], ['e', 'EH1'], ['i', 'IH1'], ['o', 'AA1'], ['u', 'AH1'], ['y', 'Y'], ['b', 'B'], ['c', 'K'],
  ['d', 'D'], ['f', 'F'], ['g', 'G'], ['h', 'HH'], ['j', 'JH'], ['k', 'K'], ['l', 'L'], ['m', 'M'], ['n', 'N'], ['p', 'P'],
  ['q', 'K'], ['r', 'R'], ['s', 'S'], ['t', 'T'], ['v', 'V'], ['w', 'W'], ['z', 'Z'], ["'", ''],
];
const COMPILED = RULES.map(([p, phones]) => [new RegExp(`^(?:${p.replace('$', '(?![a-z])')})`), phones] as const);

/** Magic-e: a single vowel + consonant + final e becomes a long vowel. */
const LONG: Record<string, string> = {a: 'EY1', e: 'IY1', i: 'AY1', o: 'OW1', u: 'UW1'};

export function letterToSound(word: string): Phone[] {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  const out: string[] = [];
  const magic = /^(.*?)([aeiou])([bcdfgklmnprstvz])e$/.exec(w);
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    if (magic && i === magic[1].length && !/[aeiou]/.test(magic[1].slice(-1))) {
      out.push(LONG[magic[2]], ...(letterToSound(magic[3]).map(p => p.symbol)));
      break;
    }
    const rule = COMPILED.find(([re]) => re.test(rest));
    if (!rule) {
      i += 1;
      continue;
    }
    const matched = rest.match(rule[0])![0].length || 1;
    if (rule[1]) out.push(...rule[1].split(' '));
    i += matched;
  }
  let phones = out.map(t => parsePhone(t)).filter((p): p is Phone => !!p);
  // Keep one primary stress; reduce the others.
  let seen = false;
  phones = phones.map(p => {
    if (!isVowel(p.symbol)) return p;
    if (p.stress === 1 && !seen) {
      seen = true;
      return p;
    }
    return {...p, stress: p.stress === 1 ? 0 : p.stress};
  });
  return phones;
}

// ---- Phonemisation --------------------------------------------------------

export interface Word {
  text: string;
  phones: Phone[];
  source: 'dictionary' | 'rules' | 'phonemes';
  boundary: Boundary;
}

/** Trill words: "brr…" is a lip trill, "rrr…" a rolled tongue-tip r. */
function trillWord(word: string): Phone[] | null {
  if (/^br{2,}$/.test(word)) return [{symbol: 'BR', stress: 0}];
  if (/^r{3,}$/.test(word)) return [{symbol: 'RR', stress: 0}];
  if (/^tsk$/.test(word)) return [{symbol: 'CD', stress: 0}];
  return null;
}

export function phonemize(text: string, lexicon: Lexicon): Word[] {
  return tokenize(text).map((t): Word => {
    const trill = trillWord(t.text);
    if (trill) return {text: t.text, phones: trill, source: 'rules', boundary: t.boundary};
    const known = lexicon.lookup(t.text);
    return known
      ? {text: t.text, phones: known, source: 'dictionary', boundary: t.boundary}
      : {text: t.text, phones: letterToSound(t.text), source: 'rules', boundary: t.boundary};
  }).filter(w => w.phones.length > 0);
}

/**
 * Weak forms of English function words, as spoken inside a phrase: the vowel
 * reduces and the word is unstressed ("of" [əv], "to" [tə], "for" [fɚ]).
 * A word at the end of a phrase keeps its strong form ("what's it for?").
 */
const WEAK: Record<string, string> = {
  a: 'AH0', an: 'AH0 N', the: 'DH AH0', of: 'AH0 V', to: 'T AH0', for: 'F ER0', from: 'F R AH0 M',
  at: 'AH0 T', and: 'AH0 N D', as: 'AH0 Z', but: 'B AH0 T', or: 'ER0', than: 'DH AH0 N', that: 'DH AH0 T',
  can: 'K AH0 N', was: 'W AH0 Z', were: 'W ER0', are: 'ER0', am: 'AH0 M', has: 'HH AH0 Z', had: 'HH AH0 D',
  have: 'HH AH0 V', some: 'S AH0 M', them: 'DH AH0 M', her: 'HH ER0', his: 'HH IH0 Z', him: 'IH0 M',
  your: 'Y ER0', you: 'Y UW0', we: 'W IY0', he: 'HH IY0', she: 'SH IY0', me: 'M IY0', my: 'M AY0', by: 'B AY0',
  is: 'IH0 Z', in: 'IH0 N', on: 'AA0 N', with: 'W IH0 DH', be: 'B IY0', do: 'D UW0', does: 'D AH0 Z', will: 'W IH0 L',
  would: 'W UH0 D', should: 'SH UH0 D', could: 'K UH0 D', there: 'DH ER0', us: 'AH0 S',
};

export function reduceFunctionWords(words: Word[]): Word[] {
  return words.map(w => {
    const weak = WEAK[w.text.toLowerCase()];
    if (!weak || w.source !== 'dictionary' || w.boundary !== 'word') return w;
    return {...w, phones: weak.split(' ').map(t => parsePhone(t)!)};
  });
}

/** IPA → phoneme symbols, longest first (affricates, diphthongs, ejectives before single letters). */
const IPA: Array<[string, string, number?]> = [
  // Palatalized consonants: the letter plus ʲ (tʲ, nʲ, rʲ).
  ...PALATALIZABLE.flatMap((s): Array<[string, string]> => [[`${PHONEMES[s].ipa}ʲ`, `${s}J`], ...(s === 'G' ? [['ɡʲ', 'GJ'] as [string, string]] : [])]),
  ['tʃ', 'CH'], ['dʒ', 'JH'], ['aɪ', 'AY'], ['aʊ', 'AW'], ['ɔɪ', 'OY'], ['eɪ', 'EY'], ['oʊ', 'OW'],
  ['pʼ', 'PE'], ['tʼ', 'TE'], ['kʼ', 'KE'],
  ['i', 'IY'], ['ɪ', 'IH'], ['e', 'EY'], ['ɛ', 'EH'], ['æ', 'AE'], ['ɑ', 'AA'], ['a', 'AA'], ['ɒ', 'AA'], ['ɔ', 'AO'], ['o', 'OW'],
  ['ʊ', 'UH'], ['u', 'UW'], ['ʌ', 'AH'], ['ə', 'AH', 0], ['ɝ', 'ER'], ['ɜ', 'ER'], ['ɚ', 'ER', 0],
  ['p', 'P'], ['b', 'B'], ['t', 'T'], ['d', 'D'], ['k', 'K'], ['g', 'G'], ['ɡ', 'G'], ['f', 'F'], ['v', 'V'], ['θ', 'TH'], ['ð', 'DH'],
  ['s', 'S'], ['z', 'Z'], ['ʃ', 'SH'], ['ʒ', 'ZH'], ['h', 'HH'], ['m', 'M'], ['n', 'N'], ['ŋ', 'NG'], ['l', 'L'], ['ɹ', 'R'],
  ['r', 'RR'], ['ɾ', 'DX'], ['w', 'W'], ['j', 'Y'], ['ʔ', 'Q'], ['ʙ', 'BR'], ['ʀ', 'RU'], ['ʘ', 'CB'], ['ǀ', 'CD'], ['ǃ', 'CA'],
];
const IPA_ONLY = /[ɪɛæɑɒɔʊʌəɝɜɚθðʃʒŋɹɾʔʙʀʘǀǃˈˌːɡʲ]/;

/** True when phoneme input is IPA rather than ARPABET. */
export function isIpa(text: string): boolean {
  return IPA_ONLY.test(text);
}

/**
 * IPA input: words separated by spaces, ˈ and ˌ mark the stress of the next
 * vowel (a word without marks stresses its first full vowel; ə and ɚ are
 * unstressed), ː and syllable dots are ignored, and , . ? ! mark boundaries.
 */
export function parseIpaInput(text: string): {words: Word[]; errors: string[]} {
  const words: Word[] = [];
  const errors: string[] = [];
  const clean = text.trim().replace(/^[/[]|[/\]]$/g, '').normalize('NFC');
  for (const token of clean.split(/\s+/).filter(Boolean)) {
    const trail = token.match(/[,?!.]+$/)?.[0] ?? '';
    const body = token.slice(0, token.length - trail.length).replace(/[.ː‿]/g, '');
    const phones: Phone[] = [];
    const marked = /[ˈˌ]/.test(body);
    let stress: number | null = null;
    let firstFull = true;
    for (let i = 0; i < body.length;) {
      if (body[i] === 'ˈ' || body[i] === 'ˌ') {
        stress = body[i] === 'ˈ' ? 1 : 2;
        i++;
        continue;
      }
      const hit = IPA.find(([ipa]) => body.startsWith(ipa, i));
      if (!hit) {
        errors.push(body[i]);
        i++;
        continue;
      }
      const [ipa, symbol, fixed] = hit;
      if (isVowel(symbol)) {
        const s = fixed ?? (marked ? stress ?? 0 : firstFull ? 1 : 0);
        if (fixed === undefined) firstFull = false;
        phones.push({symbol, stress: s});
        stress = null;
      } else {
        phones.push({symbol, stress: 0});
      }
      i += ipa.length;
    }
    if (!phones.length) continue;
    const boundary: Boundary = trail.includes('?') ? 'question' : trail.includes('!') ? 'exclaim' : trail.includes('.') ? 'period' : trail.includes(',') ? 'comma' : 'word';
    words.push({text: body, phones, source: 'phonemes', boundary});
  }
  if (words.length && words[words.length - 1].boundary === 'word') words[words.length - 1].boundary = 'period';
  return {words, errors};
}

/**
 * Direct phoneme input: ARPABET tokens separated by spaces; words separated
 * by "/" or "|"; punctuation , . ? ! as standalone tokens marks boundaries.
 * IPA is accepted too (detected by its letters; see parseIpaInput).
 */
export function parsePhonemeInput(text: string): {words: Word[]; errors: string[]} {
  if (isIpa(text)) return parseIpaInput(text);
  const words: Word[] = [];
  const errors: string[] = [];
  let current: Phone[] = [];
  const flush = (boundary: Boundary) => {
    if (current.length) words.push({text: current.map(p => p.symbol).join(' '), phones: current, source: 'phonemes', boundary});
    else if (words.length && boundary !== 'word') words[words.length - 1].boundary = boundary;
    current = [];
  };
  for (const raw of text.replace(/([,.?!/|])/g, ' $1 ').split(/\s+/).filter(Boolean)) {
    if (raw === '/' || raw === '|') flush('word');
    else if (raw === ',') flush('comma');
    else if (raw === '.') flush('period');
    else if (raw === '?') flush('question');
    else if (raw === '!') flush('exclaim');
    else {
      const p = parsePhone(raw);
      if (p) current.push(p);
      else errors.push(raw);
    }
  }
  flush('period');
  return {words, errors};
}

/** Split a word's phones into syllables (maximal legal onset). */
export function syllabify(phones: Phone[]): Phone[][] {
  const nuclei = phones.map((p, i) => (isVowel(p.symbol) ? i : -1)).filter(i => i >= 0);
  if (nuclei.length <= 1) return [phones];
  const ONSETS = new Set(['P R', 'P L', 'B R', 'B L', 'T R', 'T W', 'D R', 'D W', 'K R', 'K L', 'K W', 'G R', 'G L', 'F R', 'F L',
    'TH R', 'SH R', 'S P', 'S T', 'S K', 'S M', 'S N', 'S L', 'S W', 'S P R', 'S T R', 'S K R', 'S P L', 'S K W', 'P Y', 'B Y', 'K Y',
    'M Y', 'F Y', 'V Y', 'HH Y']);
  const cuts: number[] = [];
  for (let k = 0; k < nuclei.length - 1; k++) {
    const a = nuclei[k];
    const b = nuclei[k + 1];
    const cluster = phones.slice(a + 1, b).map(p => p.symbol);
    let onset = 0;
    for (let n = cluster.length; n >= 1; n--) {
      const tail = cluster.slice(cluster.length - n).join(' ');
      if (n === 1 && tail !== 'NG') {
        onset = 1;
        break;
      }
      if (ONSETS.has(tail)) {
        onset = n;
        break;
      }
    }
    cuts.push(b - onset);
  }
  const out: Phone[][] = [];
  let start = 0;
  for (const c of cuts) {
    out.push(phones.slice(start, c));
    start = c;
  }
  out.push(phones.slice(start));
  return out;
}
