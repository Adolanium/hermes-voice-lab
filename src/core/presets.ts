/** Original voice and vowel presets. */
import type {Patch} from './params';
import {PHONEMES, SCHWA} from './phonemes';

export interface VoicePreset {
  id: string;
  name: string;
  description: string;
  voice: Patch;
}

/** The default character voice: an original adult feminine voice, clear and warm. */
export const SIGNATURE: Patch = {
  pitch: 212, loudness: 0.72, tenseness: 0.52, breath: 0.22, vibratoDepth: 0.18, vibratoRate: 5.4,
  tractLength: 14.2, throat: 0.5, gain: 0.7, humanize: 0.45, space: 0.18,
};

export const VOICE_PRESETS: VoicePreset[] = [
  {id: 'signature', name: 'Signature', description: 'Clear, warm, gently breathy — the default character voice.', voice: SIGNATURE},
  {id: 'warm', name: 'Warm', description: 'Lower, rounder and softer, with a wider throat.', voice: {...SIGNATURE, pitch: 194, tenseness: 0.44, breath: 0.28, tractLength: 14.8, throat: 0.72, space: 0.22}},
  {id: 'bright', name: 'Bright', description: 'Higher and firmer with a shorter tract.', voice: {...SIGNATURE, pitch: 238, tenseness: 0.68, breath: 0.12, tractLength: 13.6, throat: 0.34}},
  {id: 'airy', name: 'Airy', description: 'Soft and breathy, close to the microphone.', voice: {...SIGNATURE, pitch: 222, tenseness: 0.28, breath: 0.62, humanize: 0.5, space: 0.12}},
  {id: 'lyric', name: 'Lyric', description: 'Singing voice with fuller vibrato and a little hall.', voice: {...SIGNATURE, pitch: 330, tenseness: 0.6, breath: 0.16, vibratoDepth: 0.34, vibratoRate: 5.6, space: 0.38, loudness: 0.8}},
  {id: 'alto', name: 'Alto', description: 'Darker, lower feminine voice.', voice: {...SIGNATURE, pitch: 176, tenseness: 0.5, breath: 0.2, tractLength: 15.2, throat: 0.62}},
];

export interface ShapePreset {
  id: string;
  label: string;
  ipa: string;
  example: string;
  shape: Patch;
}

const closed = {tipClose: 0, dorsumClose: 0, velum: 0, lateral: 0, voicing: 1};
export const VOWEL_PRESETS: ShapePreset[] = [
  ...['IY', 'IH', 'EY', 'EH', 'AE', 'AA', 'AO', 'OW', 'UH', 'UW', 'AH', 'ER'].map(s => ({
    id: s.toLowerCase(), label: s, ipa: PHONEMES[s].ipa.replace('ɪ', 'ɪ'), example: PHONEMES[s].example,
    shape: {...closed, rhotic: 0, ...PHONEMES[s].target},
  })),
  {id: 'schwa', label: 'AX', ipa: 'ə', example: 'about', shape: {...closed, ...SCHWA}},
  {id: 'hum', label: 'M', ipa: 'm', example: 'hum', shape: {...closed, ...SCHWA, lipOpen: 0, velum: 1}},
];
