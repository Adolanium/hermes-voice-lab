/**
 * AudioWorklet processor: owns one engine instance on the audio thread.
 * Only renders and applies messages; no planning, I/O or drawing here.
 */
import {Engine, type Score} from '../core/engine';
import type {ParamName, Patch} from '../core/params';

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

type Message =
  | {type: 'set'; name: ParamName; value: number; tau?: number}
  | {type: 'patch'; patch: Patch; tau?: number}
  | {type: 'jump'; patch: Patch}
  | {type: 'score'; events: Float32Array; length: number; loop?: boolean}
  | {type: 'stop'}
  | {type: 'silence'}
  | {type: 'dispose'};

class VoiceProcessor extends AudioWorkletProcessor {
  private engine: Engine;
  private alive = true;
  private frames = 0;
  private sent = 0;
  private readonly every: number;

  constructor(options: {processorOptions: {wasm: ArrayBuffer; seed: number; patch: Patch; telemetryHz?: number}}) {
    super();
    const o = options.processorOptions;
    this.engine = new Engine(new WebAssembly.Module(o.wasm), sampleRate, o.seed);
    this.engine.jumpAll(o.patch ?? {});
    this.every = Math.round(sampleRate / (o.telemetryHz ?? 45));
    this.port.onmessage = ({data}: MessageEvent<Message>) => {
      try {
        this.handle(data);
      } catch (error) {
        this.port.postMessage({type: 'error', message: (error as Error).message});
      }
    };
    this.port.postMessage({type: 'ready', sampleRate});
  }

  private handle(m: Message) {
    switch (m.type) {
      case 'set':
        this.engine.set(m.name, m.value, m.tau ?? -1);
        break;
      case 'patch':
        this.engine.apply(m.patch, m.tau ?? -1);
        break;
      case 'jump':
        this.engine.jumpAll(m.patch);
        break;
      case 'score': {
        const score: Score = {events: m.events, length: m.length};
        this.engine.loadScore(score);
        this.engine.play(!!m.loop);
        break;
      }
      case 'stop':
        this.engine.stop();
        break;
      case 'silence':
        this.engine.stop();
        this.engine.set('gate', 0, 15);
        break;
      case 'dispose':
        this.engine.stop();
        this.alive = false;
        this.port.onmessage = null;
        break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!this.alive || !out || !out[0]) return this.alive;
    const n = out[0].length;
    const [l, r] = this.engine.render(n);
    out[0].set(l);
    if (out[1]) out[1].set(r);
    this.frames += n;
    if (this.frames - this.sent >= this.every) {
      this.sent = this.frames;
      const state = this.engine.state();
      const glottal = (this.frames / this.every) % 6 < 1 ? this.engine.glottalShape(96) : undefined;
      this.port.postMessage({type: 'telemetry', params: this.engine.params(), areas: this.engine.areas(), state, glottal, time: currentTime});
    }
    return true;
  }
}

registerProcessor('hermes-voice-lab', VoiceProcessor);
