import {createEngine,Timeline} from './engine.js';
class HermesVoice extends AudioWorkletProcessor {
  constructor(options){
    super();const o=options.processorOptions;
    this.engine=createEngine(o.wasmBytes,sampleRate,o.seed||1);this.engine.setParams(o.params||{});this.blocks=0;this.timeline=null;
    this.port.onmessage=({data})=>{try{
      if(data.type==='params')this.engine.setParams(data.params);
      if(data.type==='gate')this.engine.setParams({gate:data.value});
      if(data.type==='sequence')this.timeline=new Timeline(this.engine,data.events,{loop:!!data.loop});
      if(data.type==='cancel'){this.timeline=null;this.engine.setParams({gate:0});}
    }catch(error){this.port.postMessage({type:'error',message:error.message});}};
  }
  process(inputs,outputs){
    const out=outputs[0][0];if(!out)return true;
    if(this.timeline)this.timeline.render(out.length,out);else out.set(this.engine.render(out.length));
    if(++this.blocks%12===0){let sum=0,peak=0;for(const x of out){sum+=x*x;peak=Math.max(peak,Math.abs(x));}this.port.postMessage({type:'geometry',params:this.engine.getParams(),areas:Array.from(this.engine.getGeometry()),rms:Math.sqrt(sum/out.length),peak,time:currentTime});}
    return true;
  }
}
registerProcessor('hermes-voice',HermesVoice);
