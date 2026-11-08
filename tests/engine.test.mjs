import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEngine,Timeline,VOWELS} from '../audio/engine.js';
import {renderWav,renderFloat} from '../audio/offline.js';
const wasm=await readFile(new URL('../audio/hermes_tract.wasm',import.meta.url));
function pitchOf(samples,rate,target){
  const start=Math.floor(rate*.2),length=Math.min(Math.floor(rate*.4),samples.length-start-Math.ceil(rate/80));
  let best=-Infinity,lagBest=0;
  for(let lag=Math.floor(rate/target*.88);lag<=Math.ceil(rate/target*1.12);lag++){
    let sum=0,a=0,b=0;for(let i=start;i<start+length;i++){const x=samples[i],y=samples[i+lag];sum+=x*y;a+=x*x;b+=y*y;}
    const correlation=sum/Math.sqrt(a*b);if(correlation>best){best=correlation;lagBest=lag;}
  }return rate/lagBest;
}
test('sustained pitch is within 1% at 44.1, 48 and 96 kHz',()=>{
  for(const sampleRate of [44100,48000,96000])for(const pitch of [110,205,330]){
    const r=renderFloat(wasm,{patch:{pitch,breath:0,vibrato:0},duration:.8,sampleRate});
    const actual=pitchOf(r.samples,sampleRate,pitch);assert.ok(Math.abs(actual/pitch-1)<.01,`${sampleRate}: expected ${pitch}, got ${actual}`);
    assert.ok(r.rms>.005&&r.rms<.5);assert.ok(r.peak<1);
  }
});
test('same engine and timeline give identical samples across render block sizes',()=>{
  const events=[{time:.013,duration:.27,params:{...VOWELS.ee.params,pitch:196}},{time:.31,duration:.23,params:{...VOWELS.oo.params,pitch:220}}];
  const offline=renderFloat(wasm,{events,duration:.8});const engine=createEngine(wasm);const timeline=new Timeline(engine,events);const live=new Float32Array(offline.frames);
  for(let i=0;i<live.length;i+=128)live.set(timeline.render(Math.min(128,live.length-i)),i);
  assert.deepEqual(live,offline.samples);
});
test('geometry changes rendered output, nose branch and noise affect output',()=>{
  const base=renderFloat(wasm,{patch:{...VOWELS.ah.params},duration:.5});
  for(const patch of [VOWELS.ee.params,VOWELS.oo.params,{nasal:1},{voicing:0,frication:.8}]){
    const changed=renderFloat(wasm,{patch,duration:.5});let diff=0;for(let i=0;i<base.frames;i++)diff+=(base.samples[i]-changed.samples[i])**2;
    assert.ok(Math.sqrt(diff/base.frames)>.01);
  }
  const e=createEngine(wasm);e.setParams(VOWELS.ee.params);for(let i=0;i<10;i++)e.render(4096);const ee=e.getGeometry();e.setParams(VOWELS.oo.params);for(let i=0;i<10;i++)e.render(4096);assert.notDeepEqual(ee,e.getGeometry());
});
test('WAV is mono PCM16 with exact rate, duration, bounded samples and deterministic bytes',()=>{
  const project={sampleRate:44100,events:[{time:.1,duration:.2,params:{gate:1}}],duration:.6};
  const a=renderWav(wasm,project),b=renderWav(wasm,project);assert.deepEqual(a.wav,b.wav);
  const v=new DataView(a.wav);assert.equal(v.getUint16(22,true),1);assert.equal(v.getUint16(34,true),16);assert.equal(v.getUint32(24,true),44100);assert.equal(a.frames,26460);assert.equal(a.wav.byteLength,44+a.frames*2);
  assert.ok(a.samples.slice(0,4000).every(x=>x===0));assert.ok(a.samples.slice(-1000).every(x=>Math.abs(x)<1e-5));
});
test('10 second extreme articulation sweep remains finite and bounded',()=>{
 const e=createEngine(wasm);e.setParams({gate:1});let peak=0;
 for(let i=0;i<120;i++){
  e.setParams({tongueX:(i%2),tongueY:(i%3)/2,jaw:(i%5)/4,lip:i%2,nasal:i%2,pitch:80+(i*29)%321,frication:(i%4)/3,voicing:i%2});
  for(const x of e.render(4000)){assert.ok(Number.isFinite(x)&&Math.abs(x)<=1);peak=Math.max(peak,Math.abs(x));}
 }
 assert.ok(peak>.01);
});
test('invalid inputs are rejected before WASM',()=>{
 const e=createEngine(wasm);assert.throws(()=>e.setParams({pitch:NaN}));assert.throws(()=>e.setParams({pitch:401}));assert.throws(()=>e.setParams({unknown:1}));assert.throws(()=>e.render(5000));assert.throws(()=>renderFloat(wasm,{duration:301}));assert.throws(()=>renderFloat(wasm,{events:[{time:-1,duration:1}]}));
});

test('every supported planner phone produces valid engine audio; SIL stays silent',async()=>{
 const {SUPPORTED_PHONEMES,planPhonemes}=await import('../audio/planner.js');
 for(const phone of SUPPORTED_PHONEMES){
  const plan=planPhonemes(phone);const result=renderFloat(wasm,{events:plan.events,duration:plan.duration+.2});
  assert.ok(result.samples.every(x=>Number.isFinite(x)&&Math.abs(x)<1),phone);
  if(phone==='SIL')assert.equal(result.peak,0);else assert.ok(result.peak>1e-4,`${phone}: ${result.peak}`);
 }
});
