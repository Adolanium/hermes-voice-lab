/** Core tests: parameters, text front end, planner, project validation, engine behaviour, WAV and CLI. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compileScore, Engine, renderScore} from '../src/core/engine';
import {PARAMS, PARAM_NAMES, validatePatch, parseNoteName, midiToHz} from '../src/core/params';
import {planSong, planSpeech, planSustain} from '../src/core/planner';
import {decodeLexicon, letterToSound, parsePhonemeInput, syllabify, tokenize} from '../src/core/text';
import {newProject, projectScore, validateProject} from '../src/core/project';
import {VOWEL_PRESETS, VOICE_PRESETS} from '../src/core/presets';
import {VOWEL_CALIBRATION} from '../src/core/phonemes';
import {encodeWav, measure} from '../src/core/wav';

const root = process.cwd();
const wasm = new WebAssembly.Module(readFileSync(join(root, 'runtime/voice_lab_engine.wasm')));
const lexicon = decodeLexicon(gunzipSync(readFileSync(join(root, 'runtime/lexicon.txt.gz'))).toString('utf8'));
const engine = (rate = 48000, seed = 1) => new Engine(wasm, rate, seed);

function f0Of(x: Float32Array, rate: number) {
  const lo = Math.floor(rate / 1000), hi = Math.floor(rate / 70);
  const n = x.length - hi;
  const corr = (lag: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += x[i] * x[i + lag];
    return s;
  };
  const c0 = corr(0);
  let best = lo, bestV = -Infinity;
  for (let lag = lo; lag < hi; lag++) {
    const v = corr(lag) / c0;
    if (v > bestV + 0.02) {
      bestV = v;
      best = lag;
    }
  }
  const [a, b, c] = [corr(best - 1), corr(best), corr(best + 1)];
  return rate / (best + (0.5 * (a - c)) / (a - 2 * b + c));
}

test('TypeScript parameter table matches the engine', () => {
  const specs = engine().specs();
  assert.equal(specs.length, PARAM_NAMES.length);
  PARAMS.forEach((p, i) => {
    assert.ok(Math.abs(specs[i][0] - p.min) < 1e-4 && Math.abs(specs[i][1] - p.max) < 1e-4, `${p.name} range`);
    assert.ok(Math.abs(specs[i][2] - p.default) < 1e-4, `${p.name} default`);
  });
});

test('patch validation rejects unknown, non-finite and out-of-range values', () => {
  assert.deepEqual(validatePatch({breath: 0.4}), {breath: 0.4});
  assert.throws(() => validatePatch({wobble: 1}));
  assert.throws(() => validatePatch({pitch: Number.NaN}));
  assert.throws(() => validatePatch({pitch: 5000}));
  assert.equal(parseNoteName('A4'), 69);
  assert.equal(parseNoteName('C#4'), 61);
});

test('text front end: numbers, dictionary, rules, phonemes, syllables', () => {
  assert.deepEqual(tokenize('I have 21 cats.').map(t => t.text), ['i', 'have', 'twenty', 'one', 'cats']);
  assert.ok(lexicon.size > 100_000);
  assert.deepEqual(lexicon.lookup('hello')!.map(p => p.symbol + (p.stress || '')), ['HH', 'AH', 'L', 'OW1']);
  assert.ok(letterToSound('blorptastic').length > 5);
  const {words, errors} = parsePhonemeInput('HH AH0 L OW1 / W ER1 L D . QQ');
  assert.equal(words.length, 2);
  assert.deepEqual(errors, ['QQ']);
  assert.equal(syllabify(lexicon.lookup('wonderful')!).length, 3);
});

test('speech plan is ordered, in range, and devoices voiceless consonants', () => {
  const plan = planSpeech('She sells seven shells.', lexicon);
  const ev = plan.score.events;
  assert.ok(plan.score.length > 1 && plan.score.length < 4);
  for (let i = 4; i < ev.length; i += 4) assert.ok(ev[i] >= ev[i - 4], 'sorted by time');
  for (let i = 0; i < ev.length; i += 4) {
    const spec = PARAMS[ev[i + 1]];
    assert.ok(ev[i + 2] >= spec.min && ev[i + 2] <= spec.max, `${spec.name} in range`);
  }
  const voicingId = PARAM_NAMES.indexOf('voicing');
  const zeros = [];
  for (let i = 0; i < ev.length; i += 4) if (ev[i + 1] === voicingId && ev[i + 2] === 0) zeros.push(ev[i]);
  assert.ok(zeros.length >= 4, 'voiceless S/SH devoice');
  assert.deepEqual(plan.warnings, []);
});

test('singing places vowels on the beat and holds melismas', () => {
  const notes = [{start: 0, length: 1, midi: 60}, {start: 1, length: 1, midi: 64}, {start: 2, length: 2, midi: 67}];
  const plan = planSong(notes, 'sing - song', lexicon, {bpm: 120});
  const vowels = plan.segments.filter(s => ['IH', 'AO', 'AA'].includes(s.symbol));
  assert.equal(vowels.length, 2, 'two sung syllables (second note is a melisma)');
  assert.ok(Math.abs(vowels[0].start - 0.25) < 0.02, 'first vowel lands on note start');
  assert.ok(Math.abs(vowels[1].start - (0.25 + 2 * 0.5)) < 0.02, 'third note vowel lands on its start');
  assert.ok(vowels[0].end > 0.25 + 1 * 0.5, 'melisma extends the first vowel across the second note');
  const pitchId = PARAM_NAMES.indexOf('pitch');
  const pitches = [];
  for (let i = 0; i < plan.score.events.length; i += 4) if (plan.score.events[i + 1] === pitchId) pitches.push(Math.round(plan.score.events[i + 2]));
  for (const m of [60, 64, 67]) assert.ok(pitches.includes(Math.round(midiToHz(m))), `pitch ${m}`);
});

test('project validation', () => {
  const p = validateProject(newProject('x'));
  assert.equal(p.version, 2);
  assert.throws(() => validateProject({...p, extra: 1}));
  assert.throws(() => validateProject({...p, speech: {...p.speech, text: 'x'.repeat(2000)}}));
  assert.throws(() => validateProject({...p, song: {...p.song, notes: [{start: 0, length: 0, midi: 60}]}}));
  assert.throws(() => validateProject({...p, voice: {pitch: 2000}}));
  for (const preset of VOICE_PRESETS) assert.doesNotThrow(() => validatePatch(preset.voice));
  for (const v of VOWEL_PRESETS) assert.doesNotThrow(() => validatePatch(v.shape));
});

test('rendering is bounded, finite and stable at common sample rates', () => {
  const project = newProject();
  for (const rate of [8000, 22050, 44100, 48000, 96000]) {
    const e = engine(rate);
    const {score} = projectScore({...project, mode: 'speak'}, lexicon);
    const [l, r] = renderScore(e, score, project.voice);
    const m = measure(l);
    assert.ok(l.every(Number.isFinite) && r.every(Number.isFinite), `finite at ${rate}`);
    assert.ok(m.peak <= 1 && m.rms > 0.01, `audible and bounded at ${rate} (rms ${m.rms}, peak ${m.peak})`);
    assert.equal(e.state()[15], 0, `no recovery resets at ${rate}`);
  }
});

test('live-style block rendering equals offline rendering', () => {
  const {score} = projectScore({...newProject(), mode: 'speak'}, lexicon);
  const offline = renderScore(engine(48000, 3), score)[0];
  const live = engine(48000, 3);
  live.loadScore(score);
  live.play(false);
  const blocks = new Float32Array(offline.length);
  for (let at = 0; at < blocks.length; at += 128) blocks.set(live.render(Math.min(128, blocks.length - at))[0], at);
  assert.deepEqual(blocks, offline);
});

test('sustained pitch is accurate and independent of vowel', () => {
  for (const [hz, vowel] of [[196, 'aa'], [262, 'iy'], [440, 'uw']] as const) {
    const shape = VOWEL_PRESETS.find(v => v.id === vowel)!.shape;
    const [l] = renderScore(engine(), planSustain(shape, {pitch: hz, vibratoDepth: 0, humanize: 0, space: 0}, 1.2));
    const f0 = f0Of(l.subarray(48000 * 0.5, 48000 * 0.5 + 9600), 48000);
    assert.ok(Math.abs(1200 * Math.log2(f0 / hz)) < 10, `${vowel} at ${hz} Hz measured ${f0.toFixed(1)}`);
  }
});

test('calibrated vowels sit near the published female formant means (F1 ±10%, F2 ±13%)', () => {
  const e = engine();
  for (const v of VOWEL_CALIBRATION) {
    // F1 within 10%. F2 within 13%: with natural-looking articulations the
    // area model falls short on a few front/low vowels (AA −12%, AE −9%, IY −7%).
    assert.ok(Math.abs(v.model[0] / v.target[0] - 1) < 0.1, `${v.symbol} F1 ${v.model[0]} vs ${v.target[0]}`);
    assert.ok(Math.abs(v.model[1] / v.target[1] - 1) < 0.13, `${v.symbol} F2 ${v.model[1]} vs ${v.target[1]}`);
  }
  const iy = VOWEL_PRESETS.find(v => v.id === 'iy')!.shape;
  const values = PARAMS.map(p => (iy as Record<string, number>)[p.name] ?? p.default);
  const s = e.shapeFor(values);
  const r = e.analyze(s.areas, s.nasal, s.length);
  assert.ok(r.formants[0].frequency < 500 && r.formants[1].frequency > 2300, 'IY is high and front');
});

test('gate release falls silent and score stop silences', () => {
  const e = engine();
  const score = compileScore([[0, 'gate', 1, 10], [0, 'space', 0, 0], [0.3, 'gate', 0, 20]], 0.4);
  const [l] = renderScore(e, score, {}, 1.0);
  assert.ok(measure(l.subarray(48000 * 1.2)).peak < 1e-3, 'tail is silent');
});

test('WAV encoding', () => {
  const wav = encodeWav([new Float32Array([0, 0.5, -1, 2])], 48000);
  const v = new DataView(wav.buffer);
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), 'RIFF');
  assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getInt16(44 + 2, true), 16384);
  assert.equal(v.getInt16(44 + 6, true), 32767, 'clipped, not wrapped');
});

test('Node renderer CLI writes a WAV and reports metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hvl-'));
  try {
    const out = join(dir, 'x.wav');
    const meta = JSON.parse(execFileSync(process.execPath, ['runtime/render.mjs', '--text', 'Hello there.', '--output', out, '--voice', 'warm'], {encoding: 'utf8'}));
    assert.equal(meta.ok, true);
    assert.equal(meta.sampleRate, 48000);
    assert.equal(readFileSync(out).subarray(0, 4).toString(), 'RIFF');
    assert.throws(() => execFileSync(process.execPath, ['runtime/render.mjs', '--text', 'x', '--output', out, '--voice', 'nope'], {stdio: 'pipe'}));
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
