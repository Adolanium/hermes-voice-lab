import test from 'node:test';
import assert from 'node:assert/strict';
import {planText,planPhonemes,planLyrics} from '../audio/planner.js';
test('unknown words never silently become guessed speech',()=>{assert.deepEqual(planText('hello unknownword').events,[]);assert.deepEqual(planText('unknownword').unsupported,['unknownword']);});
test('gesture score is contiguous and articulates the original phrase',()=>{const p=planText('we sing a new tune');assert.ok(p.duration>1);p.events.forEach((e,i)=>{assert.ok(e.duration>0);if(i)assert.ok(Math.abs(e.time-p.events[i-1].time-p.events[i-1].duration)<1e-9);});});
test('direct phonemes reject unsupported tokens',()=>{assert.deepEqual(planPhonemes('AA NOTAPHONE').unsupported,['NOTAPHONE']);});
test('lyrics respect exact note boundaries',()=>{const p=planLyrics('blue moon',[{pitch:220,duration:.7},{pitch:247,duration:1.2}]);assert.ok(Math.abs(p.duration-1.9)<1e-9);assert.ok(p.events.some(e=>Math.abs(e.time-.7)<1e-9));});
test('planner rejects unbounded timing',()=>{assert.throws(()=>planText('hello',{rate:0}));assert.throws(()=>planLyrics('moon',[{pitch:220,duration:Infinity}]));});
