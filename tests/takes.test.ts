import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Engine, renderInto, renderScore, type Score} from '../src/core/engine';
import {newProject, planTake, projectScore, validateProject} from '../src/core/project';
import {planSong, planSpeech} from '../src/core/planner';
import {PARAM_ID} from '../src/core/params';
import {lyricWords, validateDirections} from '../src/core/direction';
import {decodeLexicon} from '../src/core/text';
import {PhraseRecorder, readAnswer, jamMessage} from '../src/performance/jam';

const lexicon = decodeLexicon(gunzipSync(readFileSync('assets/lexicon.txt.gz')).toString());
const wasm = new WebAssembly.Module(readFileSync('plugin/runtime/voice_lab_engine.wasm'));
const notes = [0, 1, 2, 3].map(start => ({start, length: 1, midi: 69}));
const voice = newProject().voice;
const part = {notes, lyrics: 'stay stay - home', bpm: 90, style: 'natural' as const, voice};
const direction = {word: 'stay', occurrence: 2, swell: true, slide: true, vibratoAt: 0.5};

function lane(score: Score, name: keyof typeof PARAM_ID) {
  const out: number[][] = [];
  for (let i = 0; i < score.events.length; i += 4) {
    if (score.events[i + 1] === PARAM_ID[name]) out.push([score.events[i], score.events[i + 2]]);
  }
  return out;
}

test('direct the second occurrence across a held syllable without moving notes or directing the first word', () => {
  const base = planSong(notes, part.lyrics, lexicon, part);
  const edit = planSong(notes, part.lyrics, lexicon, {...part, directions: [direction]});
  assert.deepEqual(edit.segments, base.segments);
  assert.deepEqual(edit.cues, base.cues);
  assert.deepEqual(edit.assignments.map(a => a.wordIndex), [0, 1, 1, 3]);
  const vowel = edit.segments.find(s => s.word === 1 && s.symbol === 'EY')!;
  for (const name of ['loudness', 'pitch', 'vibratoDepth'] as const) {
    const a = lane(base.score, name), b = lane(edit.score, name);
    assert.deepEqual(a.filter(([t]) => t < vowel.start - 1e-5), b.filter(([t]) => t < vowel.start - 1e-5));
    assert.notDeepEqual(a, b);
  }
  const mid = (vowel.start + vowel.end) / 2;
  assert.ok(lane(edit.score, 'vibratoDepth').some(([t, v]) => Math.abs(t - mid) < 0.04 && v > 0));
  assert.deepEqual(lyricWords('Ev-er, ever! -').map(w => w.occurrence), [1, 2]);
  assert.throws(() => validateDirections([{...direction, vibratoAt: 3}]));
});

test('a kept exchange retains both parts and survives TypeScript and Python validation and rendering', () => {
  const take = {id: 'test-turn', call: {...part, lyrics: '', shape: {velum: 0.8}, bpm: 120},
    reply: {...part, voice: {...voice, breath: 0.55}, directions: [direction]}};
  const project = validateProject({...newProject(), mode: 'sing', takes: [take], activeTake: take.id});
  const roundtrip = JSON.parse(execFileSync('python3', ['-c',
    'import sys,json;from plugin import voice_backend as v; print(json.dumps(v.validate_project(json.load(sys.stdin))))'],
    {input: JSON.stringify(project), encoding: 'utf8'}));
  assert.deepEqual(validateProject(roundtrip), project);
  const show = planTake(take, lexicon);
  assert.equal(show.sections.length, 2);
  assert.ok(show.cues[0].start > show.sections[1].start);
  assert.deepEqual(projectScore(project, lexicon).score, show.score);
  const l = renderScore(new Engine(wasm, 16000), show.score)[0];
  for (const section of show.sections) assert.ok(l.subarray(section.start * 16000, section.end * 16000).some(x => Math.abs(x) > 0.02));
  assert.throws(() => validateProject({...project, activeTake: 'missing'}));
  assert.throws(() => validateProject({...project, takes: [take, take]}));
});

test('capture preserves live multisyllable words, inner rests and explicit turn IDs', () => {
  const r = new PhraseRecorder();
  r.noteOn('one', 60, 0); r.sang('hello', {token: 'hello', first: true, last: false, phones: [{symbol: 'AH', stress: 0}]});
  r.noteOff('one', 0.25);
  r.noteOn('two', 64, 0.5); r.sang('·', {token: 'hello', first: false, last: true, phones: [{symbol: 'OW', stress: 1}]});
  r.noteOff('two', 1);
  const call = r.take(120, 2)!;
  assert.equal(call.lyrics, 'hello');
  assert.equal(call.notes[1].start, 1);
  assert.match(jamMessage(call, 'turn-1'), /turn_id=turn-1/);
  assert.equal(readAnswer({turn_id: 'turn-1', notes})?.turnId, 'turn-1');
  assert.equal(readAnswer({turn_id: {}, notes}), null);
});

test('a sung final d releases into breath, with the original timing for t, unreleased stops and speech', () => {
  const one = [{start: 0, midi: 76, length: 1}];
  for (const [lyrics, extra] of [['[AE1+D]', 0.022], ['[AE1+T]', 0], ['[AE1+D-]', 0]] as const) {
    const plan = planSong(one, lyrics, lexicon, {bpm: 120});
    const stop = plan.segments.at(-2)!;
    assert.ok(lane(plan.score, 'gate').some(([t, v]) => v === 0 && Math.abs(t - stop.end - extra) < 1e-5));
  }
  const speech = planSpeech('bad', lexicon);
  assert.ok(!speech.segments.some(s => s.sungFinalD));
});

test('agent keeps a matched turn once, edits its reply, and renders the saved take through the shipped CLI', () => {
  const program = `
import json, sys, tempfile
from pathlib import Path
from unittest.mock import patch
from plugin import voice_backend as v, tool_get, tool_jam, tool_perform, tool_render
take = json.load(sys.stdin)
events = []
def deliver(event, payload):
    events.append(event)
    if event == "jam.keep":
        p = v.current_or_new("session")
        p.update(takes=[take], activeTake=take["id"], mode="sing")
        v.save_project("session", "main", p)
def call(fn, **args):
    return json.loads(fn(dict(session_id="session", **args)).splitlines()[0])
with tempfile.TemporaryDirectory() as tmp, patch.object(v, "_data_dir", return_value=Path(tmp)), patch.object(v, "_broadcast", side_effect=deliver):
    answer = call(tool_jam, turn_id=take["id"], melody="A4:1 r:1 B4:2", lyrics="stay stay")
    assert answer["ok"] and answer["turn_id"] == take["id"]
    edit = call(tool_perform, mode="sing", keep_turn=take["id"], directions=[dict(word="stay", occurrence=2, vibratoAt=0.5)])
    assert edit["ok"] and edit["render"]["peak"] > 0 and Path(edit["render"]["path"]).is_file(), edit
    result = call(tool_get)["project"]
    assert result["takes"][0]["reply"]["directions"][0]["occurrence"] == 2 and len(result["takes"]) == 1
    assert v.current_or_new("session")["takes"][0]["call"] == take["call"]
    assert call(tool_perform, mode="sing", keep_turn=take["id"], render=False)["ok"]
    assert events.count("jam.keep") == 1
    bad = call(tool_perform, mode="sing", directions=[dict(word="missing", slide=True)])
    assert not bad["ok"]
    assert call(tool_render, mode="sing", variation={"breath": 0.35})["ok"]
    assert call(tool_perform, mode="sing", directions=[dict(word="stay", occurrence=2)], render=False)["ok"]
    assert not v.current_or_new("session")["takes"][0]["reply"].get("directions")
`;
  execFileSync('python3', ['-c', program], {input: JSON.stringify({id: 'turn', call: part, reply: part})});
});

test('slicing a take for browser export consumes the same frames as an offline WAV', () => {
  const score = planTake({id: 'a', call: part, reply: {...part, directions: [direction]}}, lexicon).score;
  const rate = 16000;
  const reference = renderScore(new Engine(wasm, rate, 1), score, voice);
  const engine = new Engine(wasm, rate, 1);
  engine.jumpAll(voice);
  engine.loadScore(score);
  engine.play(false);
  const left = new Float32Array(reference[0].length), right = new Float32Array(left.length);
  for (let at = 0; at < left.length; at += rate) renderInto(engine, left, right, at, Math.min(at + rate, left.length));
  assert.deepEqual(left, reference[0]);
  assert.deepEqual(right, reference[1]);
});
