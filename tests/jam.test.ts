import test from 'node:test';
import assert from 'node:assert/strict';
import {jamMessage, melodyText, PhraseRecorder, quantize, readAnswer, MAX_BEATS, MAX_NOTES} from '../src/performance/jam';

const BPM = 120; // half a second per beat
test('a played phrase is written on the sixteenth grid with rests in the gaps', () => {
  const r = new PhraseRecorder();
  r.noteOn('k:a', 60, 10.0); r.noteOff('k:a', 10.24);   // ~half a beat
  r.noteOn('k:d', 64, 10.26); r.noteOff('k:d', 10.74);  // a little late, ~one beat
  r.noteOn('k:g', 67, 11.25); r.noteOff('k:g', 12.2);   // after a half-beat rest, ~two beats
  const phrase = r.take(BPM, 13)!;
  assert.deepEqual(phrase.notes, [{start: 0, length: 0.5, midi: 60}, {start: 0.5, length: 1, midi: 64}, {start: 2.5, length: 2, midi: 67}]);
  assert.equal(melodyText(phrase.notes), 'C4:0.5 E4:1 r:1 G4:2');
  assert.ok(r.empty, 'take clears the recorder');
});
test('legato follows the sounding line: the newest key wins and release returns to a held key', () => {
  const r = new PhraseRecorder();
  r.noteOn('a', 60, 0); r.noteOn('b', 67, 0.5); r.noteOff('b', 1.0); r.noteOff('a', 1.5);
  assert.equal(r.holding, false);
  assert.equal(melodyText(r.take(BPM, 2)!.notes), 'C4:1 G4:1 C4:1');
});
test('a slide on one source ends the old note where the new one starts', () => {
  const r = new PhraseRecorder();
  r.noteOn('pointer:1', 60, 0); r.noteOn('pointer:1', 62, 0.25); r.noteOff('pointer:1', 0.75);
  assert.equal(melodyText(r.take(BPM, 1)!.notes), 'C4:0.5 D4:1');
});
test('sung syllables travel with the phrase into the chat message', () => {
  const r = new PhraseRecorder();
  r.noteOn('a', 69, 0); r.sang('hel'); r.noteOff('a', 0.5);
  r.noteOn('a', 72, 0.5); r.sang('lo'); r.noteOff('a', 1.5);
  const msg = jamMessage(r.take(96, 3)!);
  assert.match(msg, /^🎹 Jam · I played A4:0\.75 C5:1\.75 at 96 bpm, singing “hel lo”\. Your turn\.$/);
});
test('quick taps take a full step and notes never overlap', () => {
  const notes = quantize([{midi: 60, on: 0, off: 0.01}, {midi: 62, on: 0.02, off: 0.03}, {midi: 64, on: 0.04, off: 0.4}], BPM);
  for (const n of notes) assert.ok(n.length >= 0.25);
  for (let i = 1; i < notes.length; i++) assert.ok(notes[i].start >= notes[i - 1].start + notes[i - 1].length - 1e-9);
});
test('long phrases are cut to the jam limits', () => {
  const many = Array.from({length: 60}, (_, i) => ({midi: 60 + (i % 5), on: i * 0.3, off: i * 0.3 + 0.2}));
  const notes = quantize(many, BPM);
  assert.ok(notes.length <= MAX_NOTES);
  assert.ok(notes.every(n => n.start + n.length <= MAX_BEATS));
});
test('nothing played gives no phrase', () => {
  assert.equal(new PhraseRecorder().take(BPM, 1), null);
});
test('answers from the agent are checked before she sings them', () => {
  assert.deepEqual(readAnswer({notes: [{start: 0, length: 1, midi: 120}], lyrics: 'yeah', bpm: 999}), {notes: [{start: 0, length: 1, midi: 96}], lyrics: 'yeah', bpm: 240});
  assert.equal(readAnswer({notes: []}), null);
  assert.equal(readAnswer({notes: [{start: 'x', length: 1, midi: 60}]}), null);
  assert.equal(readAnswer(null), null);
  assert.equal(readAnswer({notes: [{start: 0, length: 1, midi: 60}]})!.bpm, 96);
});
