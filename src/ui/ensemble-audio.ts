import {ensembleWorkerSource} from '../generated/assets';
import {engineModule} from './assets';
import {type EnsembleMix, type PlannedSinger} from '../core/ensemble';

export function prepareMix(parts: PlannedSinger[], rate: number, signal: AbortSignal): Promise<EnsembleMix> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([ensembleWorkerSource], {type: 'text/javascript'}));
    let worker: Worker;
    try {
      worker = new Worker(url);
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
    const finish = () => {
      worker.terminate();
      URL.revokeObjectURL(url);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException('Stopped', 'AbortError'));
    };
    signal.addEventListener('abort', abort, {once: true});
    worker.onerror = (e) => {
      finish();
      reject(new Error(e.message || 'Could not start the vocal engine.'));
    };
    worker.onmessage = (e) => {
      finish();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.mix);
    };
    try {
      worker.postMessage({module: engineModule(), parts, rate});
    } catch (e) {
      finish();
      reject(e);
    }
  });
}
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
