import {N_SECTIONS, RESPONSE_BINS, type TractResponse} from '../core/engine';

/** A self-contained worker keeps the desktop's single-file bundle contract.
 * It uses the existing analysis ABI and never renders or connects audio. */
export const ANALYSIS_WORKER_SOURCE = `
let engine;
self.onmessage = ({data}) => {
  try {
    if (data.module) {
      engine = new WebAssembly.Instance(data.module, {}).exports;
      engine.engine_init(48000, 1);
      self.postMessage({ready: true});
      return;
    }
    new Float32Array(engine.memory.buffer, engine.analysis_input(), ${N_SECTIONS}).set(data.areas);
    const ptr = engine.analyze(data.nasal, data.length);
    const out = new Float32Array(engine.memory.buffer, ptr, ${RESPONSE_BINS + 10});
    const magnitude = out.slice(0, ${RESPONSE_BINS});
    const formants = [];
    for (let k = 0; k < 5; k++) {
      const frequency = out[${RESPONSE_BINS} + k * 2];
      if (frequency > 0) formants.push({frequency, bandwidth: out[${RESPONSE_BINS} + k * 2 + 1]});
    }
    self.postMessage({result: {magnitude, formants}}, [magnitude.buffer]);
  } catch (error) {
    self.postMessage({error: String(error)});
  }
};
`;

interface Geometry {areas: Float32Array; nasal: number; length: number}

/** At most one analysis in flight and one pending geometry, always the latest. */
export class ModelAnalysis {
  private worker: Worker | null = null;
  private url: string | null = null;
  private ready = false;
  private busy = false;
  private disposed = false;
  private pending: Geometry | null = null;
  private last: Geometry | null = null;
  constructor(module: WebAssembly.Module, private receive: (result: TractResponse | null) => void) {
    try {
      this.url = URL.createObjectURL(new Blob([ANALYSIS_WORKER_SOURCE], {type: 'text/javascript'}));
      this.worker = new Worker(this.url);
      this.worker.onmessage = ({data}) => {
        if (this.disposed) return;
        if (data.error) { this.fail(); return; }
        if (data.ready) this.ready = true;
        else {
          this.busy = false;
          if (!this.pending) this.receive(data.result);
        }
        this.pump();
      };
      this.worker.onerror = () => this.fail();
      this.worker.postMessage({module});
    } catch {
      this.fail();
    }
  }
  request(areas: ArrayLike<number>, nasal: number, length: number) {
    if (this.disposed) return;
    const previous = this.last;
    if (previous && Math.abs(previous.nasal - nasal) < 0.0005 && Math.abs(previous.length - length) < 0.001 &&
      previous.areas.every((a, i) => Math.abs(a - areas[i]) < 0.0005)) return;
    this.last = this.pending = {areas: Float32Array.from(areas), nasal, length};
    this.pump();
  }
  private pump() {
    if (!this.ready || this.busy || !this.pending || !this.worker) return;
    this.busy = true;
    this.worker.postMessage(this.pending);
    this.pending = null;
  }
  private fail() {
    this.dispose();
    this.receive(null);
  }
  dispose() {
    this.disposed = true;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.worker = null;
    this.url = null;
    this.pending = null;
  }
}
