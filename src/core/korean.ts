/**
 * Korean front end: Hangul to phones. Each Hangul block is one syllable (one note when sung).
 * A block is split into its initial consonant, vowel and final consonant; the standard sound
 * rules are applied where one block meets the next inside a word (a final moves over before a
 * vowel, stops become nasals before nasals, ㅎ merges into aspiration, lax consonants turn tense
 * after a stop, ㄴ and ㄹ meet as [ll], ㄷ ㅌ soften before 이); then each letter becomes a phone
 * with the marks that tell Korean's three kinds of stop apart.
 */
import type {Phone} from './phonemes';

const INITIALS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const MEDIALS = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const FINALS = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

export const HANGUL = /[가-힣]/;
export const isHangul = (text: string) => HANGUL.test(text);

interface Block {
  initial: string;
  vowel: string;
  /** Final consonant letters as written (one or two). */
  final: string[];
  text: string;
}

function decompose(word: string): Block[] {
  const out: Block[] = [];
  for (const ch of word) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) continue;
    out.push({initial: INITIALS[Math.floor(code / 588)], vowel: MEDIALS[Math.floor(code / 28) % 21], final: [...FINALS[code % 28]], text: ch});
  }
  return out;
}

const ASPIRATE: Record<string, string> = {ㄱ: 'ㅋ', ㄷ: 'ㅌ', ㅂ: 'ㅍ', ㅈ: 'ㅊ'};
const TENSE: Record<string, string> = {ㄱ: 'ㄲ', ㄷ: 'ㄸ', ㅂ: 'ㅃ', ㅅ: 'ㅆ', ㅈ: 'ㅉ'};
/** What a final is at the end of a syllable: one of seven sounds. */
const CODA: Record<string, string> = {
  ㄱ: 'ㄱ', ㄲ: 'ㄱ', ㅋ: 'ㄱ', ㄷ: 'ㄷ', ㅌ: 'ㄷ', ㅅ: 'ㄷ', ㅆ: 'ㄷ', ㅈ: 'ㄷ', ㅊ: 'ㄷ', ㅎ: 'ㄷ',
  ㅂ: 'ㅂ', ㅍ: 'ㅂ', ㄴ: 'ㄴ', ㅁ: 'ㅁ', ㅇ: 'ㅇ', ㄹ: 'ㄹ',
};
/** Which letter of a two-letter final is said when nothing follows it. */
const CLUSTER: Record<string, string> = {ㄱㅅ: 'ㄱ', ㄴㅈ: 'ㄴ', ㄴㅎ: 'ㄴ', ㄹㄱ: 'ㄱ', ㄹㅁ: 'ㅁ', ㄹㅂ: 'ㄹ', ㄹㅅ: 'ㄹ', ㄹㅌ: 'ㄹ', ㄹㅍ: 'ㅂ', ㄹㅎ: 'ㄹ', ㅂㅅ: 'ㅂ'};
const NASAL_OF: Record<string, string> = {ㄱ: 'ㅇ', ㄷ: 'ㄴ', ㅂ: 'ㅁ'};
const Y_VOWELS = new Set([...'ㅣㅑㅒㅕㅖㅛㅠ']);

/** Apply the sound rules between neighbouring blocks, in place. */
function soundRules(blocks: Block[]): void {
  for (let k = 0; k < blocks.length; k++) {
    const a = blocks[k];
    const b = blocks[k + 1];
    if (!b) {
      a.final = a.final.length ? [CODA[CLUSTER[a.final.join('')] ?? a.final[0]]] : [];
      continue;
    }
    if (!a.final.length) continue;
    const last = a.final[a.final.length - 1];
    if (b.initial === 'ㅇ') {
      // A vowel follows: the final (or the second letter of two) is said as its initial.
      if (last === 'ㅇ') continue;
      if (last === 'ㅎ') {
        // ㅎ is silent here, and a consonant written before it moves over (싫어 → 시러).
        a.final.pop();
        if (a.final.length) b.initial = a.final.pop()!;
      } else {
        a.final.pop();
        // ㄷ ㅌ before 이 are said as ㅈ ㅊ (같이 → 가치).
        b.initial = b.vowel === 'ㅣ' && last === 'ㄷ' ? 'ㅈ' : b.vowel === 'ㅣ' && last === 'ㅌ' ? 'ㅊ' : last;
        // After a stop that stays behind, ㅅ is tense (값이 → 갑씨).
        if (a.final.length && b.initial === 'ㅅ' && CODA[a.final[0]] !== 'ㄹ' && CODA[a.final[0]] !== 'ㄴ') b.initial = 'ㅆ';
      }
      if (a.final.length) a.final = [CODA[a.final[0]]];
      continue;
    }
    // ㅎ as (part of) the final: it aspirates a following lax stop, tenses ㅅ, and is lost before ㄴ.
    if (last === 'ㅎ') {
      a.final.pop();
      if (ASPIRATE[b.initial]) b.initial = ASPIRATE[b.initial];
      else if (b.initial === 'ㅅ') b.initial = 'ㅆ';
      else if (!a.final.length && b.initial === 'ㄴ') a.final = ['ㄴ'];
    }
    let coda = a.final.length ? CODA[CLUSTER[a.final.join('')] ?? a.final[0]] : '';
    const stop = coda === 'ㄱ' || coda === 'ㄷ' || coda === 'ㅂ';
    if (stop && b.initial === 'ㅎ') {
      // A stop and ㅎ merge into one aspirated stop (축하 → 추카); ㄷ + 히 gives 치.
      const written = a.final.length === 1 && a.final[0] === 'ㅈ' ? 'ㅈ' : coda;
      b.initial = coda === 'ㄷ' && b.vowel === 'ㅣ' ? 'ㅊ' : ASPIRATE[written] ?? ASPIRATE[coda];
      coda = '';
    } else if (stop && TENSE[b.initial]) {
      b.initial = TENSE[b.initial];
    } else if (stop && (b.initial === 'ㄴ' || b.initial === 'ㅁ')) {
      coda = NASAL_OF[coda];
    } else if (b.initial === 'ㄹ' && (stop || coda === 'ㅁ' || coda === 'ㅇ')) {
      // ㄹ after anything but ㄴ or ㄹ is said as ㄴ, and a stop before it turns nasal (독립 → 동닙).
      b.initial = 'ㄴ';
      if (stop) coda = NASAL_OF[coda];
    } else if ((coda === 'ㄴ' && b.initial === 'ㄹ') || (coda === 'ㄹ' && b.initial === 'ㄴ')) {
      coda = 'ㄹ';
      b.initial = 'ㄹ';
    }
    a.final = coda ? [coda] : [];
  }
}

const VOWELS: Record<string, string[]> = {
  ㅏ: ['AA'], ㅐ: ['EH'], ㅑ: ['Y', 'AA'], ㅒ: ['Y', 'EH'], ㅓ: ['EO'], ㅔ: ['E'], ㅕ: ['Y', 'EO'], ㅖ: ['Y', 'E'], ㅗ: ['O'],
  ㅘ: ['W', 'AA'], ㅙ: ['W', 'EH'], ㅚ: ['W', 'E'], ㅛ: ['Y', 'O'], ㅜ: ['U'], ㅝ: ['W', 'EO'], ㅞ: ['W', 'E'], ㅟ: ['W', 'IY'],
  ㅠ: ['Y', 'U'], ㅡ: ['UU'], ㅢ: ['IY'], ㅣ: ['IY'],
};
const PLACE: Record<string, [string, string]> = {
  // [voiceless symbol, voiced symbol]
  ㄱ: ['K', 'G'], ㄲ: ['K', 'G'], ㅋ: ['K', 'G'], ㄷ: ['T', 'D'], ㄸ: ['T', 'D'], ㅌ: ['T', 'D'],
  ㅂ: ['P', 'B'], ㅃ: ['P', 'B'], ㅍ: ['P', 'B'], ㅈ: ['CC', 'JC'], ㅉ: ['CC', 'JC'], ㅊ: ['CC', 'JC'],
};
/** Voice onset after the release (s): lax, tense and aspirated stops differ mostly in this. */
const VOT = {lax: 0.03, tense: 0.008, aspirated: 0.095};

function initialPhones(letter: string, vowel: string, voicedBefore: boolean, afterL: boolean): Phone[] {
  const c = (symbol: string, marks: Partial<Phone> = {}): Phone => ({symbol, stress: 0, ...marks});
  if (PLACE[letter]) {
    const [voiceless, voiced] = PLACE[letter];
    if ('ㄲㄸㅃㅉ'.includes(letter)) return [c(voiceless, {aspirated: false, vot: VOT.tense})];
    if ('ㅋㅌㅍㅊ'.includes(letter)) return [c(voiceless, {aspirated: true, vot: VOT.aspirated})];
    // A lax stop is voiced between voiced sounds and lightly aspirated at the start of a word.
    return voicedBefore ? [c(voiced)] : [c(voiceless, {aspirated: true, vot: VOT.lax})];
  }
  switch (letter) {
    case 'ㅅ': case 'ㅆ': return [c(Y_VOWELS.has(vowel) || vowel === 'ㅟ' ? 'SC' : 'S')];
    case 'ㄴ': return [c('N')];
    case 'ㅁ': return [c('M')];
    case 'ㅎ': return [c('HH')];
    // ㄹ is a tap, and a long [l] after another ㄹ.
    case 'ㄹ': return [c(afterL ? 'L' : 'DX')];
    default: return [];
  }
}

const FINAL_PHONE: Record<string, Phone> = {
  ㄱ: {symbol: 'K', stress: 0, unreleased: true}, ㄷ: {symbol: 'T', stress: 0, unreleased: true}, ㅂ: {symbol: 'P', stress: 0, unreleased: true},
  ㄴ: {symbol: 'N', stress: 0}, ㅁ: {symbol: 'M', stress: 0}, ㅇ: {symbol: 'NG', stress: 0}, ㄹ: {symbol: 'L', stress: 0},
};

export interface KoreanSyllable {
  /** The Hangul block as written. */
  text: string;
  phones: Phone[];
}

/** One Hangul word as syllables of phones, after the sound rules. Other characters are skipped. */
export function koreanSyllables(word: string): KoreanSyllable[] {
  const blocks = decompose(word);
  soundRules(blocks);
  return blocks.map((b, k) => {
    const before = blocks[k - 1];
    const beforeCoda = before?.final[0];
    const voicedBefore = !!before && (!beforeCoda || 'ㄴㅁㅇㄹ'.includes(beforeCoda));
    const vowel = VOWELS[b.vowel].map((symbol, i, all): Phone => ({symbol, stress: i === all.length - 1 ? (k === 0 ? 1 : 2) : 0}));
    const phones = [...initialPhones(b.initial, b.vowel, voicedBefore, beforeCoda === 'ㄹ'), ...vowel, ...b.final.map(f => ({...FINAL_PHONE[f]}))];
    return {text: b.text, phones};
  });
}

/** All the phones of a Hangul word. */
export function koreanPhones(word: string): Phone[] {
  return koreanSyllables(word).flatMap(s => s.phones);
}
