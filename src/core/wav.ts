/** 16-bit PCM WAV encoding (mono or stereo). */
export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const n = channels[0]?.length ?? 0;
  const ch = channels.length;
  const bytes = new Uint8Array(44 + n * ch * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + n * ch * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, n * ch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = channels[c][i];
      const s = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
      view.setInt16(o, Math.round(s * 32767), true);
      o += 2;
    }
  }
  return bytes;
}

export function measure(x: Float32Array) {
  let peak = 0;
  let sum = 0;
  for (const v of x) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  return {peak, rms: Math.sqrt(sum / Math.max(1, x.length))};
}
