// Golden tests: fixed renders and plans, fingerprinted. Any change to the sound or the
// plans fails here on purpose; if it was meant, re-bless with `BLESS=1 npm test` and
// say in the commit what changed and why.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {Engine, renderScore} from '../src/core/engine';
import {planSong, planSpeech, planSustain} from '../src/core/planner';
import {decodeLexicon} from '../src/core/text';
import {newProject, projectScore, SILLY_SONG} from '../src/core/project';
import {SIGNATURE, VOICE_PRESETS, VOWEL_PRESETS} from '../src/core/presets';

const root = process.cwd();
const wasm = new WebAssembly.Module(readFileSync(join(root, 'plugin/runtime/voice_lab_engine.wasm')));
const lexicon = decodeLexicon(gunzipSync(readFileSync(join(root, 'plugin/runtime/lexicon.txt.gz'))).toString('utf8'));
const file = join(root, 'tests/golden.json');
const sha = (data: ArrayBufferView | string) => createHash('sha256').update(typeof data === 'string' ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)).digest('hex').slice(0, 20);
const render = (score: Parameters<typeof renderScore>[1], patch = {}) => renderScore(new Engine(wasm, 48000, 1), score, patch)[0];
const aa = VOWEL_PRESETS.find(v => v.label === 'AA')!.shape;
const sustain = (patch: Record<string, number>) => {
  const voice = {...SIGNATURE, pitch: 220, ...patch};
  return render(planSustain(aa, voice, 0.8), voice);
};

const cases: Record<string, () => ArrayBufferView | string> = {
  'plan: speech': () => JSON.stringify(planSpeech('Please call me when you get home.', lexicon).segments.map(s => [s.symbol, s.stress, +s.start.toFixed(4), +s.end.toFixed(4)])),
  'plan: song': () => JSON.stringify(planSong(SILLY_SONG.notes.slice(0, 12), SILLY_SONG.lyrics, lexicon, {bpm: SILLY_SONG.bpm, style: 'cartoon'}).segments.map(s => [s.symbol, +s.start.toFixed(4), +s.end.toFixed(4)])),
  'audio: speech': () => render(planSpeech('Please call me when you get home.', lexicon).score),
  'audio: song': () => render(planSong(SILLY_SONG.notes.slice(0, 12), SILLY_SONG.lyrics, lexicon, {bpm: SILLY_SONG.bpm, style: 'cartoon'}).score),
  'audio: beat': () => {
    const p = newProject();
    return render(projectScore({...p, mode: 'beat'}, lexicon, 'beat').score, p.voice);
  },
  'audio: clicks, ejectives, trills': () => render(planSpeech('/ǃa kʼa pero brr ʔo/', lexicon, {phonemes: true}).score),
  'audio: voice qualities': () => {
    const parts = [{}, {register: 1}, {fry: 1}, {growl: 1}, {twang: 1}].map(sustain);
    const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { all.set(p, at); at += p.length; }
    return all;
  },
  'audio: bodies and recording chain': () => {
    const tenor = VOICE_PRESETS.find(v => v.id === 'tenor')!.voice;
    const a = sustain({...tenor, pitch: 196});
    const b = sustain({mic: 0, eqHigh: 6, comp: 0.6, drive: 0.4});
    const all = new Float32Array(a.length + b.length);
    all.set(a);
    all.set(b, a.length);
    return all;
  },
};

test('golden renders and plans are unchanged (BLESS=1 to accept a deliberate change)', () => {
  const now = Object.fromEntries(Object.entries(cases).map(([name, make]) => [name, sha(make())]));
  if (process.env.BLESS || !existsSync(file)) {
    writeFileSync(file, JSON.stringify(now, null, 1) + '\n');
    return;
  }
  const blessed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  const changed = Object.keys(now).filter(k => now[k] !== blessed[k]);
  assert.deepEqual(changed, [], `changed: ${changed.join(', ')}. If this was meant, run BLESS=1 npm test and explain the change in the commit.`);
});
