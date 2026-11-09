/**
 * Analysis displays. "Measured" panels read the real output through an
 * AnalyserNode. "Model" panels show quantities computed by the engine model
 * (area function, transfer function, LF pulse), not measurements.
 */
import React, {useEffect, useMemo, useRef} from 'react';
import type {TractResponse} from '../core/engine';
import {noteName, hzToMidi} from '../core/params';
import {cssVar, useCanvas} from './controls';
import type {VoiceAudio} from './audio';
import {airwayActivity, type AirwayState} from './AirwayLife';

const N = 44;
const PORT = 24;

function colors(el: Element | null) {
  return {
    fg: cssVar(el, '--hvl-fg', '#16151a'),
    fg3: cssVar(el, '--hvl-fg3', '#75727e'),
    fg4: cssVar(el, '--hvl-fg4', '#a19ea8'),
    line: cssVar(el, '--hvl-line', '#dedad1'),
    accent: cssVar(el, '--hvl-accent', '#5b5bd6'),
    good: cssVar(el, '--hvl-good', '#2f9e6e'),
    warm: cssVar(el, '--hvl-warm', '#d9772b'),
    mono: cssVar(el, '--hvl-mono', 'ui-monospace, monospace'),
  };
}

function Scope({title, badge, note, children}: {title: string; badge: 'measured' | 'model'; note?: string; children: React.ReactNode}) {
  return (
    <section className="hvl-card hvl-scope">
      <header>
        <span className="hvl-kicker">{title}</span>
        <span className={`hvl-badge is-${badge}`}>{badge === 'measured' ? 'measured' : 'model'}</span>
      </header>
      {children}
      {note && <small className="hvl-note">{note}</small>}
    </section>
  );
}

export function Airway({areas, length, nasal, minIndex, activity}: {areas: Float32Array | number[]; length: number; nasal: number; minIndex: number; activity?: AirwayState}) {
  const energy = airwayActivity(activity ?? {running: false});
  const ref = useCanvas((ctx, w, h) => {
    const c = colors(ref.current);
    const padL = 12, padR = 12, padT = 18, padB = 18;
    const mid = padT + (h - padT - padB) * 0.62;
    const rMax = 1.75;
    const scale = ((h - padT - padB) * 0.36) / rMax;
    const x = (i: number) => padL + ((w - padL - padR) * i) / (N - 1);
    // Axis: distance from glottis in cm.
    ctx.font = `500 9px ${c.mono}`;
    ctx.fillStyle = c.fg4;
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, mid);
    ctx.lineTo(w - padR, mid);
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let cm = 0; cm <= length; cm += 2) {
      const px = padL + ((w - padL - padR) * cm) / length;
      ctx.fillText(`${cm}`, px - 3, h - 4);
    }
    // Tube (mirrored radius).
    const r = Array.from(areas, a => Math.sqrt(Math.max(0, a) / Math.PI) * scale);
    ctx.beginPath();
    ctx.moveTo(x(0), mid - r[0]);
    for (let i = 1; i < N; i++) ctx.lineTo(x(i), mid - r[i]);
    for (let i = N - 1; i >= 0; i--) ctx.lineTo(x(i), mid + r[i]);
    ctx.closePath();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = c.accent;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Pressure behind the constriction and the actual turbulent source location.
    if (energy.pressure > 0) {
      ctx.fillStyle = c.warm;
      ctx.globalAlpha = 0.35 * energy.pressure;
      for (let i = 0; i < minIndex; i++) ctx.fillRect(x(i), mid - r[i], Math.max(1, x(1) - x(0)), r[i] * 2);
      ctx.globalAlpha = 1;
    }
    if (energy.friction > 0.01) {
      ctx.strokeStyle = c.warm;
      ctx.lineWidth = 1 + energy.friction * 2;
      ctx.beginPath();
      ctx.arc(x(energy.noiseIndex), mid, 4 + 9 * energy.friction, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = c.good;
    ctx.globalAlpha = energy.voicing;
    ctx.fillRect(padL, mid - 8, 3, 16);
    ctx.globalAlpha = 1;
    // Nasal branch above the port.
    if (nasal > 0.01) {
      const px = x(PORT);
      const top = mid - r[PORT] - 2;
      const rn = Math.sqrt(nasal / Math.PI) * scale;
      ctx.globalAlpha = Math.min(1, 0.25 + nasal);
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.moveTo(px - rn, top);
      ctx.quadraticCurveTo(px - rn, padT, px + 18, padT - 6 + rn);
      ctx.lineTo(w - padR, padT - 6 + rn);
      ctx.lineTo(w - padR, padT - 6 - rn * 0.6);
      ctx.lineTo(px + 18, padT - 6 - rn * 0.6);
      ctx.quadraticCurveTo(px + rn, padT - rn, px + rn, top);
      ctx.closePath();
      ctx.globalAlpha *= 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Constriction marker.
    if (minIndex > 0 && minIndex < N) {
      const a = areas[minIndex];
      ctx.fillStyle = a < 0.05 ? c.warm : c.fg3;
      const px = x(minIndex);
      ctx.beginPath();
      ctx.moveTo(px, mid + r[minIndex] + 3);
      ctx.lineTo(px - 4, mid + r[minIndex] + 10);
      ctx.lineTo(px + 4, mid + r[minIndex] + 10);
      ctx.fill();
      ctx.fillText(a < 0.005 ? 'closed' : `${a.toFixed(2)} cm²`, Math.min(w - 60, px + 6), mid + r[minIndex] + 12);
    }
    ctx.fillStyle = c.fg3;
    ctx.fillText('GLOTTIS', padL, padT - 6);
    ctx.textAlign = 'right';
    ctx.fillText(`LIPS · ${length.toFixed(1)} CM`, w - padR, padT - 6);
    ctx.textAlign = 'left';
  }, [areas, length, nasal, minIndex, activity]);
  return (
    <Scope title="Airway" badge="model" note={`Pressure ${Math.round(energy.pressure * 100)}% · hiss ${Math.round(energy.friction * 100)}% · voicing ${Math.round(energy.voicing * 100)}%`}>
      <canvas ref={ref} aria-label="Modeled vocal tract area function" />
    </Scope>
  );
}

export function Spectrum({audio, running, model, f0}: {audio: VoiceAudio; running: boolean; model: TractResponse | null; f0: number}) {
  const bins = useRef<Float32Array | null>(null);
  const ref = useCanvas((ctx, w, h) => {
    const c = colors(ref.current);
    const maxHz = 8000;
    const padB = 14;
    const x = (hz: number) => (hz / maxHz) * w;
    ctx.font = `500 9px ${c.mono}`;
    ctx.fillStyle = c.fg4;
    for (let k = 1; k < 8; k++) {
      ctx.fillRect(x(k * 1000), 0, 1, h - padB);
      ctx.fillText(`${k}k`, x(k * 1000) + 2, h - 3);
    }
    ctx.globalAlpha = 1;
    const an = audio.analyser;
    if (running && an) {
      const n = an.frequencyBinCount;
      if (!bins.current || bins.current.length !== n) bins.current = new Float32Array(n);
      an.getFloatFrequencyData(bins.current as Float32Array<ArrayBuffer>);
      const nyq = audio.sampleRate / 2;
      const top = -20, floor = -110;
      ctx.beginPath();
      ctx.moveTo(0, h - padB);
      for (let i = 0; i < n; i++) {
        const hz = (i / n) * nyq;
        if (hz > maxHz) break;
        const db = Math.max(floor, Math.min(top, bins.current[i]));
        ctx.lineTo(x(hz), (h - padB) * ((top - db) / (top - floor)));
      }
      ctx.lineTo(w, h - padB);
      ctx.closePath();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = c.good;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = c.good;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (model) {
      const m = model.magnitude;
      const peak = Math.max(...m);
      ctx.beginPath();
      for (let i = 0; i < m.length; i++) {
        const y = (h - padB) * Math.min(1, Math.max(0, (peak - m[i]) / 50)) * 0.92 + 4;
        if (i === 0) ctx.moveTo(x((i / (m.length - 1)) * maxHz), y);
        else ctx.lineTo(x((i / (m.length - 1)) * maxHz), y);
      }
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      model.formants.slice(0, 4).forEach((fm, k) => {
        const px = x(fm.frequency);
        ctx.fillStyle = c.accent;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(px - 0.5, 2, 1, 8);
        ctx.globalAlpha = 1;
        ctx.fillText(`F${k + 1}`, px + 3, 10);
      });
    }
    if (running && f0 > 0) {
      ctx.fillStyle = c.fg3;
      for (let k = 1; k * f0 < maxHz && k < 40; k++) ctx.fillRect(x(k * f0), h - padB - 3, 1, 3);
    }
  }, [running, model, f0], running);
  const fmt = model?.formants.slice(0, 4).map((fm, k) => `F${k + 1} ${Math.round(fm.frequency)}`).join(' · ');
  return (
    <section className="hvl-card hvl-scope">
      <header>
        <span className="hvl-kicker">Spectrum</span>
        <span style={{display: 'flex', gap: 4}}>
          <span className="hvl-badge is-measured">measured</span>
          <span className="hvl-badge is-model">model</span>
        </span>
      </header>
      <canvas ref={ref} aria-label="Measured output spectrum with modeled tract resonances" />
      <small className="hvl-note">{fmt ? `Modeled resonances: ${fmt} Hz` : 'Modeled resonances unavailable'}{running ? '' : ' · start audio for the measured spectrum'}</small>
    </section>
  );
}

export function Waveform({audio, running}: {audio: VoiceAudio; running: boolean}) {
  const buf = useRef<Float32Array | null>(null);
  const ref = useCanvas((ctx, w, h) => {
    const c = colors(ref.current);
    ctx.fillStyle = c.line;
    ctx.fillRect(0, h / 2, w, 1);
    const an = audio.analyser;
    if (!running || !an) return;
    if (!buf.current || buf.current.length !== an.fftSize) buf.current = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf.current as Float32Array<ArrayBuffer>);
    const data = buf.current;
    const span = Math.min(data.length - 1, Math.round(audio.sampleRate * 0.025));
    let start = 0;
    for (let i = 1; i < data.length - span; i++) {
      if (data[i - 1] < 0 && data[i] >= 0) {
        start = i;
        break;
      }
    }
    let peak = 0.05;
    for (let i = start; i < start + span; i++) peak = Math.max(peak, Math.abs(data[i]));
    ctx.beginPath();
    for (let i = 0; i < span; i++) {
      const px = (i / span) * w;
      const py = h / 2 - (data[start + i] / peak) * (h * 0.42);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.strokeStyle = c.good;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }, [running], running);
  return (
    <Scope title="Waveform" badge="measured" note={running ? '25 ms of output, auto-scaled' : 'Start audio to see the output.'}>
      <canvas ref={ref} aria-label="Measured output waveform" />
    </Scope>
  );
}

export function Glottal({shape, rd, f0, voicing, sounding, activity = voicing}: {shape: Float32Array | null; rd: number; f0: number; voicing: number; sounding: boolean; activity?: number}) {
  const pts = useMemo(() => (shape ? Array.from(shape) : null), [shape]);
  const live = useRef({pts, f0, voicing, sounding, activity});
  live.current = {pts, f0, voicing, sounding, activity};
  const phase = useRef(0);
  const ref = useCanvas((ctx, w, h) => {
    const c = colors(ref.current);
    ctx.fillStyle = c.line;
    ctx.fillRect(0, h - 10, w, 1);
    if (!pts) return;
    ctx.beginPath();
    const periods = 2;
    const total = pts.length * periods;
    for (let i = 0; i <= total; i++) {
      const v = pts[i % pts.length];
      const px = (i / total) * w;
      const py = h - 10 - v * (h - 22);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.lineTo(w, h - 10);
    ctx.lineTo(0, h - 10);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = c.accent;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (sounding && voicing > 0.4 && activity > 0.01) {
      // Playhead, in step with the slowed fold view.
      const k = Math.floor(phase.current * pts.length) % pts.length;
      const px = (phase.current / periods) * w;
      const py = h - 10 - pts[k] * (h - 22);
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [pts, sounding, voicing, activity], sounding);
  // Top-down fold view, slowed 100×, driven by the modeled pulse shape and F0.
  const folds = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const {pts, f0, voicing, sounding, activity} = live.current;
      phase.current = (phase.current + dt * Math.max(0, f0) / 100) % 1;
      let open = 0.02;
      if (sounding && voicing < 0.4) open = 0.9;
      else if (sounding && pts) open = 0.04 + 0.6 * activity * Math.max(0, pts[Math.floor(phase.current * pts.length) % pts.length]);
      const el = folds.current;
      if (el) {
        // Seen from above: folds meet at the front (top) and part toward the
        // back, leaving a V-shaped glottis whose width follows the flow.
        const gap = 0.6 + 13 * open;
        const inner = (side: number) => `M 34 9 Q ${34 + side * gap * 0.5} 36 ${34 + side * gap} 59`;
        el.querySelector('.hvl-fold-l')?.setAttribute('d', `${inner(-1)} L 21 59 C 12 50 12 22 31 9 Z`);
        el.querySelector('.hvl-fold-r')?.setAttribute('d', `${inner(1)} L 47 59 C 56 50 56 22 37 9 Z`);
        el.querySelector('.hvl-glottis')?.setAttribute('d', `${inner(-1)} L ${34 + gap} 59 Q ${34 + gap * 0.5} 36 34 9 Z`);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const state = !sounding ? 'at rest' : voicing < 0.4 ? 'held open (voiceless)' : activity < 0.01 ? 'not vibrating' : 'vibrating';
  const note = f0 > 0 && sounding ? `${Math.round(f0)} Hz · ${noteName(hzToMidi(f0))} · Rd ${rd.toFixed(2)}` : `Rd ${rd.toFixed(2)}`;
  return (
    <Scope title="Glottal flow" badge="model" note={note}>
      <div className="hvl-glottal">
        <figure className="hvl-folds" title="Top-down view of the vocal folds, slowed 100×">
          <svg ref={folds} viewBox="0 0 68 68" aria-label={`Vocal folds ${state}, slowed 100 times`}>
            <circle cx="34" cy="34" r="31" className="hvl-folds-ring" />
            <path className="hvl-glottis" />
            <path className="hvl-fold-l" />
            <path className="hvl-fold-r" />
          </svg>
          <figcaption>folds · slowed 100×</figcaption>
        </figure>
        <canvas ref={ref} aria-label="Modeled glottal flow pulse" />
      </div>
    </Scope>
  );
}
