/** Writes plugin/runtime/catalog.json: parameters, presets and limits for the Python side. */
import {writeFileSync} from 'node:fs';
import {PARAMS, VOICE_PARAMS, SHAPE_PARAMS} from '../core/params';
import {VOICE_PRESETS, VOWEL_PRESETS} from '../core/presets';
import {LIMITS, newProject} from '../core/project';
import {PHONEMES} from '../core/phonemes';

const catalog = {
  params: PARAMS.filter(p => p.name !== 'gate').map(p => ({name: p.name, min: p.min, max: p.max, default: p.default, label: p.label, unit: p.unit, help: p.help})),
  voiceParams: VOICE_PARAMS,
  shapeParams: SHAPE_PARAMS,
  voicePresets: VOICE_PRESETS.map(p => ({id: p.id, name: p.name, description: p.description, voice: p.voice})),
  vowels: VOWEL_PRESETS.map(v => ({id: v.id, arpabet: v.label, ipa: v.ipa, example: v.example, shape: v.shape})),
  phonemes: Object.values(PHONEMES).map(p => ({symbol: p.symbol, ipa: p.ipa, example: p.example})),
  limits: LIMITS,
  defaultProject: newProject('Voice study'),
};
writeFileSync(process.argv[2], JSON.stringify(catalog, null, 1) + '\n');
