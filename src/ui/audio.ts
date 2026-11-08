/**
 * Audio session: AudioContext + worklet node + analyser, started only from a
 * user gesture and fully released on dispose. One live voice per window; a
 * BroadcastChannel silences other windows when this one starts playing.
 */
import {Engine, renderScore, type Score} from '../core/engine';
import {PARAM_NAMES, type ParamName, type Patch} from '../core/params';
import {encodeWav, measure} from '../core/wav';
import {engineBytes, engineModule, workletSource} from './assets';

export interface Telemetry {
  params: Float32Array;
  areas: Float32Array;
  state: Float32Array;
  glottal?: Float32Array;
  time: number;
}

export type AudioStatus = 'off' | 'starting' | 'running' | 'error';

type Listener = () => void;

const CHANNEL = 'hermes-voice-lab:audio';

export class VoiceAudio {
  status: AudioStatus = 'off';
  error = '';
  sampleRate = 0;
  telemetry: Telemetry | null = null;
  glottal: Float32Array | null = null;
  analyser: AnalyserNode | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private master: GainNode | null = null;
  private listeners = new Set<Listener>();
  private telemetryListeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  private readonly id = Math.random().toString(36).slice(2);
  private starting: Promise<void> | null = null;
  private disposed = false;

  constructor() {
    try {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = ({data}) => {
        if (data?.type === 'claim' && data.id !== this.id) this.silence();
      };
    } catch {
      this.channel = null;
    }
  }

  onStatus(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  onTelemetry(fn: Listener) {
    this.telemetryListeners.add(fn);
    return () => void this.telemetryListeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach(fn => fn());
  }

  get running() {
    return this.status === 'running';
  }

  /** Must be called from a user gesture the first time. */
  start(patch: Patch): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Audio session closed'));
    if (this.running) {
      void this.ctx?.resume();
      return Promise.resolve();
    }
    return (this.starting ??= this.boot(patch).finally(() => (this.starting = null)));
  }

  private async boot(patch: Patch) {
    this.status = 'starting';
    this.emit();
    const url = URL.createObjectURL(new Blob([workletSource], {type: 'text/javascript'}));
    try {
      const ctx = new AudioContext({latencyHint: 'interactive'});
      this.ctx = ctx;
      await ctx.audioWorklet.addModule(url);
      const wasm = engineBytes().slice().buffer;
      const node = new AudioWorkletNode(ctx, 'hermes-voice-lab', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {wasm, seed: (Math.random() * 2 ** 31) | 0, patch, telemetryHz: 45},
      });
      node.port.onmessage = ({data}) => {
        if (data?.type === 'telemetry') {
          this.telemetry = data;
          if (data.glottal) this.glottal = data.glottal;
          this.telemetryListeners.forEach(fn => fn());
        } else if (data?.type === 'error') {
          this.error = data.message;
          this.emit();
        }
      };
      node.onprocessorerror = () => {
        this.status = 'error';
        this.error = 'The audio processor stopped unexpectedly.';
        this.emit();
      };
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.6;
      const master = ctx.createGain();
      master.gain.value = 1;
      node.connect(analyser);
      analyser.connect(master);
      master.connect(ctx.destination);
      this.node = node;
      this.analyser = analyser;
      this.master = master;
      this.sampleRate = ctx.sampleRate;
      if (this.disposed) {
        await this.close();
        return;
      }
      await ctx.resume();
      this.status = 'running';
      this.emit();
    } catch (error) {
      this.status = 'error';
      this.error = (error as Error).message || String(error);
      await this.close();
      this.emit();
      throw error;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private post(message: unknown, transfer: Transferable[] = []) {
    this.node?.port.postMessage(message, transfer);
  }

  /** Tell other windows to stop; call before audible playback starts. */
  claim() {
    this.channel?.postMessage({type: 'claim', id: this.id});
  }

  set(name: ParamName, value: number, tau = -1) {
    this.post({type: 'set', name, value, tau});
  }
  patch(patch: Patch, tau = -1) {
    this.post({type: 'patch', patch, tau});
  }
  jump(patch: Patch) {
    this.post({type: 'jump', patch});
  }
  play(score: Score, loop = false) {
    this.claim();
    const events = score.events.slice();
    this.post({type: 'score', events, length: score.length, loop}, [events.buffer]);
  }
  stopScore() {
    this.post({type: 'stop'});
  }
  /** Stop everything audible (score + held note). */
  silence() {
    this.post({type: 'silence'});
  }

  setVolume(v: number) {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(Math.max(0, Math.min(1.5, v)), this.ctx.currentTime, 0.02);
  }

  private async close() {
    try {
      this.post({type: 'dispose'});
      this.node?.disconnect();
      this.analyser?.disconnect();
      this.master?.disconnect();
      if (this.node) this.node.port.onmessage = null;
      if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close();
    } catch {
      /* already closed */
    }
    this.node = null;
    this.analyser = null;
    this.master = null;
    this.ctx = null;
    this.telemetry = null;
  }

  /** Turn audio off; the session can be started again. */
  async stop() {
    await this.starting?.catch(() => undefined);
    await this.close();
    this.status = 'off';
    this.emit();
  }

  /** Release everything permanently (unmount, plugin disable, reload). */
  async dispose() {
    this.disposed = true;
    this.channel?.close();
    this.channel = null;
    await this.stop();
    this.listeners.clear();
    this.telemetryListeners.clear();
  }
}

/** Main-thread engine for analysis (formants, area previews). Not used for sound. */
let analysisEngine: Engine | null = null;
export function analysis(): Engine {
  return (analysisEngine ??= new Engine(engineModule(), 48000, 1));
}

/**
 * Render a score to WAV bytes with the same engine, off the audio thread, in
 * slices so the UI stays responsive.
 */
export async function renderWav(score: Score, patch: Patch, sampleRate = 48000, onProgress?: (f: number) => void) {
  const engine = new Engine(engineModule(), sampleRate, 1);
  // renderScore is synchronous; render in chunks by splitting the work.
  const total = Math.ceil((score.length + 0.6) * sampleRate);
  engine.jumpAll(patch);
  engine.loadScore(score);
  engine.play(false);
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  for (let at = 0; at < total;) {
    const sliceEnd = Math.min(total, at + sampleRate);
    for (; at < sliceEnd; at += 1024) {
      const [l, r] = engine.render(Math.min(1024, sliceEnd - at));
      left.set(l, at);
      right.set(r, at);
    }
    onProgress?.(at / total);
    await new Promise(r => setTimeout(r, 0));
  }
  return {bytes: encodeWav([left, right], sampleRate), seconds: total / sampleRate, ...measure(left)};
}

export {renderScore, PARAM_NAMES};
