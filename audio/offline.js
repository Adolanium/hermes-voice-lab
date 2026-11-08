import {createEngine,DEFAULT_PARAMS,Timeline,normalizeEvents,validateParams} from './engine.js';
export function renderFloat(wasmBytes,project={},options={}) {
  const sampleRate=options.sampleRate||project.sampleRate||48000;
  const events=normalizeEvents(project.events||[]);
  const duration=options.duration??project.duration??(events.length?Math.max(...events.map(e=>e.time+e.duration))+.25:3);
  if(!Number.isFinite(duration)||duration<=0||duration>300)throw new RangeError('Duration must be greater than 0 and at most 300 seconds');
  const engine=createEngine(wasmBytes,sampleRate,options.seed??1);
  engine.setParams({...DEFAULT_PARAMS,...validateParams(project.patch||{}),gate:events.length?0:1});
  const timeline=events.length?new Timeline(engine,events):null;
  const samples=new Float32Array(Math.ceil(duration*sampleRate));
  for(let i=0;i<samples.length;i+=4096){const n=Math.min(4096,samples.length-i);samples.set(timeline?timeline.render(n):engine.render(n),i);}
  let peak=0,sum=0;for(const x of samples){peak=Math.max(peak,Math.abs(x));sum+=x*x;}
  return {samples,sampleRate,frames:samples.length,duration:samples.length/sampleRate,peak,rms:Math.sqrt(sum/samples.length)};
}
export function encodeWav(samples,sampleRate) {
  const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
  function str(at,s){for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));}
  str(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){const x=Number.isFinite(samples[i])?Math.max(-1,Math.min(1,samples[i])):0;view.setInt16(44+i*2,Math.round(x*(x<0?32768:32767)),true);}return buffer;
}
export function renderWav(wasmBytes,project,options){const rendered=renderFloat(wasmBytes,project,options);return {...rendered,wav:encodeWav(rendered.samples,rendered.sampleRate)};}
