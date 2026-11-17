import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {
  nightWire,
  readMelody,
  writeMelody,
  planEnsemble,
  renderEnsemble,
  clipSamples,
  STAGE_FPS,
  POSE_SIZE,
} from '../src/core/ensemble';
import {importArrangement} from '../src/core/ensemble-import';
import {newProject, validateProject} from '../src/core/project';
import {decodeLexicon} from '../src/core/text';
import {lyricSyllables, planSong} from '../src/core/planner';
import {mouthAt, planVisemes} from '../src/core/visemes';
import {planGlances, glanceAt} from '../src/core/ensemble-gaze';
import {faceAt, EXPRESSIONS} from '../src/core/face-expression';
import {motionAt} from '../src/ui/beat-motion';
import {russianPhones} from '../src/core/russian';
import {compileScore, Engine} from '../src/core/engine';

const module = new WebAssembly.Module(readFileSync('plugin/runtime/voice_lab_engine.wasm'));
const lex = decodeLexicon(gunzipSync(readFileSync('plugin/runtime/lexicon.txt.gz')).toString());
test('original arrangement assigns every lead syllable to a note and preserves independent entrances', () => {
  const e = nightWire(),
    parts = planEnsemble(e, lex);
  assert.deepEqual(validateProject({...newProject(), mode: 'ensemble', ensemble: e}).ensemble, e);
  assert.equal(e.singers[0].notes.length, lyricSyllables(e.singers[0].lyrics, lex).length);
  assert.equal(parts[0].cues.length, e.singers[0].notes.length);
  assert.ok(parts[0].cues[0].start > 4 && parts[2].cues[0].start < 0.3);
  assert.deepEqual(readMelody(writeMelody(e.singers[0].notes)), e.singers[0].notes);
  assert.throws(() => readMelody('Z4:1'));
});
test('older arrangements get distinct Nous Girl colors and custom colors round-trip', () => {
  const ensemble = nightWire();
  for (const singer of ensemble.singers) delete singer.avatarColor;
  const restored = validateProject({...newProject(), mode: 'ensemble', ensemble});
  assert.deepEqual(
    restored.ensemble?.singers.map((s) => s.avatarColor),
    ['original', 'rose', 'jade']
  );
  restored.ensemble!.singers[2].avatarColor = 'violet';
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(restored))), restored);
  assert.throws(
    () => validateProject({...restored, ensemble: {...ensemble, singers: [{...ensemble.singers[0], avatarColor: 'missing'}]}}),
    /avatar color/
  );
});

test('Russian retains spelling, stressed vowels, final devoicing and soft consonants alongside Korean and English', () => {
  const syllables = lyricSyllables('hey го-ри́т нет 안녕', lex);
  assert.deepEqual(
    syllables.map((s) => s.text),
    ['hey', 'го', 'ри́т', 'нет', '안', '녕']
  );
  assert.equal(syllables[2].phones.find((p) => p.symbol === 'IY')?.stress, 1);
  assert.deepEqual(
    russianPhones('лед').map((p) => p.symbol),
    ['LJ', 'EH', 'T']
  );
  assert.equal(russianPhones('путь').at(-1)?.symbol, 'TJ');
});
test('single-syllable vamps repeat, mute and pan affect the mix, and excerpts are sample accurate', () => {
  const e = nightWire();
  e.singers = e.singers
    .slice(0, 2)
    .map((s, i) => ({...s, notes: readMelody('C4:1 r:1 E4:1'), lyrics: i ? '' : 'у', pan: i ? -1 : 1, muted: i === 0}));
  const parts = planEnsemble(e, lex);
  assert.ok(parts.every((p) => p.cues.length === 2));
  const mix = renderEnsemble(module, parts, 8000);
  assert.ok(mix.left.some((v) => Math.abs(v) > 0.01));
  assert.ok(mix.right.every((v) => v === 0));
  assert.ok(mix.poses[0].every((v) => v === 0));
  assert.equal(mix.resets, 0);
  assert.deepEqual(clipSamples(mix, {start: 0.3, end: 1.1}), {start: 2400, end: 8800});
  assert.throws(() => validateProject({...newProject(), ensemble: {...e, excerpt: {start: 100, end: 101}}}));
});
test('a dense score refills the engine staging buffer and plays the final note', () => {
  const capacity = new Engine(module, 8000).scoreCapacity;
  const events = Array.from(
    {length: capacity + 4},
    (_, i) => [(i / (capacity + 4)) * 2, 'pitch', 220, 0] as [number, 'pitch', number, number]
  );
  const score = compileScore([...events, [2, 'gate', 1, 0], [2.4, 'gate', 0, 0]], 2.5);
  const mix = renderEnsemble(
    module,
    [{score, cues: [], visemes: [], faceNotes: [], glances: [], muted: false, pan: 0, level: 1}],
    8000
  );
  assert.ok(mix.left.subarray(2.1 * 8000, 2.4 * 8000).some((v) => Math.abs(v) > 0.005));
  assert.ok(mix.poses[0][Math.ceil(2.2 * STAGE_FPS) * POSE_SIZE + 3] > 0.001);
});
test('multi-part score import keeps long initial rests and Cyrillic lyrics in time', async () => {
  const measure = (syllable: string, delay: number) =>
    '<measure><attributes><divisions>1</divisions></attributes><sound tempo="96"/>' +
    (delay ? '<note><rest/><duration>' + delay + '</duration></note>' : '') +
    '<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><lyric><text>' +
    syllable +
    '</text></lyric></note></measure>';
  const xml =
    '<score-partwise><part-list><score-part id="L"><part-name>Lead</part-name></score-part><score-part id="B"><part-name>Bass</part-name></score-part></part-list><part id="L">' +
    measure('Свет', 12) +
    '</part><part id="B">' +
    measure('у', 0) +
    '</part></score-partwise>';
  const {arrangement} = await importArrangement('new song.musicxml', new TextEncoder().encode(xml));
  assert.equal(arrangement.bpm, 96);
  assert.equal(arrangement.singers.length, 2);
  assert.equal(arrangement.singers.find((s) => s.name === 'Lead')?.notes[0].start, 12);
  assert.equal(arrangement.singers.find((s) => s.name === 'Lead')?.lyrics, 'Свет');
});

test('sung phone timings give silent seals, lip bites, dental contact, and distinct vowel shapes', () => {
  const lyrics = '[M+IY] [F+AA] [TH+UW] [S+AE] [OW]';
  const notes = readMelody('D4:1 D4:1 D4:1 D4:1 D4:2');
  const {segments} = planSong(notes, lyrics, lex, {bpm: 104});
  const keys = planVisemes(segments);
  const part = planEnsemble({...nightWire(), bpm: 104, singers: [{...nightWire().singers[0], lyrics, notes}]}, lex)[0];
  assert.deepEqual(part.visemes, keys);
  assert.ok(keys.every((k, i) => !i || k.time >= keys[i - 1].time));
  const at = (symbol: string) => {
    const seg = segments.find((s) => s.symbol === symbol)!;
    assert.ok(seg, symbol);
    return mouthAt(keys, (seg.start + seg.end) / 2);
  };
  assert.equal(at('M').open, 0);
  assert.equal(at('F').bite, 1);
  assert.equal(at('TH').tip, 1);
  assert.equal(at('S').teeth, 1);
  assert.ok(at('AA').open > at('IY').open * 2);
  assert.ok(at('IY').spread > at('UW').spread && at('UW').round > 0.9);
  const glide = segments.find((s) => s.symbol === 'OW')!;
  assert.ok(mouthAt(keys, glide.start + 0.2).open > 1.6 * mouthAt(keys, glide.end - 0.06).open);
  assert.equal(mouthAt(keys, 10).open, 0);
  const fastNotes = Array.from({length: 16}, (_, i) => ({start: i / 8, length: 1 / 8, midi: 62}));
  const fast = planSong(fastNotes, 'strengths _ _ my bright through pfft sky '.repeat(2), lex, {bpm: 240});
  const crowded = planVisemes(fast.segments);
  assert.ok(crowded.every((k, i) => !i || k.time >= crowded[i - 1].time));
  assert.equal(mouthAt(crowded, 10).open, 0);
});

test('movement styles differ on a shared beat, ease out through rests and round-trip independently of color', () => {
  const notes = readMelody('r:2 C4:3');
  const still = motionAt('still', 3, notes);
  for (const style of ['nod', 'sway', 'bounce'] as const) {
    assert.deepEqual(motionAt(style, 1, notes), still);
    assert.deepEqual(motionAt(style, 6, notes), still);
    assert.notDeepEqual(motionAt(style, 3, notes), still);
  }
  const nod = motionAt('nod', 2, notes),
    sway = motionAt('sway', 3, notes),
    bounce = motionAt('bounce', 2, notes);
  assert.ok(Math.abs(sway.tilt) > 0.06 && Math.abs(sway.x) > 8);
  assert.ok(nod.y > motionAt('nod', 2.5, notes).y + 6);
  assert.ok(bounce.y > motionAt('bounce', 3, notes).y + 8);
  const ensemble = nightWire();
  ensemble.singers.forEach((s) => delete s.movement);
  const p = validateProject({...newProject(), mode: 'ensemble', ensemble});
  assert.deepEqual(
    p.ensemble?.singers.map((s) => s.movement),
    ['nod', 'sway', 'bounce']
  );
  p.ensemble!.singers[0].movement = 'still';
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  assert.throws(
    () => validateProject({...p, ensemble: {...ensemble, singers: [{...ensemble.singers[0], movement: 'unknown'}]}}),
    /movement/
  );
});

test('eye and brow reactions follow each part through attacks, held notes, melismas and rests', () => {
  const source = nightWire();
  const notes = readMelody('r:2 C4:1 A4:2 A4:1 r:2 C4:1');
  const [part] = planEnsemble({...source, bpm: 120, singers: [{...source.singers[0], notes, lyrics: 'low high _ low'}]}, lex);
  const at = (style: (typeof EXPRESSIONS)[number], t: number) => faceAt(part.faceNotes, style, t);
  const rest = faceAt([], 'wry', 0);
  for (const style of EXPRESSIONS) {
    assert.deepEqual(at(style, 0.4), rest);
    assert.deepEqual(at(style, 3.95), rest);
    const before = at(style, part.faceNotes[1].start - 0.0001);
    const after = at(style, part.faceNotes[1].start + 0.0001);
    assert.ok(Math.abs(after.inner - before.inner) < 0.02);
  }
  assert.ok(at('earnest', 1.9).inner > at('earnest', 1.42).inner + 9);
  assert.ok(at('earnest', 1.9).lid < at('earnest', 1.42).lid - 0.15);
  assert.ok(at('dreamy', 2.45).lid > at('dreamy', 1.9).lid + 0.4);
  assert.ok(at('wry', 1.42).asymmetry > at('earnest', 1.42).asymmetry + 12);
  assert.equal(part.faceNotes.length, notes.length);
  assert.ok(part.faceNotes.every((n, i) => !i || n.start >= part.faceNotes[i - 1].start));
  assert.ok(at('earnest', 2.9).inner > 10);
});

test('custom facial expressions save independently of movement and old ensembles receive the trio defaults', () => {
  const ensemble = nightWire();
  for (const s of ensemble.singers) delete s.expression;
  const saved = validateProject({...newProject(), mode: 'ensemble', ensemble});
  assert.deepEqual(
    saved.ensemble!.singers.map((s) => s.expression),
    EXPRESSIONS
  );
  saved.ensemble!.singers[2].expression = 'dreamy';
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(saved))), saved);
  assert.equal(saved.ensemble!.singers[2].movement, 'bounce');
  assert.throws(
    () => validateProject({...saved, ensemble: {...ensemble, singers: [{...ensemble.singers[0], expression: 'missing'}]}}),
    /expression/
  );
});

test('Night Wire hands the lead to Echo on the sung timeline, including when seeking into the answer', () => {
  const e = nightWire();
  const parts = planEnsemble(e, lex);
  const echo = parts[1];
  const look = glanceAt(echo.glances, 1, 8.8);
  assert.ok(look.eyes < -0.85 && look.head < -0.85);
  const response = echo.cues.find((q) => q.start > 9 && q.start < 10)!;
  assert.equal(response.text, 'la');
  const lens = glanceAt(echo.glances, 1, response.vowel + 0.06);
  assert.ok(Math.abs(lens.eyes) < 0.01 && Math.abs(lens.head) < 0.01 && lens.camera > 0.98);
  const turn = echo.glances.find((g) => g.target === 0 && g.start < 8.8 && g.end > 8.8)!;
  assert.ok(
    Math.abs(glanceAt(echo.glances, 1, turn.start + 0.12).eyes) > Math.abs(glanceAt(echo.glances, 1, turn.start + 0.12).head)
  );
  assert.ok(
    parts[2].glances.some((g) => g.target === 0),
    'Bass acknowledges the lead while playing her backing line'
  );
  e.singers[0].muted = true;
  assert.ok(planEnsemble(e, lex)[1].glances.every((g) => g.target !== 0));
});

test('glances follow the available partner, bridge a breath before an answer, and settle for solos and silence', () => {
  const part = (start: number, end: number) => ({faceNotes: [{start, end}], muted: false, level: 1});
  const duet = [part(2.6, 4), part(0.4, 2.1)];
  const [lead] = planGlances(duet, 120);
  assert.ok(glanceAt(lead, 0, 1.2).eyes > 0.85);
  assert.equal(glanceAt(lead, 0, 2.68).camera, 1);
  assert.equal(glanceAt(lead, 0, 8).camera, 0);
  const silent = {...duet[1], level: 0};
  assert.deepEqual(planGlances([duet[0], silent], 120), [[], []]);
  assert.deepEqual(planGlances([duet[0]], 120), [[]]);
  const together = [part(0, 4), part(0, 4)];
  assert.deepEqual(planGlances(together, 120), [[], []]);
});
