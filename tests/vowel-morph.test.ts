import test from 'node:test';
import assert from 'node:assert/strict';
import {morphVowel, VOWEL_ANCHORS} from '../src/performance/vowels';
import {PARAMS, type ParamName} from '../src/core/params';

test('vowel morph recalls every complete calibrated anchor exactly', () => {
  for (const v of VOWEL_ANCHORS) assert.deepEqual(morphVowel(v.x, v.y), v.shape, v.id);
});
test('full pad surface is finite, bounded, voiced and free of closure overrides', () => {
  for (let x = 0; x <= 1; x += 0.025) for (let y = 0; y <= 1; y += 0.025) {
    const shape = morphVowel(x, y);
    for (const [name, value] of Object.entries(shape)) {
      const spec = PARAMS.find(p => p.name === name)!;
      assert.ok(Number.isFinite(value) && value >= spec.min - 1e-12 && value <= spec.max + 1e-12, `${name} at ${x},${y}`);
    }
    for (const key of ['tipClose', 'dorsumClose', 'velum', 'lateral'] as ParamName[]) assert.equal(shape[key], 0);
    assert.ok(Math.abs(shape.voicing! - 1) < 1e-12);
    assert.ok(shape.lipOpen! > 0.3);
  }
});
test('morph moves jaw, lips and throat together and is continuous at anchors', () => {
  const a = morphVowel(0.15, 0.7), b = morphVowel(0.8, 0.2);
  for (const key of ['jaw', 'lipRound', 'lipOpen', 'throat'] as ParamName[]) assert.ok(Math.abs(a[key]! - b[key]!) > 0.03, key);
  for (const v of VOWEL_ANCHORS) {
    const near = morphVowel(v.x + 0.00001, v.y + 0.00001);
    for (const [key, value] of Object.entries(v.shape)) assert.ok(Math.abs(near[key as ParamName]! - value) < 0.001);
  }
});
