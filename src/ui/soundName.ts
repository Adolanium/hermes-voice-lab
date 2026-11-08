/**
 * Name the sound the engine is currently making, from its actual state:
 * closures and turbulence identify consonants by place; otherwise the nearest
 * vowel by modeled F1/F2 (adult-female means, log-frequency distance).
 */
import {VOWEL_CALIBRATION, PHONEMES} from '../core/phonemes';
import type {Formant} from '../core/engine';

export interface SoundName {
  symbol: string;
  label: string;
  kind: 'vowel' | 'stop' | 'nasal' | 'fricative' | 'approximant' | 'silent';
}

const N = 44;
const TEETH = N - 4;

type Place = 'lips' | 'teeth' | 'ridge' | 'palate' | 'velum';

function placeOf(minIndex: number, tipPlace: number, tipClose: number, dorsumClose: number, lipOpen: number): Place {
  if (minIndex >= N - 3 || lipOpen < 0.08) return 'lips';
  if (tipClose > 0.5 && tipClose >= dorsumClose) return tipPlace < 0.12 ? 'teeth' : tipPlace < 0.6 ? 'ridge' : 'palate';
  if (minIndex >= TEETH - 6) return 'ridge';
  return 'velum';
}

// Match against the model's own calibrated vowels (what each preset actually produces).
const VOWELS = [...VOWEL_CALIBRATION.map(v => ({symbol: PHONEMES[v.symbol].ipa, example: PHONEMES[v.symbol].example, f1: v.model[0], f2: v.model[1]})),
  {symbol: 'ə', example: 'about', f1: 600, f2: 1700}];

export function nameSound(input: {
  params: Record<string, number>;
  formants: Formant[];
  frication: number;
  closed: boolean;
  nasalShare: number;
  minIndex: number;
  minArea: number;
  sounding: boolean;
}): SoundName {
  const p = input.params;
  const voiced = (p.voicing ?? 1) > 0.5;
  const place = placeOf(input.minIndex, p.tipPlace ?? 0.4, p.tipClose ?? 0, p.dorsumClose ?? 0, p.lipOpen ?? 0.6);
  const oralSealed = input.minArea < 0.004;
  if (oralSealed && input.nasalShare > 0.5) {
    const s = {lips: 'm', teeth: 'n', ridge: 'n', palate: 'n', velum: 'ŋ'}[place];
    return {symbol: s, label: `nasal · air through the nose`, kind: 'nasal'};
  }
  if (input.closed || oralSealed) {
    const s = {lips: voiced ? 'b' : 'p', teeth: voiced ? 'd' : 't', ridge: voiced ? 'd' : 't', palate: voiced ? 'd' : 't', velum: voiced ? 'g' : 'k'}[place];
    const where = {lips: 'lips', teeth: 'teeth', ridge: 'ridge', palate: 'tongue tip, behind the ridge', velum: 'soft palate'}[place];
    return {symbol: s, label: `sealed at the ${where} · no air out`, kind: 'stop'};
  }
  if (!input.sounding) return {symbol: '·', label: 'silent', kind: 'silent'};
  if ((p.voicing ?? 1) < 0.3 && input.frication < 0.2) return {symbol: 'h', label: 'open glottis · breath noise', kind: 'fricative'};
  if (input.frication > 0.25) {
    const s = {lips: voiced ? 'v' : 'f', teeth: voiced ? 'ð' : 'θ', ridge: voiced ? 'z' : 's', palate: voiced ? 'ʒ' : 'ʃ', velum: voiced ? 'ɣ' : 'x'}[place];
    return {symbol: s, label: `turbulence at the ${place === 'velum' ? 'soft palate' : place}`, kind: 'fricative'};
  }
  if ((p.rhotic ?? 0) > 0.6) return {symbol: 'ɹ', label: 'bunched r', kind: 'approximant'};
  if ((p.lateral ?? 0) > 0.5 && (p.tipClose ?? 0) > 0.8) return {symbol: 'l', label: 'air around the tongue tip', kind: 'approximant'};
  const [f1, f2] = [input.formants[0]?.frequency, input.formants[1]?.frequency];
  if (!f1 || !f2) return {symbol: '·', label: '', kind: 'silent'};
  let best = VOWELS[0];
  let bestD = Infinity;
  for (const v of VOWELS) {
    const d = Math.log(f1 / v.f1) ** 2 + 0.6 * Math.log(f2 / v.f2) ** 2;
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  const nasal = input.nasalShare > 0.15 ? ' · nasalized' : '';
  return {symbol: best.symbol + (input.nasalShare > 0.15 ? '̃' : ''), label: `nearest vowel · as in “${best.example}”${nasal}`, kind: 'vowel'};
}
