import test from 'node:test';
import assert from 'node:assert/strict';
import {PerformanceController, type PerformanceAudio, type Syllable} from '../src/performance/controller';
import type {Score} from '../src/core/engine';
import {midiToHz} from '../src/core/params';

const score: Score = {events: new Float32Array(), length: 1};
function setup(cold = false, nextSyllable?: () => Syllable) {
  const calls: Array<[string, ...unknown[]]> = [];
  let ready!: (ok: boolean) => void;
  const startup = new Promise<boolean>(resolve => { ready = resolve; });
  const audio: PerformanceAudio = {
    running: !cold,
    claim: () => { calls.push(['claim']); },
    patch: p => { calls.push(['patch', p]); },
    set: (n, v) => { calls.push([n, v]); },
    stopScore: () => { calls.push(['stopScore']); },
    silence: () => { calls.push(['silence']); },
    play: s => { calls.push(['play', s]); },
    playDuet: s => { calls.push(['duet', s]); },
  };
  const controller = new PerformanceController(audio, {ensureAudio: () => startup, patch: () => ({pitch: 212, tongueX: 0.4}), nextSyllable});
  return {controller, calls, ready, audio};
}
const gates = (calls: Array<[string, ...unknown[]]>) => calls.filter(c => c[0] === 'gate').map(c => c[1]);

test('portrait and keys release only their own gate ownership', () => {
  const {controller: c, calls} = setup();
  c.noteOn('key', 60); c.touch('portrait:1', true); c.touch('portrait:1', false);
  assert.deepEqual(gates(calls), [1]);
  c.noteOff('key');
  assert.deepEqual(gates(calls), [1, 0]);
  c.touch('portrait:1', true); c.noteOn('key', 62); c.noteOff('key');
  assert.equal(gates(calls).at(-1), 1);
  c.touch('portrait:1', false);
  assert.equal(gates(calls).at(-1), 0);
});
test('latch setting alone does not block portrait; sustain survives touch release', () => {
  const {controller: c, calls} = setup();
  c.setLatch(true); c.touch('portrait', true); c.touch('portrait', false);
  assert.deepEqual(gates(calls), [1, 0]);
  c.sustain(true); c.touch('portrait', true); c.touch('portrait', false);
  assert.equal(gates(calls).at(-1), 1);
  c.setLatch(false);
  assert.equal(gates(calls).at(-1), 0);
});
test('legato handoff is atomic and duplicate MIDI pitches have independent owners', () => {
  const {controller: c, calls} = setup();
  c.noteOn('pointer:1', 60); c.noteOn('computer:a', 60); c.noteOff('computer:a');
  c.noteOn('pointer:1', 64);
  assert.deepEqual(gates(calls), [1]);
  assert.deepEqual(calls.at(-1), ['pitch', midiToHz(64)]);
  c.noteOn('pointer:2', 67); c.noteOff('pointer:2');
  assert.deepEqual(calls.at(-1), ['pitch', midiToHz(64)]);
  c.noteOff('pointer:1');
  assert.deepEqual(gates(calls), [1, 0]);
});
test('quick releases and Stop cancel cold startup; surviving source starts once', async () => {
  for (const kind of ['key', 'touch', 'stop']) {
    const {controller: c, calls, ready} = setup(true);
    if (kind === 'key') { c.noteOn('key', 60); c.noteOff('key'); }
    if (kind === 'touch') { c.touch('portrait', true); c.touch('portrait', false); }
    if (kind === 'stop') { c.play({score}); c.stop(); }
    ready(true); await Promise.resolve();
    assert.deepEqual(gates(calls), []);
    assert.equal(calls.some(v => v[0] === 'play'), false);
  }
  const {controller: c, calls, ready} = setup(true);
  c.noteOn('key', 60); c.touch('portrait', true); c.noteOff('key');
  ready(true); await Promise.resolve();
  assert.deepEqual(gates(calls), [1]);
});
test('preview timer cannot silence a later note or score', async () => {
  for (const playback of [false, true]) {
    const {controller: c, calls} = setup();
    c.preview(60, 5);
    if (playback) c.play({score}); else c.noteOn('key', 64);
    const count = calls.length;
    await new Promise(r => setTimeout(r, 15));
    assert.equal(calls.length, count);
    c.stop();
  }
});
test('playback replaces held sources; stale release cannot stop it', () => {
  const {controller: c, calls} = setup();
  c.noteOn('key', 60); c.play({score});
  const count = calls.length;
  c.noteOff('key'); c.touch('portrait', false);
  assert.equal(calls.length, count);
  assert.equal(c.getSnapshot().playback, true);
  c.noteOn('key', 62);
  assert.equal(c.getSnapshot().playback, false);
  assert.equal(gates(calls).at(-1), 1);
});
test('live lyrics belong to the actual live performance and restore held syllables', () => {
  let i = 0;
  const {controller: c} = setup(false, () => ({text: ['one', 'two'][i++], phones: [{symbol: 'AA', stress: 1}]}));
  c.noteOn('a', 60);
  assert.equal(c.getSnapshot().cues[0].text, 'one');
  c.noteOn('b', 62);
  assert.equal(c.getSnapshot().cues[0].text, 'two');
  c.noteOff('b');
  assert.equal(c.getSnapshot().cues[0].text, 'one');
  c.play({score});
  assert.deepEqual(c.getSnapshot().cues, []);
});

test('articulation release restores the latest shape and overlapping overrides', () => {
  const {controller: c, calls} = setup();
  c.noteOn('key', 60);
  c.articulation('hum', {lipOpen: 0, velum: 1});
  c.articulation('seal', {lipOpen: 0, velum: 0});
  c.patch({tongueX: 0.8});
  c.articulation('seal', null);
  assert.deepEqual(calls.at(-1), ['patch', {lipOpen: 0, velum: 1}]);
  c.articulation('hum', null);
  const patch = calls.at(-1)![1] as Record<string, number>;
  assert.ok(patch.lipOpen > 0);
  assert.equal(patch.velum, 0);
  assert.equal(patch.tongueX, undefined, 'release leaves unrelated edits alone');
  assert.deepEqual(gates(calls), [1]);
});
test('new vowel targets survive a held articulation and release', () => {
  const calls: unknown[] = [];
  let base = {lipOpen: 0.6, velum: 0};
  const {audio} = setup();
  audio.patch = p => { calls.push(p); };
  const c = new PerformanceController(audio, {ensureAudio: async () => true, patch: () => base});
  c.noteOn('key', 60); c.articulation('hum', {lipOpen: 0, velum: 1});
  base = {lipOpen: 0.9, velum: 0}; c.patch(base);
  assert.deepEqual(calls.at(-1), {lipOpen: 0, velum: 1});
  c.articulation('hum', null);
  assert.deepEqual(calls.at(-1), base);
});
test('articulation cold start, cancellation and Stop do not leave trill engaged', async () => {
  const {controller: c, calls, ready} = setup(true);
  c.noteOn('key', 60); c.articulation('roll', {trill: 1}); c.articulation('roll', null);
  ready(true); await Promise.resolve();
  assert.ok(!calls.some(([kind, p]) => kind === 'patch' && (p as Record<string, number>).trill === 1));
  const warm = setup();
  warm.controller.noteOn('key', 60); warm.controller.articulation('roll', {trill: 1}); warm.controller.stop();
  assert.ok(warm.calls.some(([kind, p]) => kind === 'patch' && (p as Record<string, number>).trill === 0));
});

test('a preview that expires during startup stays silent even if latch changes', async () => {
  const {controller: c, calls, ready} = setup(true);
  c.preview(60, 5); c.setLatch(true);
  await new Promise(r => setTimeout(r, 15));
  ready(true); await Promise.resolve();
  assert.deepEqual(gates(calls), []);
  assert.deepEqual(c.getSnapshot().notes, []);
});
test('pad touch and keyboard activation release independently', () => {
  const {controller: c, calls} = setup();
  c.touch('vowel-pad:key:Space', true); c.touch('vowel-pad:pointer:1', true);
  c.touch('vowel-pad:pointer:1', false);
  assert.deepEqual(gates(calls), [1]);
  c.touch('vowel-pad:key:Space', false);
  assert.deepEqual(gates(calls), [1, 0]);
});

test('with an articulation held, a lyric note sets its vowel shape instead of singing consonants', () => {
  const {controller: c, calls} = setup(false, () => ({text: 'sing', phones: [{symbol: 'S', stress: 0}, {symbol: 'IH', stress: 1}, {symbol: 'NG', stress: 0}]}));
  c.articulation('hum', {lipOpen: 0, velum: 1});
  c.noteOn('key', 60);
  assert.equal(calls.some(v => v[0] === 'play'), false, 'no syllable score while humming');
  const patch = calls.filter(v => v[0] === 'patch').at(-1)![1] as Record<string, number>;
  assert.equal(patch.velum, 1, 'the articulation still owns the velum');
  assert.equal(patch.pitch, midiToHz(60));
  assert.deepEqual(gates(calls), [1]);
});
test('a melisma note (empty syllable) only moves the pitch of the sung vowel', () => {
  const syllables: Syllable[] = [{text: 'ah', phones: [{symbol: 'AA', stress: 1}]}, {text: '', phones: []}];
  let i = 0;
  const {controller: c, calls} = setup(false, () => syllables[i++]);
  c.noteOn('a', 60);
  const plays = calls.filter(v => v[0] === 'play').length;
  c.noteOn('b', 64);
  assert.equal(calls.filter(v => v[0] === 'play').length, plays, 'the vowel is not re-sung');
  assert.deepEqual(calls.at(-1), ['pitch', midiToHz(64)]);
  assert.equal(c.getSnapshot().cues[0].text, 'ah', 'the sung syllable stays on screen');
});
test('a plain note after a sung syllable restarts the saved shape at its pitch', () => {
  let i = 0;
  const {controller: c, calls} = setup(false, () => (i++ === 0 ? {text: 'ah', phones: [{symbol: 'AA', stress: 1}]} : undefined as unknown as Syllable));
  c.noteOn('a', 60);
  c.noteOn('b', 67);
  const tail = calls.slice(-3).map(v => v[0]);
  assert.deepEqual(tail, ['stopScore', 'patch', 'gate']);
  assert.equal((calls.at(-2)![1] as Record<string, number>).pitch, midiToHz(67));
  assert.deepEqual(c.getSnapshot().cues, []);
});
test('releasing a key under a held portrait keeps the voice without re-sounding it', () => {
  const {controller: c, calls} = setup();
  c.touch('portrait', true);
  c.noteOn('key', 62);
  const count = calls.length;
  c.noteOff('key');
  assert.deepEqual(calls.slice(count).map(v => v[0]), ['claim'], 'nothing but the claim: the shape keeps sounding');
  assert.equal(gates(calls).at(-1), 1);
});
