/**
 * Thin wrapper over one WebAssembly engine instance. Works unchanged in an
 * AudioWorkletGlobalScope, a browser main thread, and Node.
 */
import {PARAM_ID, PARAM_NAMES, PARAMS, type ParamName, type Patch} from './params';

export const N_SECTIONS = 44;
export const RESPONSE_BINS = 256;
export const RESPONSE_MAX_HZ = 8000;
export const STATE = {
  internalRate: 0, length: 1, minArea: 2, minIndex: 3, nasalArea: 4, oralPressure: 5, frication: 6,
  voicing: 7, f0: 8, rms: 9, peak: 10, rd: 11, flow: 12, playing: 13, position: 14, resets: 15,
  aspiration: 16, burst: 17, scoreLength: 18, noiseIndex: 19, airflow: 20, nasalShare: 21, closed: 22,
} as const;
export const STATE_LEN = 23;
export const NASAL_SECTIONS = 30;
export const ENERGY_LEN = N_SECTIONS + NASAL_SECTIONS;

interface Exports {
  memory: WebAssembly.Memory;
  engine_init(rate: number, seed: number): void;
  engine_param_count(): number;
  param_spec(id: number): number;
  engine_set(id: number, value: number, tau: number): void;
  engine_jump(id: number, value: number): void;
  engine_render(frames: number): number;
  engine_out_left(): number;
  engine_out_right(): number;
  engine_params(): number;
  engine_areas(): number;
  engine_state(): number;
  engine_energy(): number;
  engine_glottal_shape(points: number): number;
  score_staging(): number;
  score_capacity(): number;
  score_load(count: number, length: number): number;
  score_play(loop: number): void;
  score_stop(): void;
  analysis_input(): number;
  analyze(nasal: number, length: number): number;
  shape_from_params(): number;
}

export interface Formant { frequency: number; bandwidth: number }
export interface TractResponse { magnitude: Float32Array; formants: Formant[] }

/** One scheduled parameter change: seconds, parameter, value, response ms (0 = jump, -1 = default). */
export type ScoreEvent = [time: number, param: ParamName, value: number, tau: number];

export interface Score {
  events: Float32Array; // flattened [t, id, value, tau] * n
  length: number; // seconds
}

export function compileScore(events: ScoreEvent[], length?: number): Score {
  const out = new Float32Array(events.length * 4);
  let end = 0;
  events.forEach(([t, name, v, tau], i) => {
    out[i * 4] = t;
    out[i * 4 + 1] = PARAM_ID[name];
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = tau;
    end = Math.max(end, t);
  });
  return {events: out, length: length ?? end + 0.4};
}

export class Engine {
  readonly sampleRate: number;
  private e: Exports;

  constructor(module: WebAssembly.Module, sampleRate: number, seed = 1) {
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new RangeError('Sample rate must be 8000–192000 Hz');
    this.e = new WebAssembly.Instance(module, {}).exports as unknown as Exports;
    this.sampleRate = sampleRate;
    this.e.engine_init(sampleRate, seed >>> 0 || 1);
    if (this.e.engine_param_count() !== PARAM_NAMES.length) throw new Error('Engine parameter table mismatch');
  }

  /** Engine-reported [min, max, default] for each parameter. */
  specs(): Array<[number, number, number, number]> {
    return PARAMS.map(p => Array.from(this.f32(this.e.param_spec(p.id), 4)) as [number, number, number, number]);
  }

  set(name: ParamName, value: number, tauMs = -1) {
    this.e.engine_set(PARAM_ID[name], value, tauMs);
  }
  jump(name: ParamName, value: number) {
    this.e.engine_jump(PARAM_ID[name], value);
  }
  apply(patch: Patch, tauMs = -1) {
    for (const [k, v] of Object.entries(patch)) if (typeof v === 'number') this.set(k as ParamName, v, tauMs);
  }
  jumpAll(patch: Patch) {
    for (const [k, v] of Object.entries(patch)) if (typeof v === 'number') this.jump(k as ParamName, v);
  }

  /** Render up to 4096 frames; returns views into WASM memory (copy before next call). */
  render(frames: number): [Float32Array, Float32Array] {
    const n = this.e.engine_render(Math.max(0, Math.min(4096, frames | 0)));
    return [this.f32(this.e.engine_out_left(), n), this.f32(this.e.engine_out_right(), n)];
  }

  params(): Float32Array {
    return this.f32(this.e.engine_params(), PARAM_NAMES.length).slice();
  }
  areas(): Float32Array {
    return this.f32(this.e.engine_areas(), N_SECTIONS).slice();
  }
  state(): Float32Array {
    return this.f32(this.e.engine_state(), STATE_LEN).slice();
  }
  /** Smoothed sound-wave amplitude per section (oral 0..43, then nasal), for display. */
  energy(): Float32Array {
    return this.f32(this.e.engine_energy(), ENERGY_LEN).slice();
  }
  glottalShape(points = 96): Float32Array {
    return this.f32(this.e.engine_glottal_shape(points), points).slice();
  }

  loadScore(score: Score): number {
    const capacity = this.e.score_capacity();
    const count = Math.min(capacity, score.events.length / 4);
    this.f32(this.e.score_staging(), count * 4).set(score.events.subarray(0, count * 4));
    return this.e.score_load(count, score.length);
  }
  play(loop = false) {
    this.e.score_play(loop ? 1 : 0);
  }
  stop() {
    this.e.score_stop();
  }

  /** Area function, nasal coupling and length for an arbitrary parameter set. */
  shapeFor(values: Float32Array | number[]): {areas: Float32Array; nasal: number; length: number} {
    const input = this.f32(this.e.analysis_input(), PARAM_NAMES.length);
    input.set(values);
    const out = this.f32(this.e.shape_from_params(), N_SECTIONS + 2);
    return {areas: out.slice(0, N_SECTIONS), nasal: out[N_SECTIONS], length: out[N_SECTIONS + 1]};
  }

  /** Modeled transfer function and resonances of a frozen tract shape. */
  analyze(areas: ArrayLike<number>, nasal: number, length: number): TractResponse {
    this.f32(this.e.analysis_input(), N_SECTIONS).set(areas);
    const out = this.f32(this.e.analyze(nasal, length), RESPONSE_BINS + 10);
    const formants: Formant[] = [];
    for (let k = 0; k < 5; k++) {
      const f = out[RESPONSE_BINS + 2 * k];
      if (f > 0) formants.push({frequency: f, bandwidth: out[RESPONSE_BINS + 2 * k + 1]});
    }
    return {magnitude: out.slice(0, RESPONSE_BINS), formants};
  }

  private f32(ptr: number, len: number) {
    return new Float32Array(this.e.memory.buffer, ptr, len);
  }
}

/** Render a score offline into stereo buffers. Same code path as live playback. */
export function renderScore(engine: Engine, score: Score, patch: Patch = {}, tail = 0.6): [Float32Array, Float32Array] {
  engine.jumpAll(patch);
  engine.loadScore(score);
  engine.play(false);
  const total = Math.ceil((score.length + tail) * engine.sampleRate);
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  for (let at = 0; at < total; at += 1024) {
    const [l, r] = engine.render(Math.min(1024, total - at));
    left.set(l, at);
    right.set(r, at);
  }
  return [left, right];
}
