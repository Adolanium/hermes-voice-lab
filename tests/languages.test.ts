// Sound marks, the sounds added for other languages, the Korean front end, score import
// limits and the airway's silence in extreme poses.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {compileScore, Engine, renderScore, type ScoreEvent} from '../src/core/engine';
import {PARAM_ID, PARAMS, type ParamName} from '../src/core/params';
import {lyricSyllables, planSong, planSpeech} from '../src/core/planner';
import {decodeLexicon, parsePhonemeInput, phonemize, tokenize} from '../src/core/text';
import {koreanSyllables} from '../src/core/korean';
import {parsePhone, PHONEMES} from '../src/core/phonemes';
import {LIMITS, songFromScore, validateProject, newProject} from '../src/core/project';

const root = process.cwd();
const wasm = new WebAssembly.Module(readFileSync(join(root, 'plugin/runtime/voice_lab_engine.wasm')));
const lexicon = decodeLexicon(gunzipSync(readFileSync(join(root, 'plugin/runtime/lexicon.txt.gz'))).toString('utf8'));
const SR = 48000;
const say = (ipa: string) => {
  const plan = planSpeech(ipa, lexicon, {phonemes: true});
  return {plan, audio: renderScore(new Engine(wasm, SR, 1), plan.score)[0]};
};
/** Score events for one parameter: [time, value]. */
const events = (score: {events: Float32Array | number[]}, name: ParamName) => {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < score.events.length; i += 4) if (score.events[i + 1] === PARAM_ID[name]) out.push([score.events[i], score.events[i + 2]]);
  return out;
};
const rms = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  const i0 = Math.max(0, Math.round(a * SR)), i1 = Math.min(x.length, Math.round(b * SR));
  for (let i = i0; i < i1; i++) s += x[i] ** 2;
  return Math.sqrt(s / Math.max(1, i1 - i0));
};
/** Power-weighted mean frequency (Hz) of x between two times, 1–11 kHz, by a plain DFT on a 1024-sample grid. */
function centroid(x: Float32Array, a: number, b: number): number {
  const n = 1024;
  let num = 0, den = 0;
  for (let start = Math.round(a * SR); start + n <= Math.round(b * SR); start += n / 2) {
    for (let k = Math.round((1000 * n) / SR); k <= Math.round((11000 * n) / SR); k++) {
      let re = 0, im = 0;
      for (let i = 0; i < n; i++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
        re += w * x[start + i] * Math.cos((2 * Math.PI * k * i) / n);
        im -= w * x[start + i] * Math.sin((2 * Math.PI * k * i) / n);
      }
      const p = re * re + im * im;
      num += p * ((k * SR) / n);
      den += p;
    }
  }
  return num / den;
}

test('sound marks are read from IPA and from ARPABET', () => {
  const {words, errors} = parsePhonemeInput('/pʰal p˭al bʱal bɔ̃ mã a̤ tʲʰa ak̚/');
  assert.deepEqual(errors, []);
  const first = (k: number) => words[k].phones[0];
  assert.equal(first(0).aspirated, true);
  assert.equal(first(1).aspirated, false);
  assert.equal(first(2).breathy, true);
  assert.deepEqual([words[3].phones[1].symbol, words[3].phones[1].nasalized], ['AO', true]);
  assert.equal(words[4].phones[1].nasalized, true, 'a precomposed ã is a + tilde');
  assert.equal(first(5).breathy, true);
  assert.deepEqual([first(6).symbol, first(6).aspirated], ['TJ', true]);
  assert.equal(words[7].phones[1].unreleased, true);
  assert.deepEqual(parsePhone('T^'), {symbol: 'T', stress: 0, aspirated: true});
  assert.deepEqual(parsePhone('T='), {symbol: 'T', stress: 0, aspirated: false});
  assert.deepEqual(parsePhone('AA1~'), {symbol: 'AA', stress: 1, nasalized: true});
  assert.deepEqual(parsePhone('B%'), {symbol: 'B', stress: 0, breathy: true});
  assert.deepEqual(parsePhone('K-'), {symbol: 'K', stress: 0, unreleased: true});
  // Unmarked input plans exactly as before: no mark keys on the segments.
  assert.ok(planSpeech('Please call me.', lexicon).segments.every(s => s.aspirated === undefined && s.nasalized === undefined && s.breathy === undefined));
});

test('aspiration: a marked stop decides its own voice onset, whatever English would do', () => {
  // English would aspirate neither (after s) nor leave the second unaspirated (before a stressed vowel).
  const onset = (text: string) => {
    const {plan} = say(text);
    const stop = plan.segments.find(s => s.symbol === 'T')!;
    return events(plan.score, 'voicing').find(([t, v]) => t > stop.start && v === 1)![0] - stop.end;
  };
  assert.ok(onset('S T^ AA1') - onset('S T AA1') > 0.03, 'T^ after S is aspirated');
  assert.ok(onset('T AA1') - onset('T= AA1') > 0.03, 'T= before a stressed vowel is not');
  // Heard in the sound: the vowel reaches its level later after the aspirated stop.
  const rise = (text: string) => {
    const {plan, audio} = say(text);
    const stop = plan.segments.find(s => s.symbol === 'T')!;
    const full = rms(audio, stop.end + 0.12, stop.end + 0.16);
    for (let t = stop.end - 0.01; t < stop.end + 0.2; t += 0.002) if (rms(audio, t, t + 0.01) > 0.5 * full) return t - stop.end;
    return NaN;
  };
  assert.ok(rise('T^ AA1') - rise('T= AA1') > 0.02, `voice onset ${rise('T^ AA1').toFixed(3)} vs ${rise('T= AA1').toFixed(3)} s`);
});

test('nasalized vowels lower the velum for the vowel and raise it before an obstruent', () => {
  const {plan} = say('B AO1~ T');
  const vowel = plan.segments.find(s => s.symbol === 'AO')!;
  const stop = plan.segments.find(s => s.symbol === 'T')!;
  const velum = events(plan.score, 'velum');
  assert.ok(velum.some(([t, v]) => v > 0.4 && t < vowel.start + 0.01), 'velum opens for the vowel');
  assert.ok(velum.some(([t, v]) => v === 0 && t > vowel.start && t < stop.start), 'and is shut when the stop begins');
  assert.ok(!events(say('B AO1 T').plan.score, 'velum').some(([, v]) => v > 0), 'a plain vowel leaves it shut');
});

test('breathy voice: the folds part through the release of a breathy stop and under a breathy vowel', () => {
  for (const text of ['B% AA1', 'AA1 B% AA1', 'AA1%']) {
    const {plan, audio} = say(text);
    assert.ok(events(plan.score, 'voicing').some(([, v]) => Math.abs(v - 0.6) < 1e-6), `${text}: breathy adduction`);
    assert.ok(audio.every(Number.isFinite));
  }
  // The murmur keeps sounding: the vowel after bʱ is not silent while the folds are apart.
  const {plan, audio} = say('B% AA1');
  const b = plan.segments.find(s => s.symbol === 'B')!;
  const murmur = rms(audio, b.end + 0.03, b.end + 0.08), full = rms(audio, b.end + 0.15, b.end + 0.2);
  assert.ok(murmur > 0.3 * full && murmur < 0.85 * full, `murmur ${murmur.toFixed(3)} against ${full.toFixed(3)}`);
});

test('an unreleased final stop has no burst', () => {
  const peakAfter = (text: string) => {
    const {plan, audio} = say(text);
    const k = plan.segments.find(s => s.symbol === 'K')!;
    let peak = 0;
    for (let i = Math.round((k.end - 0.01) * SR); i < Math.min(audio.length, Math.round((k.end + 0.2) * SR)); i++) peak = Math.max(peak, Math.abs(audio[i]));
    return peak;
  };
  assert.ok(peakAfter('AA1 K-') < 0.5 * peakAfter('AA1 K'), `${peakAfter('AA1 K-').toFixed(4)} vs ${peakAfter('AA1 K').toFixed(4)}`);
});

test('the new sibilants sit between s and the retroflex: s > ɕ > ʂ', () => {
  const hiss = (ipa: string, symbol: string) => {
    const {plan, audio} = say(ipa);
    const f = plan.segments.find(s => s.symbol === symbol)!;
    const d = f.end - f.start;
    return centroid(audio, f.start + 0.3 * d, f.start + 0.8 * d);
  };
  const s = hiss('ˈasa', 'S'), sc = hiss('ˈaɕa', 'SC'), sr = hiss('ˈaʂa', 'SR');
  assert.ok(s > sc + 300 && sc > sr + 300, `centroids s ${s.toFixed(0)}, ɕ ${sc.toFixed(0)}, ʂ ${sr.toFixed(0)} Hz`);
  const {words, errors} = parsePhonemeInput('/tɕa dʑa tʂa dʐa ʑa ʐa ɥi ɯ e o/');
  assert.deepEqual(errors, []);
  assert.deepEqual(words.map(w => w.phones[0].symbol), ['CC', 'JC', 'CR', 'JR', 'ZC', 'ZR', 'YW', 'UU', 'E', 'O']);
  for (const sym of ['SC', 'ZC', 'CC', 'JC', 'SR', 'ZR', 'CR', 'JR', 'YW', 'E', 'O', 'U', 'EO', 'UU']) assert.ok(PHONEMES[sym], sym);
});

test('Korean: Hangul blocks become phones with the sound rules', () => {
  const flat = (w: string) => koreanSyllables(w).map(s => s.phones.map(p => p.symbol + (p.unreleased ? '!' : '')).join(' ')).join(' | ');
  assert.equal(flat('안녕하세요'), 'AA N | N Y EO NG | HH AA | S E | Y O');
  assert.equal(flat('학교'), 'HH AA K! | K Y O', 'a lax stop is tense after a stop');
  assert.equal(flat('국물'), 'K U NG | M U L', 'a stop is nasal before a nasal');
  assert.equal(flat('같이'), 'K AA | CC IY', 'ㅌ before 이 is ㅊ');
  assert.equal(flat('좋아'), 'CC O | AA', 'ㅎ is silent before a vowel');
  assert.equal(flat('싫어'), 'SC IY | DX EO', 'and the consonant before it moves over');
  assert.equal(flat('값이'), 'K AA P! | SC IY');
  assert.equal(flat('신라'), 'SC IY L | L AA', 'ㄴ and ㄹ meet as ll');
  assert.equal(flat('설날'), 'S EO L | L AA L');
  assert.equal(flat('독립'), 'T O NG | N IY P!');
  assert.equal(flat('축하'), 'CC U | K AA', 'a stop and ㅎ merge');
  assert.equal(flat('사랑해'), 'S AA | DX AA NG | HH EH');
  // The three kinds of stop differ in voice onset, and a lax one is voiced between voiced sounds.
  const vot = (w: string) => koreanSyllables(w)[0].phones[0].vot!;
  assert.ok(vot('딸') < vot('달') && vot('달') < vot('탈'));
  assert.equal(koreanSyllables('바다')[1].phones[0].symbol, 'D');
});

test('Korean text is spoken and sung: one block per note, no guessing warning', () => {
  assert.deepEqual(tokenize('안녕하세요, world!').map(t => [t.text, t.boundary]), [['안녕하세요', 'comma'], ['world', 'exclaim']]);
  assert.equal(phonemize('사랑해', lexicon)[0].source, 'korean');
  const plan = planSpeech('안녕하세요. 감사합니다.', lexicon);
  assert.deepEqual(plan.warnings, []);
  const audio = renderScore(new Engine(wasm, SR, 1), plan.score)[0];
  assert.ok(audio.every(Number.isFinite) && rms(audio, 0.2, 1) > 0.01);
  const syl = lyricSyllables('사랑해 - 노래!', lexicon);
  assert.deepEqual(syl.map(s => s.text), ['사', '랑', '해', '–', '노', '래!']);
  const notes = [0, 1, 2, 3, 4, 5].map(k => ({start: k, length: 1, midi: 62 + k}));
  const song = planSong(notes, '사랑해 - 노래!', lexicon, {bpm: 120});
  assert.equal(song.assignments.length, 6);
  assert.ok(renderScore(new Engine(wasm, SR, 1), song.score)[0].every(Number.isFinite));
});

test('an imported score becomes a song within the limits', () => {
  const long = {bpm: 480, notes: Array.from({length: 3000}, (_, k) => ({start: k, length: 1, midi: 60 + (k % 12)})), lyrics: 'la '.repeat(3000).trim(), parts: [], part: '', warnings: []};
  const {song, messages} = songFromScore(long);
  assert.equal(song.bpm, 240, 'tempo halved into range');
  assert.ok(song.notes.length <= LIMITS.notes && song.notes.length > 1000);
  assert.ok(song.notes.every(n => ((n.start + n.length) * 60) / song.bpm <= LIMITS.seconds));
  assert.ok(messages.some(m => /longer than a song can be/.test(m)));
  assert.ok(song.lyrics.length <= LIMITS.lyrics);
  const p = newProject();
  validateProject({...p, song: {...p.song, ...song}});
});

test('with the voice off the airway is silent in every extreme pose once it is held', () => {
  // Corners of the articulator space, held and swept between, with no breath (gate 0):
  // an unstable tube would ring or squeal by itself here.
  const names: ParamName[] = ['tongueX', 'tongueY', 'tipPlace', 'tipClose', 'dorsumClose', 'jaw', 'lipOpen', 'lipRound', 'velum', 'throat', 'tractLength', 'pharynx', 'larynx', 'rhotic'];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (const rate of [16000, 48000]) {
    const ev: ScoreEvent[] = [[0, 'gate', 0, 0]];
    const poses = 20;
    for (let k = 0; k < poses; k++) for (const n of names) {
      const spec = PARAMS.find(p => p.name === n)!;
      ev.push([0.05 + k, n, rnd() < 0.5 ? spec.min : spec.max, 30]);
    }
    const audio = renderScore(new Engine(wasm, rate, 3), compileScore(ev, 0.05 + poses))[0];
    assert.ok(audio.every(Number.isFinite));
    // Slamming from one corner to another moves air and thumps; once the pose is held it must be silent.
    let held = 0;
    for (let k = 0; k < poses; k++) for (let i = Math.round((0.75 + k) * rate); i < Math.round((1.05 + k) * rate) && i < audio.length; i++) held = Math.max(held, Math.abs(audio[i]));
    assert.ok(held < 0.005, `held peak ${held.toFixed(4)} at ${rate} Hz`);
  }
});
