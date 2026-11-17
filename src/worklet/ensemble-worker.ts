import {renderEnsemble, type PlannedSinger} from '../core/ensemble';

self.onmessage = (event: MessageEvent<{module: WebAssembly.Module; parts: PlannedSinger[]; rate: number}>) => {
  try {
    const {module, parts, rate} = event.data;
    const mix = renderEnsemble(module, parts, rate);
    self.postMessage({mix}, {transfer: [mix.left.buffer, mix.right.buffer, ...mix.poses.map((p) => p.buffer)]});
  } catch (error) {
    self.postMessage({error: (error as Error).message});
  }
};
