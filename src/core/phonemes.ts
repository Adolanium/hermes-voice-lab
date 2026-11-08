/**
 * English phoneme inventory (ARPABET symbols, as used by the CMU Pronouncing
 * Dictionary) with articulatory targets for the engine. Vowel targets come
 * from engine/src/bin/calibrate.rs, fitted to published adult-female formant
 * means; consonants constrain only the articulators they use, leaving the
 * rest to vowel-to-vowel coarticulation.
 */
import vowelTable from './vowels.generated.json';
import type {ParamName, Patch} from './params';

export type Manner = 'vowel' | 'diphthong' | 'stop' | 'nasal' | 'fricative' | 'affricate' | 'approximant' | 'aspirate' | 'trill' | 'click';

export interface Phoneme {
  symbol: string;
  ipa: string;
  manner: Manner;
  voiced: boolean;
  /** Inherent duration in ms (stressed context for vowels). */
  duration: number;
  /** Articulator targets that define the sound. */
  target: Patch;
  /** Second target for diphthongs. */
  offglide?: Patch;
  example: string;
}

type VowelRow = {params: Record<string, number>; model: number[]; target: number[]};
const V = vowelTable as Record<string, VowelRow>;
const vowel = (s: string): Patch => ({...(V[s].params as Patch), rhotic: V[s].params.rhotic ?? 0});

/** Reduced, centralised vowel used for unstressed AH (schwa). */
export const SCHWA: Patch = {tongueX: 0.5, tongueY: 0.32, jaw: 0.5, lipOpen: 0.62, lipRound: 0.12, throat: 0.4, rhotic: 0};

const P = (symbol: string, ipa: string, manner: Manner, voiced: boolean, duration: number, target: Patch, example: string, offglide?: Patch): Phoneme =>
  ({symbol, ipa, manner, voiced, duration, target, example, offglide});

export const PHONEMES: Record<string, Phoneme> = Object.fromEntries([
  P('AA', 'ɑ', 'vowel', true, 150, vowel('AA'), 'father'),
  P('AE', 'æ', 'vowel', true, 160, vowel('AE'), 'cat'),
  P('AH', 'ʌ', 'vowel', true, 100, vowel('AH'), 'cup'),
  P('AO', 'ɔ', 'vowel', true, 150, vowel('AO'), 'thought'),
  P('EH', 'ɛ', 'vowel', true, 115, vowel('EH'), 'bed'),
  P('ER', 'ɝ', 'vowel', true, 140, vowel('ER'), 'bird'),
  P('IH', 'ɪ', 'vowel', true, 90, vowel('IH'), 'sit'),
  P('IY', 'i', 'vowel', true, 130, vowel('IY'), 'see'),
  P('UH', 'ʊ', 'vowel', true, 95, vowel('UH'), 'book'),
  P('UW', 'u', 'vowel', true, 140, vowel('UW'), 'blue'),
  P('EY', 'eɪ', 'diphthong', true, 160, vowel('EY'), 'day', vowel('IY')),
  P('OW', 'oʊ', 'diphthong', true, 165, vowel('OW'), 'go', vowel('UH')),
  P('AY', 'aɪ', 'diphthong', true, 190, vowel('AA'), 'my', vowel('IH')),
  P('AW', 'aʊ', 'diphthong', true, 195, vowel('AA'), 'now', vowel('UH')),
  P('OY', 'ɔɪ', 'diphthong', true, 200, vowel('AO'), 'boy', vowel('IY')),
  P('P', 'p', 'stop', false, 85, {lipOpen: 0}, 'pen'),
  P('B', 'b', 'stop', true, 70, {lipOpen: 0}, 'bed'),
  P('T', 't', 'stop', false, 75, {tipPlace: 0.38, tipClose: 1}, 'top'),
  P('D', 'd', 'stop', true, 60, {tipPlace: 0.38, tipClose: 1}, 'day'),
  P('DX', 'ɾ', 'stop', true, 28, {tipPlace: 0.38, tipClose: 1}, 'butter'),
  P('K', 'k', 'stop', false, 80, {dorsumClose: 1}, 'cat'),
  P('G', 'g', 'stop', true, 70, {dorsumClose: 1}, 'go'),
  P('M', 'm', 'nasal', true, 75, {lipOpen: 0, velum: 1}, 'me'),
  P('N', 'n', 'nasal', true, 65, {tipPlace: 0.38, tipClose: 1, velum: 1}, 'no'),
  P('NG', 'ŋ', 'nasal', true, 80, {dorsumClose: 1, velum: 1}, 'sing'),
  P('F', 'f', 'fricative', false, 100, {lipOpen: 0.098, lipRound: 0}, 'fine'),
  P('V', 'v', 'fricative', true, 65, {lipOpen: 0.107, lipRound: 0}, 'very'),
  P('TH', 'θ', 'fricative', false, 100, {tipPlace: 0, tipClose: 0.8}, 'think'),
  P('DH', 'ð', 'fricative', true, 50, {tipPlace: 0, tipClose: 0.794}, 'this'),
  P('S', 's', 'fricative', false, 110, {tipPlace: 0.18, tipClose: 0.834, jaw: 0.3}, 'see'),
  P('Z', 'z', 'fricative', true, 85, {tipPlace: 0.18, tipClose: 0.828, jaw: 0.3}, 'zoo'),
  P('SH', 'ʃ', 'fricative', false, 115, {tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55, jaw: 0.3}, 'she'),
  P('ZH', 'ʒ', 'fricative', true, 90, {tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55, jaw: 0.3}, 'vision'),
  P('CH', 'tʃ', 'affricate', false, 115, {tipPlace: 0.7, tipClose: 1, lipRound: 0.5, jaw: 0.3}, 'chair'),
  P('JH', 'dʒ', 'affricate', true, 95, {tipPlace: 0.7, tipClose: 1, lipRound: 0.5, jaw: 0.3}, 'joy'),
  P('L', 'l', 'approximant', true, 70, {tipPlace: 0.38, tipClose: 1, lateral: 1, tongueX: 0.3, tongueY: 0.5}, 'love'),
  // Non-English sounds (not in ARPABET): a glottal stop, ejectives (the larynx is the
  // piston) and clicks (the tongue body pulls a vacuum between two seals).
  P('Q', 'ʔ', 'stop', true, 60, {glottal: 1}, 'uh-oh'),
  P('PE', 'pʼ', 'stop', false, 95, {lipOpen: 0, glottal: 1, larynx: 1}, 'ejective p'),
  P('TE', 'tʼ', 'stop', false, 95, {tipPlace: 0.38, tipClose: 1, glottal: 1, larynx: 1}, 'ejective t'),
  P('KE', 'kʼ', 'stop', false, 95, {dorsumClose: 1, glottal: 1, larynx: 1}, 'ejective k'),
  P('CB', 'ʘ', 'click', false, 85, {lipOpen: 0, dorsumClose: 1, suction: 1}, 'kiss click'),
  P('CD', 'ǀ', 'click', false, 85, {tipPlace: 0.05, tipClose: 1, dorsumClose: 1, suction: 1}, 'tsk'),
  P('CA', 'ǃ', 'click', false, 85, {tipPlace: 0.42, tipClose: 1, dorsumClose: 1, suction: 1}, 'cork pop'),
  // Trills (not in ARPABET): a rolled tongue-tip r, a lip trill and a uvular r.
  P('RR', 'r', 'trill', true, 110, {tipPlace: 0.42, tipClose: 0.9, trill: 1, jaw: 0.35}, 'Spanish perro'),
  P('BR', 'ʙ', 'trill', true, 160, {lipOpen: 0.04, lipRound: 0.25, trill: 1}, 'brr'),
  P('RU', 'ʀ', 'trill', true, 110, {dorsumClose: 0.9, tongueX: 0.02, tongueY: 0.55, trill: 1}, 'French rouge'),
  P('R', 'ɹ', 'approximant', true, 70, {rhotic: 1, lipRound: 0.7, tongueX: 0.15, tongueY: 0.85, lipOpen: 0.6}, 'red'),
  P('W', 'w', 'approximant', true, 65, {lipOpen: 0.15, lipRound: 1, tongueX: 0, tongueY: 0.9}, 'we'),
  P('Y', 'j', 'approximant', true, 60, {tongueX: 1, tongueY: 1, jaw: 0.35}, 'yes'),
  P('HH', 'h', 'aspirate', false, 65, {voicing: 0}, 'hat'),
].map(p => [p.symbol, p]));

/** Released friction phase of affricates. */
export const AFFRICATE_RELEASE: Record<string, Patch> = {
  CH: {tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55},
  JH: {tipPlace: 0.85, tipClose: 0.815, lipRound: 0.55},
};

export const VOWEL_SYMBOLS = Object.values(PHONEMES).filter(p => p.manner === 'vowel' || p.manner === 'diphthong').map(p => p.symbol);
export const CONSONANT_SYMBOLS = Object.values(PHONEMES).filter(p => !VOWEL_SYMBOLS.includes(p.symbol)).map(p => p.symbol);

export const isVowel = (symbol: string) => VOWEL_SYMBOLS.includes(symbol);

/** Parsed phone: symbol plus lexical stress (vowels only; 0 none, 1 primary, 2 secondary). */
export interface Phone {
  symbol: string;
  stress: number;
}

export function parsePhone(token: string): Phone | null {
  const m = /^([A-Z]{1,2})([012])?$/.exec(token.trim().toUpperCase());
  if (!m || !PHONEMES[m[1]]) return null;
  return {symbol: m[1], stress: isVowel(m[1]) ? Number(m[2] ?? 1) : 0};
}

/** Target for a vowel phone, using the reduced schwa for unstressed AH. */
export function vowelTarget(phone: Phone): Patch {
  if (phone.symbol === 'AH' && phone.stress === 0) return SCHWA;
  if (phone.symbol === 'ER' && phone.stress === 0) return {...PHONEMES.ER.target, rhotic: 0.7};
  return PHONEMES[phone.symbol].target;
}

/** Calibrated vowel table for documentation and UI (model vs target formants). */
export const VOWEL_CALIBRATION = Object.entries(V).map(([symbol, row]) => ({symbol, model: row.model, target: row.target}));

export const TONGUE_BODY: readonly ParamName[] = ['tongueX', 'tongueY', 'jaw', 'throat', 'rhotic'];
