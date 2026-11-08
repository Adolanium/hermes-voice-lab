/** Small, theme-aware controls. */
import React, {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {PARAM_ID, PARAMS, type ParamName} from '../core/params';
import type {Telemetry, VoiceAudio} from './audio';

export function Mark() {
  // Original glyph: a vocal-fold "eye" opening around a single wave.
  return (
    <svg className="hvl-mark" viewBox="0 0 34 34" aria-hidden>
      <circle cx="17" cy="17" r="15.5" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.35" />
      <path d="M5 17 C 10 9, 24 9, 29 17 C 24 25, 10 25, 5 17 Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 17 C 11 13.5 12.5 13.5 14 17 S 17 20.5 19 17 S 22.5 13.5 25.5 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export const Icon = {
  power: <svg viewBox="0 0 16 16"><path d="M8 1.5v6M4.4 3.6a5.5 5.5 0 1 0 7.2 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>,
  play: <svg viewBox="0 0 16 16"><path d="M4.5 2.8v10.4L13 8z" fill="currentColor" /></svg>,
  stop: <svg viewBox="0 0 16 16"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor" /></svg>,
  save: <svg viewBox="0 0 16 16"><path d="M3 2.5h8l2.5 2.5v8.5h-10.5zM5.5 2.5v3.5h5v-3.5M5 13.5v-4h6v4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>,
  download: <svg viewBox="0 0 16 16"><path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  upload: <svg viewBox="0 0 16 16"><path d="M8 11V3M4.5 6 8 2.5 11.5 6M3 13.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  loop: <svg viewBox="0 0 16 16"><path d="M3 7a4 4 0 0 1 4-4h5l-2-2M13 9a4 4 0 0 1-4 4H4l2 2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  spark: <svg viewBox="0 0 16 16"><path d="M8 1.5 9.3 6.7 14.5 8 9.3 9.3 8 14.5 6.7 9.3 1.5 8 6.7 6.7Z" fill="currentColor" /></svg>,
  trash: <svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  volume: <svg viewBox="0 0 16 16"><path d="M2.5 6h2.5L8.5 3v10L5 10H2.5zM11 5.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" /></svg>,
};

export function formatValue(name: ParamName, v: number): string {
  const spec = PARAMS[PARAM_ID[name]];
  if (name === 'pitch') return `${Math.round(v)} Hz`;
  if (name === 'tractLength') return `${v.toFixed(1)} cm`;
  if (name === 'vibratoRate') return `${v.toFixed(1)} Hz`;
  if (spec.max === 1) return `${Math.round(v * 100)}%`;
  return v.toFixed(2);
}

export function Slider({name, value, onChange, agent, label, live}: {name: ParamName; value: number; onChange: (v: number) => void; agent?: boolean; label?: string; live?: number}) {
  const spec = PARAMS[PARAM_ID[name]];
  // Pitch is shown on a logarithmic (musical) scale; everything else is linear.
  const span = name === 'pitch' ? Math.log(spec.max / spec.min) : spec.max - spec.min;
  const norm = name === 'pitch' ? Math.log(Math.max(spec.min, value) / spec.min) / span : (value - spec.min) / span;
  const fraction = norm < 0 ? 0 : norm > 1 ? 1 : norm;
  const denorm = (u: number) => (name === 'pitch' ? spec.min * Math.exp(u * span) : spec.min + u * span);
  const id = `hvl-${name}`;
  const steps = 2048;
  return (
    <div className={`hvl-slider ${agent ? 'is-agent' : ''}`} title={spec.help}>
      <div className="hvl-slider-head">
        <label htmlFor={id}>{label ?? spec.label}</label>
        <output htmlFor={id}>{formatValue(name, live ?? value)}</output>
      </div>
      <input id={id} className="hvl-range" type="range" min={0} max={steps} step={1} value={Math.round(fraction * steps)}
        style={{'--p': `${fraction * 100}%`} as React.CSSProperties}
        aria-valuetext={formatValue(name, value)}
        onChange={e => onChange(Number(denorm(e.currentTarget.valueAsNumber / steps).toFixed(name === 'pitch' ? 1 : 3)))} />
    </div>
  );
}

export function Seg<T extends string>({value, options, onChange, label}: {value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string}) {
  return (
    <div className="hvl-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={v === value} className={v === value ? 'is-active' : ''} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

/** Latest worklet telemetry, re-rendering at most once per animation frame. */
export function useTelemetry(audio: VoiceAudio): Telemetry | null {
  const frame = useRef(0);
  const [, force] = useState(0);
  useEffect(() => {
    const off = audio.onTelemetry(() => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        force(n => (n + 1) % 1e6);
      });
    });
    return () => {
      off();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [audio]);
  return audio.telemetry;
}

export function useAudioStatus(audio: VoiceAudio) {
  return useSyncExternalStore(
    fn => audio.onStatus(fn),
    () => audio.status,
  );
}

/** Canvas that tracks its CSS size and redraws via `draw`. */
export function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[], animate = false) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    const paint = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, w, h);
    };
    const loop = () => {
      paint();
      raf = requestAnimationFrame(loop);
    };
    const ro = new ResizeObserver(() => paint());
    ro.observe(canvas);
    if (animate) raf = requestAnimationFrame(loop);
    else paint();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, ...deps]);
  return ref;
}

/** Resolve a CSS custom property from the plugin root for canvas drawing. */
export function cssVar(el: Element | null, name: string, fallback: string) {
  if (!el) return fallback;
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/** Generic labelled range for values that are not engine parameters. */
export function Range({label, value, min, max, step = 0.01, format, onChange, help}: {label: string; value: number; min: number; max: number; step?: number; format: (v: number) => string; onChange: (v: number) => void; help?: string}) {
  const pos = (value - min) / (max - min);
  const id = `hvl-r-${label.replace(/\W+/g, '-')}`;
  return (
    <div className="hvl-slider" title={help}>
      <div className="hvl-slider-head"><label htmlFor={id}>{label}</label><output htmlFor={id}>{format(value)}</output></div>
      <input id={id} className="hvl-range" type="range" min={min} max={max} step={step} value={value} style={{'--p': `${pos * 100}%`} as React.CSSProperties}
        onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

function parseRgb(css: string): [number, number, number, number] | null {
  const srgb = css.match(/color\(srgb\s+([^)]+)\)/);
  if (srgb) {
    const p = srgb[1].split(/[\s/]+/).filter(Boolean).map(Number);
    return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1];
  }
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

/**
 * Theme ink colours can be translucent. Overlapping translucent shapes show
 * seams in the portrait, so resolve opaque equivalents (composited over the
 * page background) and keep them current when the theme changes.
 */
export function useOpaqueInk(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    root.appendChild(probe);
    const resolve = (expr: string) => {
      probe.style.color = expr;
      return parseRgb(getComputedStyle(probe).color);
    };
    const update = () => {
      const bg = resolve('var(--ui-bg-elevated, #fff)') ?? [255, 255, 255, 1];
      const solid = (expr: string) => {
        const c = resolve(expr);
        if (!c) return null;
        const a = c[3];
        return `rgb(${[0, 1, 2].map(i => Math.round(c[i] * a + bg[i] * (1 - a))).join(' ')})`;
      };
      const ink = solid('var(--ui-text-primary, #16151a)');
      const skin = solid('var(--ui-bg-elevated, #fff)');
      if (ink) root.style.setProperty('--hvl-ink', ink);
      const lum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
      if (lum < 110) root.dataset.dark = '1';
      else delete root.dataset.dark;
      if (skin) root.style.setProperty('--hvl-skin', skin);
    };
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, {attributes: true, attributeFilter: ['class', 'style', 'data-theme']});
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', update);
      probe.remove();
    };
  }, [ref]);
}
