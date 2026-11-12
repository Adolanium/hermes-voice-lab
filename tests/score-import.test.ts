/** Score import tests: MusicXML, compressed MusicXML (.mxl) and Standard MIDI Files. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crc32, deflateRawSync} from 'node:zlib';
import {importMidi, importMusicXml, importScoreFile} from '../src/core/score-import';

// ---- MusicXML fixtures --------------------------------------------------------------------------

interface N {
  /** Pitch as step + octave with an optional alter ("C4", "F#4", "Bb3"), or "rest". */
  p: string;
  /** Duration in divisions. */
  d: number | string;
  lyric?: string;
  syllabic?: string;
  verse?: number;
  chord?: boolean;
  grace?: boolean;
  tie?: 'start' | 'stop' | 'both';
  voice?: number;
}

function note(n: N): string {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(n.p);
  const pitch = m
    ? `<pitch><step>${m[1]}</step>${m[2] ? `<alter>${m[2] === '#' ? 1 : -1}</alter>` : ''}<octave>${m[3]}</octave></pitch>`
    : '<rest/>';
  const ties = n.tie === 'both' ? ['stop', 'start'] : n.tie ? [n.tie] : [];
  return [
    '<note>',
    n.grace ? '<grace/>' : '',
    n.chord ? '<chord/>' : '',
    pitch,
    n.grace ? '' : `<duration>${n.d}</duration>`,
    ...ties.map(t => `<tie type="${t}"/>`),
    n.voice ? `<voice>${n.voice}</voice>` : '',
    '<type>quarter</type>',
    n.lyric !== undefined ? `<lyric number="${n.verse ?? 1}"><syllabic>${n.syllabic ?? 'single'}</syllabic><text>${n.lyric}</text></lyric>` : '',
    '</note>',
  ].join('');
}

const measure = (number: number, body: string) => `<measure number="${number}">${body}</measure>`;
const attributes = (divisions: number) => `<attributes><divisions>${divisions}</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>`;
const tempo = (bpm: number) => `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`;

function score(parts: Array<{id: string; name: string; measures: string[]}>): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
    '<score-partwise version="4.0">',
    '  <!-- a comment with <tags> inside -->',
    '  <part-list>',
    ...parts.map(p => `    <score-part id="${p.id}"><part-name>${p.name}</part-name></score-part>`),
    '  </part-list>',
    ...parts.map(p => `  <part id="${p.id}">\n${p.measures.map((m, k) => '    ' + measure(k + 1, m)).join('\n')}\n  </part>`),
    '</score-partwise>',
  ].join('\n');
}

const one = (...measures: string[]) => score([{id: 'P1', name: 'Voice', measures}]);
const triples = (notes: Array<{start: number; length: number; midi: number}>) => notes.map(n => [n.start, n.length, n.midi]);

// The melody used by several tests: "Hel-lo world" with a tie over the barline, a melisma,
// a rest and a chord.
const MELODY = one(
  attributes(2) +
    tempo(96) +
    note({p: 'C4', d: 2, lyric: 'Hel', syllabic: 'begin'}) +
    note({p: 'D4', d: 2, lyric: 'lo', syllabic: 'end'}) +
    note({p: 'E4', d: 4, lyric: 'world', tie: 'start'}),
  note({p: 'E4', d: 2, tie: 'stop'}) +
    note({p: 'F4', d: 2}) +
    note({p: 'rest', d: 2}) +
    note({p: 'G4', d: 2, lyric: 'end.'}) +
    note({p: 'B4', d: 2, chord: true}),
);

// ---- MusicXML -----------------------------------------------------------------------------------

test('MusicXML: a melody with a hyphenated word, a tie, a melisma, a rest and a chord', () => {
  const s = importMusicXml(MELODY);
  assert.equal(s.bpm, 96);
  assert.deepEqual(triples(s.notes), [
    [0, 1, 60],
    [1, 1, 62],
    [2, 3, 64], // half note tied to a quarter in the next measure
    [5, 1, 65], // no lyric: melisma
    [7, 1, 71], // after the rest; the chord's top note
  ]);
  assert.equal(s.lyrics, 'Hel-lo world - end.');
  assert.equal(s.part, 'P1');
  assert.deepEqual(s.parts, [{id: 'P1', name: 'Voice', notes: 7}]);
  assert.ok(s.warnings.some(w => /chord/i.test(w)));
  // One lyric token per note that starts a syllable or extends one.
  assert.equal(s.lyrics.split(' ').reduce((n, w) => n + w.split('-').filter(Boolean).length + (w === '-' ? 1 : 0), 0), s.notes.length);
});

test('MusicXML: grace notes are skipped, accidentals and notes before the first lyric are read', () => {
  const s = importMusicXml(
    one(
      attributes(1) +
        note({p: 'F#4', d: 1}) +
        note({p: 'D5', d: 0, grace: true}) +
        note({p: 'Bb3', d: 1, lyric: 'don&apos;t'}) +
        note({p: 'C4', d: 1, lyric: 'st&#233;p,'}) +
        note({p: 'C4', d: 1, lyric: '1.'}),
    ),
  );
  assert.deepEqual(triples(s.notes), [
    [0, 1, 66],
    [1, 1, 58],
    [2, 1, 60],
    [3, 1, 60],
  ]);
  // "la" before the first lyric; entities decoded; accents folded; a lyric without letters extends.
  assert.equal(s.lyrics, "la don't step, -");
  assert.equal(s.bpm, 120);
});

test('MusicXML: backup and forward with two voices keep the voice that sings', () => {
  const xml = one(
    attributes(4) +
      ['one', 'two', 'three', 'four'].map((w, k) => note({p: ['C5', 'D5', 'E5', 'F5'][k], d: 4, lyric: w, voice: 1})).join('') +
      '<backup><duration>16</duration></backup>' +
      '<forward><duration>4</duration></forward>' +
      note({p: 'C4', d: 8, voice: 2}) +
      note({p: 'D4', d: 2, voice: 2}) +
      note({p: 'E4', d: 2, voice: 2}),
    note({p: 'G5', d: 16, lyric: 'five', voice: 1}),
  );
  const s = importMusicXml(xml);
  assert.deepEqual(triples(s.notes), [
    [0, 1, 72],
    [1, 1, 74],
    [2, 1, 76],
    [3, 1, 77],
    [4, 4, 79], // the second measure starts after the first one's four beats, not after voice 2
  ]);
  assert.equal(s.lyrics, 'one two three four five');
  assert.ok(s.warnings.some(w => /2 voices/.test(w) && /voice 1/.test(w)));

  // Without lyrics the busiest voice wins.
  const bare = importMusicXml(xml.replace(/<lyric[\s\S]*?<\/lyric>/g, '').replace(/<voice>1<\/voice>/, '<voice>3</voice>'));
  assert.deepEqual(bare.notes.map(n => n.midi), [72, 74, 76, 77, 79].slice(1));
  assert.equal(bare.lyrics, '');
  assert.ok(bare.warnings.some(w => /no lyrics/.test(w)));
});

test('MusicXML: repeats with first and second endings are unrolled', () => {
  const q = (p: string) => note({p, d: 1});
  const barline = (inner: string, location = 'right') => `<barline location="${location}">${inner}</barline>`;
  const s = importMusicXml(
    one(
      attributes(1) + q('C4'),
      barline('<repeat direction="forward"/>', 'left') + q('D4'),
      barline('<ending number="1" type="start"/>', 'left') + q('E4') + barline('<ending number="1" type="stop"/><repeat direction="backward"/>'),
      barline('<ending number="2" type="start"/>', 'left') + q('F4') + barline('<ending number="2" type="discontinue"/>'),
      q('G4'),
    ),
  );
  assert.deepEqual(s.notes.map(n => n.midi), [60, 62, 64, 62, 65, 67]);
  assert.deepEqual(s.notes.map(n => n.start), [0, 1, 2, 3, 4, 5]);

  // A plain repeat from the top, played three times, then a second repeated section.
  const plain = importMusicXml(
    one(
      attributes(1) + q('C4'),
      q('D4') + barline('<repeat direction="backward" times="3"/>'),
      q('E4') + barline('<repeat direction="backward"/>'),
      q('F4'),
    ),
  );
  assert.deepEqual(plain.notes.map(n => n.midi), [60, 62, 60, 62, 60, 62, 64, 64, 65]);

  // Three endings: 1 and 2 share a bracket.
  const three = importMusicXml(
    one(
      attributes(1) + q('C4'),
      barline('<ending number="1, 2" type="start"/>', 'left') + q('D4') + barline('<ending number="1, 2" type="stop"/><repeat direction="backward"/>'),
      barline('<ending number="3" type="start"/>', 'left') + q('E4') + barline('<ending number="3" type="stop"/>'),
    ),
  );
  assert.deepEqual(three.notes.map(n => n.midi), [60, 62, 60, 62, 60, 64]);

  // A runaway repeat count is capped, and jumps are reported rather than followed.
  const wild = importMusicXml(
    one(attributes(1) + q('C4') + '<direction><sound dalsegno="s1"/></direction>' + barline('<repeat direction="backward" times="999999999"/>')),
  );
  assert.equal(wild.notes.length, 32);
  assert.ok(wild.warnings.some(w => /D\.S\./.test(w)));
});

test('MusicXML: tempo comes from the first marking; later changes are reported', () => {
  const dotted = '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/><per-minute>c. 80</per-minute></metronome></direction-type></direction>';
  assert.equal(importMusicXml(one(attributes(1) + dotted + note({p: 'C4', d: 1}))).bpm, 120);
  assert.equal(importMusicXml(one(attributes(1) + '<sound tempo="72.5"/>' + note({p: 'C4', d: 1}))).bpm, 72.5);
  assert.equal(importMusicXml(one(attributes(1) + '<sound tempo="fast"/>' + note({p: 'C4', d: 1}))).bpm, 120);
  const changing = importMusicXml(one(attributes(1) + tempo(90) + note({p: 'C4', d: 1}), tempo(140) + note({p: 'D4', d: 1})));
  assert.equal(changing.bpm, 90);
  assert.ok(changing.warnings.some(w => /tempo changes/.test(w)));
  assert.ok(!importMusicXml(MELODY).warnings.some(w => /tempo/.test(w)));
});

test('MusicXML: part selection prefers the part with lyrics; opts.part overrides', () => {
  const xml = score([
    {id: 'P1', name: 'Piano', measures: [attributes(1) + tempo(100) + note({p: 'C3', d: 1}) + note({p: 'E3', d: 1}) + note({p: 'G3', d: 1})]},
    {id: 'P2', name: 'Soprano &amp; Alto', measures: [attributes(1) + note({p: 'C5', d: 2, lyric: 'la', verse: 2}) + note({p: 'D5', d: 1, lyric: 'oh', verse: 1}) + note({p: 'E5', d: 1, lyric: 'no', verse: 2})]},
  ]);
  const auto = importMusicXml(xml);
  assert.equal(auto.part, 'P2');
  assert.equal(auto.bpm, 100);
  assert.deepEqual(auto.parts, [
    {id: 'P1', name: 'Piano', notes: 3},
    {id: 'P2', name: 'Soprano & Alto', notes: 3},
  ]);
  // Only the first verse (the lowest number) is read.
  assert.equal(auto.lyrics, 'la oh -');
  const piano = importMusicXml(xml, {part: 'P1'});
  assert.equal(piano.part, 'P1');
  assert.deepEqual(piano.notes.map(n => n.midi), [48, 52, 55]);
  assert.equal(piano.lyrics, '');
  const missing = importMusicXml(xml, {part: 'P9'});
  assert.equal(missing.part, 'P2');
  assert.ok(missing.warnings.some(w => /P9/.test(w)));
});

test('MusicXML: out-of-range pitches are transposed by octaves with one warning', () => {
  const low = importMusicXml(one(attributes(1) + note({p: 'C1', d: 1}) + note({p: 'G1', d: 1})));
  assert.deepEqual(low.notes.map(n => n.midi), [36, 43]); // the whole line moves; the interval is kept
  assert.equal(low.warnings.filter(w => /octave/.test(w)).length, 1);
  const wide = importMusicXml(one(attributes(1) + note({p: 'C1', d: 1}) + note({p: 'C4', d: 1}) + note({p: 'C8', d: 1})));
  assert.deepEqual(wide.notes.map(n => n.midi), [36, 60, 96]);
  assert.equal(wide.warnings.filter(w => /octave/.test(w)).length, 1);
  assert.ok(!importMusicXml(MELODY).warnings.some(w => /octave/.test(w)));
});

test('MusicXML: lengths are clamped, overlaps trimmed and long leading silence removed', () => {
  const s = importMusicXml(
    one(
      attributes(960) + note({p: 'rest', d: 3840}),
      note({p: 'rest', d: 3840}),
      note({p: 'rest', d: 480}) +
        note({p: 'C4', d: 1}) + // far too short: lengthened to the minimum
        '<forward><duration>959</duration></forward>' +
        note({p: 'D4', d: 1920}) +
        '<backup><duration>960</duration></backup>' +
        note({p: 'E4', d: 320}) + // starts inside D4, which is cut short
        note({p: 'F4', d: 960 * 100}),
    ),
  );
  assert.deepEqual(triples(s.notes), [
    [0.5, 0.0625, 60],
    [1.5, 1, 62],
    [2.5, 1 / 3, 64].map((v, k) => (k === 1 ? Math.round(v * 960) / 960 : v)),
    [2.5 + 320 / 960, 64, 65].map((v, k) => (k === 0 ? Math.round(v * 960) / 960 : v)),
  ]);
  assert.ok(s.warnings.some(w => /8 beats of silence/.test(w)));
  for (let k = 1; k < s.notes.length; k++) assert.ok(s.notes[k - 1].start + s.notes[k - 1].length <= s.notes[k].start + 1e-9);
});

test('MusicXML: a melisma inside a word splits the word and says so', () => {
  const s = importMusicXml(
    one(
      attributes(1) +
        note({p: 'C4', d: 1, lyric: 'Glo', syllabic: 'begin'}) +
        note({p: 'D4', d: 1}) +
        note({p: 'E4', d: 1, lyric: 'ri', syllabic: 'middle'}) +
        note({p: 'F4', d: 1, lyric: 'a', syllabic: 'end'}),
    ),
  );
  assert.equal(s.lyrics, 'Glo - ri-a');
  assert.ok(s.warnings.some(w => /melisma/.test(w)));
});

test('MusicXML: malformed input never throws unless it is not a score at all', () => {
  assert.throws(() => importMusicXml('hello'), /not a MusicXML score/);
  assert.throws(() => importMusicXml('<html><body>score-partwise</body></html>'), /not a MusicXML score/);
  assert.throws(() => importMusicXml(''), /not a MusicXML score/);
  assert.throws(() => importMusicXml('<score-partwise>' + ' '.repeat(20 * 1024 * 1024)), /too large/);

  const s = importMusicXml(
    one(
      attributes(1) +
        note({p: 'C4', d: 'abc'}) + // skipped: it takes no time either
        note({p: 'D4', d: 1}) +
        note({p: 'E4', d: '1e999'}) +
        note({p: 'F4', d: -3}) +
        '<note><pitch><step>H</step><octave>4</octave></pitch><duration>1</duration></note>' +
        '<note><pitch><step>C</step><octave>ninety</octave></pitch><duration>1</duration></note>' +
        '<note><pitch><step>C</step><octave>99</octave></pitch><duration>1</duration></note>' +
        '<backup><duration>oops</duration></backup>' +
        note({p: 'G4', d: 1}),
    ),
  );
  assert.deepEqual(triples(s.notes), [
    [0, 1, 62],
    [4, 1, 67],
  ]);
  assert.ok(s.warnings.some(w => /6 malformed notes were skipped/.test(w)));

  // Truncated mid-tag, unclosed elements, a stray end tag, zero divisions, an empty score.
  const cut = MELODY.slice(0, MELODY.indexOf('<step>E') + 9);
  assert.deepEqual(importMusicXml(cut).notes.map(n => n.midi), [60, 62]);
  assert.deepEqual(importMusicXml('<score-partwise><part id="X"><measure></bogus><attributes><divisions>0</divisions></attributes>' + note({p: 'A4', d: 2})).notes, [{start: 0, length: 2, midi: 69}]);
  const empty = importMusicXml('<score-partwise version="4.0"/>');
  assert.deepEqual([empty.notes, empty.lyrics, empty.parts, empty.part, empty.bpm], [[], '', [], '', 120]);
  assert.ok(empty.warnings.length > 0);
});

test('MusicXML: score-timewise is read the same way', () => {
  const xml =
    '<score-timewise><part-list><score-part id="P1"><part-name>Tune</part-name></score-part></part-list>' +
    `<measure number="1"><part id="P1">${attributes(1)}${note({p: 'C4', d: 1, lyric: 'do'})}</part></measure>` +
    `<measure number="2"><part id="P1">${note({p: 'D4', d: 1, lyric: 're'})}</part></measure></score-timewise>`;
  const s = importMusicXml(xml);
  assert.deepEqual(triples(s.notes), [
    [0, 1, 60],
    [1, 1, 62],
  ]);
  assert.equal(s.lyrics, 'do re');
  assert.deepEqual(s.parts, [{id: 'P1', name: 'Tune', notes: 2}]);
});

// ---- .mxl ---------------------------------------------------------------------------------------

const enc = (s: string) => new TextEncoder().encode(s);

/** A zip archive: stored entries, or deflated ones. */
function zip(files: Array<{name: string; data: Uint8Array}>, deflate = false): Uint8Array {
  const chunks: number[] = [];
  const central: number[] = [];
  const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
  const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of files) {
    const name = [...enc(f.name)];
    const body = deflate ? new Uint8Array(deflateRawSync(f.data)) : f.data;
    const offset = chunks.length;
    const shared = [...u16(deflate ? 8 : 0), ...u16(0), ...u16(0), ...u32(crc32(f.data)), ...u32(body.length), ...u32(f.data.length), ...u16(name.length)];
    chunks.push(...u32(0x04034b50), ...u16(20), ...u16(0), ...shared, ...u16(0), ...name, ...body);
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...shared, ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name);
  }
  const at = chunks.length;
  return new Uint8Array([...chunks, ...central, ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(central.length), ...u32(at), ...u16(0)]);
}

const CONTAINER = '<?xml version="1.0"?><container><rootfiles><rootfile full-path="scores/tune.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';

test('.mxl: stored and deflated archives, the container rootfile and the fallback', async () => {
  const decoy = one(attributes(1) + note({p: 'A3', d: 1}));
  const files = [
    {name: 'META-INF/container.xml', data: enc(CONTAINER)},
    {name: 'decoy.xml', data: enc(decoy)},
    {name: 'scores/tune.musicxml', data: enc(MELODY)},
  ];
  const expected = importMusicXml(MELODY);
  assert.deepEqual(await importScoreFile('tune.mxl', zip(files)), expected);
  assert.deepEqual(await importScoreFile('tune.mxl', zip(files, true)), expected);
  // The zip signature wins over a misleading extension.
  assert.deepEqual(await importScoreFile('tune.xml', zip(files, true)), expected);
  // No container: the first score outside META-INF.
  const bare = await importScoreFile('tune.mxl', zip([{name: 'META-INF/other.xml', data: enc('<x/>')}, files[2]], true));
  assert.deepEqual(bare, expected);
  assert.equal((await importScoreFile('tune.mxl', zip(files), {part: 'P1'})).part, 'P1');

  await assert.rejects(importScoreFile('tune.mxl', enc('not a zip at all, just some text')), /not a compressed MusicXML/);
  await assert.rejects(importScoreFile('tune.mxl', zip([{name: 'readme.txt', data: enc('hi')}])), /no MusicXML file inside/);
  const broken = zip([{name: 'tune.musicxml', data: enc(MELODY)}], true);
  broken[30 + 'tune.musicxml'.length] = 0xff; // the first deflate block now has a reserved type
  await assert.rejects(importScoreFile('tune.mxl', broken), /damaged/);
});

test('importScoreFile: picks the reader by extension and content', async () => {
  const expected = importMusicXml(MELODY);
  assert.deepEqual(await importScoreFile('Tune.MusicXML', enc(MELODY)), expected);
  assert.deepEqual(await importScoreFile('tune.xml', enc('﻿' + MELODY)), expected);
  // UTF-16 with a byte-order mark.
  const wide = new Uint8Array(2 + MELODY.length * 2);
  wide.set([0xff, 0xfe]);
  for (let k = 0; k < MELODY.length; k++) {
    wide[2 + k * 2] = MELODY.charCodeAt(k) & 0xff;
    wide[3 + k * 2] = MELODY.charCodeAt(k) >> 8;
  }
  assert.deepEqual(await importScoreFile('tune.musicxml', wide), expected);
  await assert.rejects(importScoreFile('tune.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46])), /not a score/);
  await assert.rejects(importScoreFile('tune.xml', enc('<html/>')), /not a MusicXML score/);
  await assert.rejects(importScoreFile('tune.mid', enc('<html/>')), /not a MIDI file/);
});

// ---- MIDI ---------------------------------------------------------------------------------------

function vlq(v: number): number[] {
  const out = [v & 0x7f];
  while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
  return out;
}
const meta = (delta: number, type: number, data: number[] | string) => {
  const bytes = typeof data === 'string' ? [...enc(data)] : data;
  return [...vlq(delta), 0xff, type, ...vlq(bytes.length), ...bytes];
};
const END = meta(0, 0x2f, []);

function midi(format: number, division: number, tracks: number[][]): Uint8Array {
  const u32 = (v: number) => [(v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
  const u16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
  const out = [0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(format), ...u16(tracks.length), ...u16(division)];
  for (const t of tracks) out.push(0x4d, 0x54, 0x72, 0x6b, ...u32(t.length), ...t);
  return new Uint8Array(out);
}

const CONDUCTOR = [...meta(0, 0x03, 'Song'), ...meta(0, 0x51, [0x09, 0x27, 0xc0]), ...END]; // 600000 us per beat: 100 bpm
const DRUMS = [...meta(0, 0x03, 'Drums'), ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap(() => [0, 0x99, 38, 100, ...vlq(240), 0x89, 38, 0]), ...END];
const VOCAL = [
  ...meta(0, 0x03, 'Vocal'),
  ...meta(0, 0x05, 'Hel-'),
  0, 0x90, 60, 100,
  0, 48, 100, // running status: a lower note on the same onset
  ...vlq(480), 60, 0, // running status, velocity 0: note off
  0, 48, 0,
  ...meta(0, 0x05, 'lo'),
  0, 0x90, 62, 100,
  ...vlq(480), 62, 0,
  ...meta(0, 0x05, ' world!'),
  0, 0x90, 64, 100,
  ...vlq(240), 0x80, 64, 64,
  0, 0x90, 65, 100,
  ...vlq(240), 65, 0,
  ...END,
];

test('MIDI: running status, tempo, lyric events and track choice', () => {
  const s = importMidi(midi(1, 480, [CONDUCTOR, DRUMS, VOCAL]));
  assert.equal(s.bpm, 100);
  assert.equal(s.part, '2');
  assert.deepEqual(s.parts, [
    {id: '0', name: 'Song', notes: 0},
    {id: '1', name: 'Drums', notes: 0}, // channel 10 is not counted
    {id: '2', name: 'Vocal', notes: 5},
  ]);
  assert.deepEqual(triples(s.notes), [
    [0, 1, 60],
    [1, 1, 62],
    [2, 0.5, 64],
    [2.5, 0.5, 65],
  ]);
  assert.equal(s.lyrics, 'Hel-lo world! -');
  assert.ok(s.warnings.some(w => /highest/.test(w)));
});

test('MIDI: without lyrics the busiest pitched track is chosen; opts.track overrides', () => {
  const line = (name: string, keys: number[]) => [...meta(0, 0x03, name), ...keys.flatMap(k => [0, 0x91, k, 90, ...vlq(96), 0x81, k, 0]), ...END];
  const file = midi(1, 96, [CONDUCTOR, DRUMS, line('Bass', [40, 43]), line('Lead', [72, 74, 76])]);
  const auto = importMidi(file);
  assert.equal(auto.part, '3');
  assert.deepEqual(triples(auto.notes), [
    [0, 1, 72],
    [1, 1, 74],
    [2, 1, 76],
  ]);
  assert.equal(auto.lyrics, '');
  assert.ok(auto.warnings.some(w => /no lyrics/.test(w)));
  assert.deepEqual(importMidi(file, {track: 2}).notes.map(n => n.midi), [40, 43]);
  const wrong = importMidi(file, {track: 9});
  assert.equal(wrong.part, '3');
  assert.ok(wrong.warnings.some(w => /no track 9/.test(w)));
});

test('MIDI: importScoreFile passes the part on as the track', async () => {
  const line = (keys: number[]) => [...keys.flatMap(k => [0, 0x90, k, 90, ...vlq(96), 0x80, k, 0]), ...END];
  const file = midi(1, 96, [line([60, 62, 64]), line([50, 52])]);
  assert.equal((await importScoreFile('song.mid', file)).part, '0');
  assert.deepEqual((await importScoreFile('song.midi', file, {part: '1'})).notes.map(n => n.midi), [50, 52]);
  assert.equal((await importScoreFile('song.kar', file, {part: 'P1'})).part, '0');
});

test('MIDI: karaoke text events in a words track, and a single-track file with several channels', () => {
  const words = [
    ...meta(0, 0x03, 'Words'),
    ...meta(0, 0x01, '@KMIDI KARAOKE FILE'),
    ...meta(0, 0x01, '@TTwinkle'),
    ...meta(96, 0x01, '\\Twin'),
    ...meta(96, 0x01, 'kle'),
    ...meta(96, 0x01, ' lit'),
    ...meta(96, 0x01, 'tle'),
    ...meta(96, 0x01, '/star'),
    ...END,
  ];
  const tune = [...meta(96, 0x06, 'verse'), ...[60, 60, 67, 67, 69, 67].flatMap(k => [0, 0x90, k, 90, ...vlq(96), 0x80, k, 0]), ...END];
  const s = importMidi(midi(1, 96, [words, tune]));
  assert.equal(s.part, '1');
  assert.equal(s.bpm, 120);
  assert.equal(s.lyrics, 'Twin-kle lit-tle star -');
  assert.deepEqual(s.notes.map(n => n.start), [1, 2, 3, 4, 5, 6]);

  // Format 0: melody on channel 1, two bass notes on channel 2, drums on channel 10.
  const mixed = [
    0, 0x90, 72, 90, 0, 0x91, 40, 90, 0, 0x99, 36, 90,
    96, 0x80, 72, 0, 0, 0x90, 74, 90,
    96, 0x80, 74, 0, 0, 0x81, 40, 0, 0, 0x90, 76, 90, 0, 0x91, 43, 90,
    96, 0x80, 76, 0, 0, 0x81, 43, 0, 0, 0x89, 36, 0,
    ...END,
  ];
  const zero = importMidi(midi(0, 96, [mixed]));
  assert.deepEqual(zero.notes.map(n => n.midi), [72, 74, 76]);
  assert.deepEqual(zero.parts, [{id: '0', name: 'Track 1', notes: 5}]);
  assert.ok(zero.warnings.some(w => /2 channels/.test(w)));
});

test('MIDI: out-of-range notes, leading silence and tempo changes', () => {
  const track = [
    ...meta(0, 0x51, [0x07, 0xa1, 0x20]), // 120 bpm
    ...vlq(96 * 10),
    0x90, 100, 90, ...vlq(96), 0x80, 100, 0,
    ...meta(0, 0x51, [0x0f, 0x42, 0x40]), // 60 bpm
    48, 0x90, 103, 90, ...vlq(48), 0x80, 103, 0,
    ...END,
  ];
  const s = importMidi(midi(1, 96, [track]));
  assert.equal(s.bpm, 120);
  assert.deepEqual(triples(s.notes), [
    [0, 1, 88],
    [1.5, 0.5, 91],
  ]);
  assert.equal(s.warnings.filter(w => /octave/.test(w)).length, 1);
  assert.ok(s.warnings.some(w => /10 beats of silence/.test(w)));
  assert.ok(s.warnings.some(w => /tempo changes/.test(w)));
});

test('MIDI: malformed files', () => {
  assert.throws(() => importMidi(enc('RIFFnothing useful here')), /not a MIDI file/);
  assert.throws(() => importMidi(new Uint8Array(0)), /not a MIDI file/);
  assert.throws(() => importMidi(midi(1, 0, [VOCAL])), /time division/);
  // Cut off in the middle of a track: what was read is kept, an unfinished note ends with the data.
  const whole = midi(1, 480, [CONDUCTOR, VOCAL]);
  for (let cut = 14; cut < whole.length; cut += 3) assert.doesNotThrow(() => importMidi(whole.subarray(0, cut)));
  const half = importMidi(whole.subarray(0, whole.length - 20));
  assert.deepEqual(half.notes.slice(0, 2).map(n => [n.start, n.midi]), [
    [0, 60],
    [1, 62],
  ]);
  // A data byte with no status to run on, and a header with no tracks.
  assert.deepEqual(importMidi(midi(1, 96, [[0, 60, 100, 0, 0x90, 62, 100]])).notes, []);
  const none = importMidi(midi(1, 96, []));
  assert.deepEqual([none.notes, none.parts, none.part, none.bpm], [[], [], '', 120]);
  // Random bytes after a valid header never throw.
  let seed = 12345;
  for (let round = 0; round < 50; round++) {
    const junk = Array.from({length: 200}, () => ((seed = (seed * 1103515245 + 12345) >>> 0) >> 16) & 0xff);
    assert.doesNotThrow(() => importMidi(midi(1, 96, [junk, junk.slice(50)])));
  }
});
