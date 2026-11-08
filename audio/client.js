import {DEFAULT_PARAMS,validateParams,normalizeEvents} from './engine.js';
export class VoiceAudio {
  /** @param {{wasmBytes?: Uint8Array | ArrayBuffer, workletSource?: string, onGeometry?: (data: {params:Record<string,number>,areas:number[],rms:number,peak:number,time:number}) => void, onState?: (state:string,error?:string) => void}} options */
  constructor({wasmBytes,workletSource,onGeometry=()=>{},onState=()=>{}}={}){Object.assign(this,{wasmBytes,workletSource,onGeometry,onState});this.params={...DEFAULT_PARAMS};this.context=null;this.node=null;this.analyser=null;this.generation=0;this.pending=null;}
  async start(params={}){
    this.setParams(params);
    if(this.pending)return this.pending;
    if(this.context&&this.node){await this.context.resume();return;}
    const generation=++this.generation;this.onState('starting');
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Context)throw new Error('This browser does not support Web Audio');
    const context=new Context({latencyHint:'interactive'});this.context=context;
    // Resume is called in the initiating user gesture before any await.
    const resume=context.resume();
    this.pending=(async()=>{
      let url;
      try{
        const bytes=this.wasmBytes||await fetch(new URL('./hermes_tract.wasm',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Cannot load voice engine');return r.arrayBuffer();});
        url=this.workletSource?URL.createObjectURL(new Blob([this.workletSource],{type:'text/javascript'})):new URL('./voice-worklet.js',import.meta.url).href;
        await context.audioWorklet.addModule(url);await resume;
        if(generation!==this.generation){await context.close().catch(()=>{});return;}
        this.node=new AudioWorkletNode(context,'hermes-voice',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{wasmBytes:bytes,params:this.params}});
        this.analyser=context.createAnalyser();this.analyser.fftSize=2048;this.node.connect(this.analyser);this.analyser.connect(context.destination);
        this.node.port.onmessage=({data})=>{if(data.type==='geometry')this.onGeometry(data);if(data.type==='error')this.onState('error',data.message);};
        this.node.onprocessorerror=()=>this.onState('error','The audio processor stopped');this.onState('running');
      }catch(error){await context.close().catch(()=>{});if(generation===this.generation){this.context=null;this.onState('error',error.message);}throw error;}
      finally{if(this.workletSource&&url)URL.revokeObjectURL(url);if(generation===this.generation)this.pending=null;}
    })();
    return this.pending;
  }
  setParams(params){Object.assign(this.params,validateParams(params));this.node?.port.postMessage({type:'params',params});}
  noteOn(midi){this.cancelSequence();this.setParams({pitch:Math.max(80,Math.min(400,440*2**((midi-69)/12))),gate:1});}
  noteOff(){this.cancelSequence();this.setParams({gate:0});}
  playSequence(events,{loop=false}={}){if(!this.node)throw new Error('Start audio before playing a sequence');this.node.port.postMessage({type:'sequence',events:normalizeEvents(events),loop});}
  cancelSequence(){this.node?.port.postMessage({type:'cancel'});}
  async stop(){++this.generation;const context=this.context;this.node?.port.close();this.node?.disconnect();this.analyser?.disconnect();this.context=null;this.node=null;this.analyser=null;this.pending=null;this.params.gate=0;if(context&&context.state!=='closed')await context.close().catch(()=>{});this.onState('idle');}
}
