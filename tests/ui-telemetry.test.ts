import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {Engine} from '../src/core/engine';
import {VOWEL_PRESETS} from '../src/core/presets';
import {airwayActivity} from '../src/ui/AirwayLife';
import {ANALYSIS_WORKER_SOURCE} from '../src/ui/modelAnalysis';

test('airway activity uses model telemetry and clears all indicators when stopped', () => {
  const state = {running: true, oralPressure: 0.7, frication: 0.5, noiseIndex: 38, voicing: 0.5};
  assert.deepEqual(airwayActivity(state), {pressure: 0.7, friction: 0.5, noiseIndex: 38, voicing: 0.5});
  // Hiss strength stays graded across what the engine produces (a weak fricative to a full /s/ near 2).
  const hiss = [0.1, 0.5, 1, 1.6, 2].map(frication => airwayActivity({...state, frication}).friction);
  for (let i = 1; i < hiss.length; i++) assert.ok(hiss[i] > hiss[i - 1], `graded: ${hiss.map(h => h.toFixed(2)).join(' ')}`);
  assert.ok(hiss[3] < 0.95 && hiss[4] === 1);
  assert.deepEqual(airwayActivity({...state, running: false}), {pressure: 0, friction: 0, noiseIndex: 38, voicing: 0});
  assert.deepEqual(airwayActivity({running: true, oralPressure: NaN, frication: -1, noiseIndex: 100, voicing: 2}), {pressure: 0, friction: 0, noiseIndex: 43, voicing: 1});
});
test('standalone analysis worker matches the engine facade for every vowel', () => {
  const module = new WebAssembly.Module(readFileSync('plugin/runtime/voice_lab_engine.wasm'));
  const engine = new Engine(module, 48000, 1);
  const messages: any[] = [];
  const self = {onmessage: (_: any) => {}, postMessage: (message: any) => messages.push(message)};
  runInNewContext(ANALYSIS_WORKER_SOURCE, {self, WebAssembly, Float32Array});
  self.onmessage({data: {module}});
  assert.equal(messages.pop().ready, true);
  for (const vowel of VOWEL_PRESETS) {
    engine.jumpAll(vowel.shape);
    engine.render(128);
    const areas = engine.areas();
    const nasal = vowel.shape.velum ? 1 : 0;
    const expected = engine.analyze(areas, nasal, 14.2);
    self.onmessage({data: {areas, nasal, length: 14.2}});
    const actual = messages.pop();
    assert.equal(actual.error, undefined);
    assert.deepEqual(Array.from(actual.result.magnitude), Array.from(expected.magnitude), vowel.id);
    assert.equal(JSON.stringify(actual.result.formants), JSON.stringify(expected.formants), vowel.id);
  }
});

test('model analysis coalesces geometry and discards results after disposal', async () => {
  const {ModelAnalysis} = await import('../src/ui/modelAnalysis');
  const previous = globalThis.Worker;
  let worker!: FakeWorker;
  class FakeWorker {
    onmessage: ((event: any) => void) | null = null;
    onerror: (() => void) | null = null;
    sent: any[] = [];
    terminated = false;
    constructor() { worker = this; }
    postMessage(data: any) { this.sent.push(data); }
    terminate() { this.terminated = true; }
    reply(data: any) { this.onmessage?.({data}); }
  }
  globalThis.Worker = FakeWorker as any;
  try {
    const results: any[] = [];
    const module = new WebAssembly.Module(readFileSync('plugin/runtime/voice_lab_engine.wasm'));
    const model = new ModelAnalysis(module, result => results.push(result));
    const areas = new Float32Array(44).fill(1);
    model.request(areas, 0, 14);
    worker.reply({ready: true});
    assert.equal(worker.sent.length, 2);
    model.request(areas, 0, 14);
    model.request(areas, 0, 15);
    model.request(areas, 0, 16);
    assert.equal(worker.sent.length, 2, 'only one request in flight');
    worker.reply({result: 'old'});
    assert.deepEqual(results, []);
    assert.equal(worker.sent.at(-1).length, 16);
    worker.reply({result: 'latest'});
    assert.deepEqual(results, ['latest']);
    model.dispose();
    assert.equal(worker.terminated, true);
    worker.reply({result: 'late'});
    assert.deepEqual(results, ['latest']);
  } finally {
    globalThis.Worker = previous;
  }
});
