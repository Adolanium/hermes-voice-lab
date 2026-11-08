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
  pitch: 212, loudness: 0.72, tenseness: 0.28, breath: 0.25, vibratoDepth: 0.18, vibratoRate: 5.4,
  tractLength: 14.2, throat: 0.5, gain: 0.7, humanize: 0.45, space: 0.18,
  register: 0, fry: 0, growl: 0, twang: 0, pharynx: 1,
};

export const VOICE_PRESETS: VoicePreset[] = [
  {id: 'signature', name: 'Signature', description: 'Clear, warm, gently breathy — the default character voice.', voice: SIGNATURE},
  {id: 'warm', name: 'Warm', description: 'Lower, rounder and softer, with a wider throat.', voice: {...SIGNATURE, pitch: 194, tenseness: 0.2, breath: 0.3, tractLength: 14.8, throat: 0.72, space: 0.22}},
  {id: 'bright', name: 'Bright', description: 'Higher and firmer with a shorter tract.', voice: {...SIGNATURE, pitch: 238, tenseness: 0.5, breath: 0.14, tractLength: 13.6, throat: 0.34}},
  {id: 'airy', name: 'Airy', description: 'Soft and breathy, close to the microphone.', voice: {...SIGNATURE, pitch: 222, tenseness: 0.1, breath: 0.62, humanize: 0.5, space: 0.12}},
  {id: 'lyric', name: 'Lyric', description: 'Singing voice with fuller vibrato and a little hall.', voice: {...SIGNATURE, pitch: 330, tenseness: 0.42, breath: 0.18, vibratoDepth: 0.34, vibratoRate: 5.6, space: 0.38, loudness: 0.8}},
  {id: 'head', name: 'Head voice', description: 'Light falsetto: thin folds that never quite close, high and airy.', voice: {...SIGNATURE, pitch: 440, register: 1, tenseness: 0.3, breath: 0.2, vibratoDepth: 0.22}},
  {id: 'gravel', name: 'Gravel', description: 'Low and rough: the ventricular folds growl, with a little fry.', voice: {...SIGNATURE, pitch: 165, growl: 0.55, fry: 0.15, tenseness: 0.5, breath: 0.12, loudness: 0.82, tractLength: 14.8}},
  {id: 'twang', name: 'Twang', description: 'Bright and ringing: a narrowed epilarynx, firm and forward.', voice: {...SIGNATURE, pitch: 250, twang: 0.8, tenseness: 0.48, breath: 0.12, throat: 0.3}},
  {id: 'child', name: 'Child', description: 'A child body: a 12.6 cm tract and a high, light voice.', voice: {...SIGNATURE, pitch: 280, tractLength: 12.6, pharynx: 1.1, tenseness: 0.32, breath: 0.2, vibratoDepth: 0.12}},
  {id: 'tenor', name: 'Tenor', description: 'An adult male body (16.4 cm tract), singing high and bright.', voice: {...SIGNATURE, pitch: 196, tractLength: 16.4, pharynx: 1, tenseness: 0.42, breath: 0.12, throat: 0.45, vibratoDepth: 0.22}},
  {id: 'baritone', name: 'Baritone', description: 'An adult male body (16.4 cm tract) with a low, warm voice.', voice: {...SIGNATURE, pitch: 120, tractLength: 16.4, pharynx: 1, tenseness: 0.35, breath: 0.14, throat: 0.6, humanize: 0.4}},
  {id: 'alto', name: 'Alto', description: 'Darker, lower feminine voice.', voice: {...SIGNATURE, pitch: 176, tenseness: 0.3, breath: 0.22, tractLength: 15.2, throat: 0.62}},
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
