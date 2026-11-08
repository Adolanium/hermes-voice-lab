/**
 * Stage mode: performance dressing for the portrait while she sings.
 * Everything is a pure function of the song clock, so live playback and the
 * frame-by-frame video renderer draw exactly the same picture.
 *  - sung syllables pop out of her mouth and float away;
 *  - her head bobs on the beat and lifts on high notes.
 */
import React from 'react';
import type {LyricCue} from '../core/planner';

type Pt = [number, number];

export interface StageState {
  /** Song clock in seconds (score position). */
  time: number;
  cues: LyricCue[];
  /** Seconds per beat. */
  beat: number;
  /** 0..1 loudness envelope. */
  level: number;
  /** Current pitch in Hz (0 when silent). */
  f0: number;
  /** True while the song is playing. */
  singing: boolean;
}

const LIFE = 1.5;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const COLORS = ['var(--hvl-accent)', 'var(--hvl-warm)', 'var(--hvl-ink)', 'var(--ui-pink, #d6457f)'];

/** Head motion: rotation (degrees) about the neck and a vertical bounce, in art units. */
export function headMotion(s: StageState | undefined): {deg: number; dy: number} {
  if (!s) return {deg: 0, dy: 0};
  const t = s.time;
  // Talking: small nods that follow the voice. Idle: a slow sway.
  if (!s.singing) return {deg: 0.5 * Math.sin(t * 1.3) + 2.2 * s.level * Math.sin(t * 6.5), dy: -8 * s.level * Math.abs(Math.sin(t * 6.5))};
  const phase = (t / s.beat) * Math.PI;
  const lift = s.f0 > 0 ? clamp01((Math.log2(s.f0 / 260) + 0.4) / 1.3) : 0.3;
  const groove = 3.4 * Math.sin(phase); // sway one way per beat, back on the next
  return {deg: groove * (0.45 + s.level) - 6 * lift, dy: -30 * Math.abs(Math.sin(phase)) * (0.35 + s.level)};
}

/** Syllables currently in flight, with position, scale, angle and opacity. */
export function flyingWords(s: StageState, mouth: Pt, right = Infinity) {
  const out: Array<{key: number; text: string; x: number; y: number; scale: number; deg: number; opacity: number; color: string; size: number}> = [];
  s.cues.forEach((c, i) => {
    const age = s.time - c.vowel;
    const held = Math.max(0.12, c.end - c.vowel);
    const life = Math.max(LIFE, held + 0.7);
    if (age < -0.02 || age > life + 1.2) return;
    const a = Math.max(0, age);
    // Pop: overshoot then settle; swell slightly while the syllable is held.
    const pop = a < 0.1 ? 0.35 + 9.5 * a : a < 0.24 ? 1.3 - 2.1 * (a - 0.1) : 1;
    const swell = a < held ? 1 + 0.08 * Math.sin(a * 18) : 1;
    // Fan out of the mouth, each word on its own heading, easing out and floating up.
    const lane = ((i * 3) % 5) - 2;
    const heading = ((-14 + lane * 15) * Math.PI) / 180;
    // Long words are drawn smaller and travel less, so they stay in frame.
    const fit = Math.min(1, 6 / Math.max(1, c.text.length));
    const dist = (380 * (1 - Math.exp(-a * 2.8)) + 110 * Math.max(0, a - held)) * (0.55 + 0.45 * fit);
    const wobble = 12 * Math.sin(a * 7 + i);
    const fwd = dist * Math.cos(heading);
    const rise = -dist * Math.sin(heading) + 70 * a * a;
    const loud = /!$/.test(c.text) || held > 0.5;
    const size = (loud ? 92 : 62) * (0.65 + 0.35 * fit);
    // Heavy capitals run about 0.8 em wide: keep the whole word in frame.
    const width = 0.8 * size * pop * swell * c.text.length;
    if (a <= life) out.push({
      key: i,
      text: c.text.toUpperCase(),
      x: Math.min(mouth[0] + 30 + fwd + wobble, right - width),
      y: mouth[1] - 10 - rise,
      scale: pop * swell,
      deg: lane * 5 + 6 * Math.sin(a * 5 + i * 1.7),
      opacity: a < life - 0.25 ? 1 : clamp01((life - a) / 0.25),
      color: COLORS[i % COLORS.length],
      size,
    });
    // Held syllables puff out little music notes.
    if (held > 0.55) {
      for (let k = 0; k * 0.22 < Math.min(held, a); k++) {
        const b = a - k * 0.22 - 0.1;
        if (b < 0 || b > 1.1) continue;
        const side = k % 2 ? 1 : -1;
        out.push({
          key: 10000 + i * 100 + k,
          text: k % 3 === 1 ? '♫' : '♪',
          x: mouth[0] + 60 + 120 * b + side * 18 * Math.sin(b * 6),
          y: mouth[1] - 40 - 260 * b + side * 30,
          scale: Math.min(1, b * 8),
          deg: side * 12,
          opacity: clamp01(1.2 - b),
          color: COLORS[(i + k + 1) % COLORS.length],
          size: 54,
        });
      }
    }
  });
  return out;
}

/** Floating sung syllables, drawn in art coordinates. */
export function FloatingWords({stage, mouth, right}: {stage: StageState; mouth: Pt; right?: number}) {
  const words = flyingWords(stage, mouth, right);
  return (
    <g className="hvl-words" aria-hidden>
      {words.map(w => (
        <g key={w.key} transform={`translate(${w.x.toFixed(1)} ${w.y.toFixed(1)}) rotate(${w.deg.toFixed(1)}) scale(${w.scale.toFixed(3)})`} opacity={w.opacity.toFixed(2)}>
          <text className="hvl-word" style={{fontSize: w.size}} fill={w.color}>{w.text}</text>
        </g>
      ))}
    </g>
  );
}

/** The current line of lyrics with the sung syllable highlighted (karaoke strip). */
export function lyricLine(s: StageState): {words: Array<{text: string; state: 'past' | 'now' | 'next'}>} {
  const {cues, time} = s;
  if (!cues.length) return {words: []};
  // Lines break at rests longer than half a beat and at every second bar.
  const lines: LyricCue[][] = [[]];
  const bar = (c: LyricCue) => Math.floor((c.vowel - cues[0].vowel) / (s.beat * 8) + 0.01);
  cues.forEach((c, i) => {
    if (i > 0 && (c.start - cues[i - 1].end > s.beat * 0.45 || bar(c) !== bar(cues[i - 1]))) lines.push([]);
    lines[lines.length - 1].push(c);
  });
  let line = lines.findIndex(l => time < l[l.length - 1].end + s.beat * 0.4);
  if (line < 0) line = lines.length - 1;
  return {
    words: lines[line].map(c => ({text: c.text, state: time >= c.end ? 'past' : time >= c.start ? 'now' : 'next'})),
  };
}
