export const PARAMS = Object.freeze({tongueX:[0,1],tongueY:[0,1],jaw:[0,1],lip:[0,1],pitch:[80,400],breath:[0,1],vibrato:[0,1],gain:[0,1],gate:[0,1],voicing:[0,1],frication:[0,1],nasal:[0,1]});
export const DEFAULT_PARAMS = Object.freeze({tongueX:.58,tongueY:.42,jaw:.44,lip:.64,pitch:205,breath:.16,vibrato:.12,gain:.65,gate:0,voicing:1,frication:0,nasal:0});
export const VOWELS = Object.freeze({
  ah:{label:'Ah',params:{tongueX:.28,tongueY:.5,jaw:.95,lip:.85}},
  ee:{label:'Ee',params:{tongueX:.85,tongueY:.96,jaw:.13,lip:.65}},
  oo:{label:'Oo',params:{tongueX:.43,tongueY:.83,jaw:.18,lip:.06}},
  eh:{label:'Eh',params:{tongueX:.73,tongueY:.65,jaw:.57,lip:.7}},
  oh:{label:'Oh',params:{tongueX:.31,tongueY:.61,jaw:.6,lip:.2}},
});
const names=Object.keys(PARAMS);
export function validateParams(params={}) {
  const result={};
  for(const [key,value] of Object.entries(params)) {
    if(!PARAMS[key]) throw new TypeError(`Unknown parameter: ${key}`);
    const [lo,hi]=PARAMS[key];
    if(typeof value!=='number'||!Number.isFinite(value)||value<lo||value>hi) throw new RangeError(`${key} must be between ${lo} and ${hi}`);
    result[key]=value;
  }
  return result;
}
export function createEngine(wasmBytes,sampleRate=48000,seed=1) {
  if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000) throw new RangeError('Sample rate must be 8000–192000 Hz');
  const module=wasmBytes instanceof WebAssembly.Module?wasmBytes:new WebAssembly.Module(wasmBytes);
  const {exports:e}=new WebAssembly.Instance(module,{});
  e.init(sampleRate,seed);
  return {sampleRate,
    setParams(params){for(const [key,value] of Object.entries(validateParams(params)))e.set_param(names.indexOf(key),value);},
    render(frames){if(!Number.isInteger(frames)||frames<0||frames>4096)throw new RangeError('Render block must be 0–4096 frames');return new Float32Array(e.memory.buffer,e.render(frames),frames);},
    getParams(){return Object.fromEntries(names.map((name,id)=>[name,e.current_param(id)]));},
    getGeometry(){return new Float32Array(e.memory.buffer,e.geometry(),44).slice();},
    reset(seed=1){e.init(sampleRate,seed);},
  };
}
export function normalizeEvents(events=[]) {
  if(!Array.isArray(events)||events.length>10000)throw new TypeError('Expected at most 10000 events');
  return events.map(event=>{
    const {time,duration}=event;
    if(!Number.isFinite(time)||time<0||!Number.isFinite(duration)||duration<=0||time+duration>300)throw new RangeError('Events must fit within 300 seconds');
    return {time,duration,params:validateParams(event.params)};
  }).sort((a,b)=>a.time-b.time);
}
// Sample-frame scheduling shared by live worklet and WAV renderer.
export class Timeline {
  constructor(engine,events,{loop=false}={}) {
    this.engine=engine;this.events=normalizeEvents(events);this.frame=0;this.index=0;this.off=Infinity;this.loop=loop;
    this.end=Math.max(0,...this.events.map(e=>Math.round((e.time+e.duration)*engine.sampleRate)));
    this.engine.setParams({gate:0});
  }
  render(frames,out=new Float32Array(frames)) {
    let offset=0;
    while(offset<frames){
      if(this.loop&&this.end>0&&this.frame>=this.end){this.frame=0;this.index=0;this.off=Infinity;}
      if(this.frame>=this.off){this.engine.setParams({gate:0});this.off=Infinity;}
      while(this.index<this.events.length&&Math.round(this.events[this.index].time*this.engine.sampleRate)<=this.frame){
        const e=this.events[this.index++];this.engine.setParams({gate:1,...e.params});this.off=Math.round((e.time+e.duration)*this.engine.sampleRate);
      }
      const next=this.index<this.events.length?Math.round(this.events[this.index].time*this.engine.sampleRate):Infinity;
      let count=Math.min(frames-offset,4096,next-this.frame,this.off-this.frame,this.loop&&this.end>0?this.end-this.frame:Infinity);
      count=Math.max(1,count);out.set(this.engine.render(count),offset);offset+=count;this.frame+=count;
    }
    return out;
  }
}
