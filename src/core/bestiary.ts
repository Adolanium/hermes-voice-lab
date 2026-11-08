/**
 * The bestiary: animal calls. A songbird and an elephant have their own sources in
 * the engine (a two-sided syrinx; lips buzzing into a trunk); a seal and an
 * alligator use the same airway as the human voice with their own proportions.
 */
import {compileScore, type Score, type ScoreEvent} from './engine';
import type {ParamName} from './params';

export interface Creature {
  id: string;
  name: string;
  description: string;
  calls: Array<{id: string; label: string; score: () => Score}>;
}

type Ev = [number, ParamName, number, number];
const score = (events: Ev[], length: number) => compileScore(events.sort((a, b) => a[0] - b[0]) as ScoreEvent[], length);

/** Common start: a clean patch for the creature (no voice-quality or chain leftovers). */
const start = (creature: number, extra: Partial<Record<ParamName, number>>): Ev[] => {
  const base: Partial<Record<ParamName, number>> = {
    creature, harmony: 0, gate: 0, vibratoDepth: 0, humanize: 0.3, register: 0, fry: 0, growl: 0, twang: 0, trill: 0,
    glottal: 0, larynx: 0, suction: 0, tipClose: 0, dorsumClose: 0, lateral: 0, rhotic: 0, voicing: 1, velum: 0, ...extra,
  };
  return Object.entries(base).map(([k, v]) => [0, k as ParamName, v!, 0]);
};
const end = (t: number, creature: number): Ev[] => [[t, 'gate', 0, 40], ...(creature ? ([[t + 0.25, 'creature', 0, 0]] as Ev[]) : [])];

/** A songbird note: a whistle gliding from `a` to `b` (Hz on the 250–1100 scale, ×8 in the syrinx). */
function birdNote(t: number, dur: number, a: number, b: number, loud = 0.6): Ev[] {
  return [
    [t, 'pitch', a, 0], [t, 'lipOpen', Math.min(1, a / 900), 0], [t, 'gate', 1, 4], [t, 'loudness', loud, 6],
    [t + 0.05 * dur, 'pitch', b, dur * 300], [t + 0.05 * dur, 'lipOpen', Math.min(1, b / 900), dur * 300],
    [t + dur, 'gate', 0, 6],
  ];
}

export const CREATURES: Creature[] = [
  {
    id: 'songbird', name: 'Songbird',
    description: 'A syrinx with two sides that can sing different notes at once, a short trachea and a beak that opens wider for higher notes.',
    calls: [
      {id: 'song', label: 'Song', score: () => {
        const ev = start(1, {lipOpen: 0.5, loudness: 0.6});
        let t = 0.1;
        for (const [a, b, d] of [[420, 700, 0.12], [700, 380, 0.1], [420, 700, 0.12], [700, 380, 0.1]] as const) { ev.push(...birdNote(t, d, a, b)); t += d + 0.06; }
        t += 0.1;
        for (let k = 0; k < 8; k++) { ev.push(...birdNote(t, 0.035, 560, 640, 0.55)); t += 0.06; }
        t += 0.08;
        ev.push(...birdNote(t, 0.4, 820, 360, 0.7));
        t += 0.45;
        return score([...ev, ...end(t, 1)], t + 0.5);
      }},
      {id: 'duet', label: 'Two voices', score: () => {
        // Both sides of the syrinx at once: the second sings (1 + harmony) × the first.
        const ev = start(1, {lipOpen: 0.6, loudness: 0.6});
        let t = 0.1;
        for (const [a, h] of [[400, 0.25], [450, 0.33], [380, 0.5], [500, 0.2]] as const) {
          ev.push([t, 'harmony', h, 0], ...birdNote(t, 0.28, a, a * 1.08));
          t += 0.36;
        }
        ev.push([t, 'harmony', 0, 0]);
        return score([...ev, ...end(t, 1)], t + 0.5);
      }},
    ],
  },
  {
    id: 'elephant', name: 'Elephant',
    description: 'A trumpet call: the lips buzz at the base of the trunk, a two-metre tube that loads and shapes the buzz like a brass instrument.',
    calls: [
      {id: 'trumpet', label: 'Trumpet', score: () => {
        const ev = start(2, {pitch: 240, loudness: 0.3, tractLength: 24});
        ev.push([0.05, 'gate', 1, 20], [0.05, 'loudness', 0.95, 160], [0.05, 'pitch', 430, 260], [0.9, 'pitch', 400, 200], [1.3, 'loudness', 0.5, 120], [1.3, 'pitch', 320, 150]);
        return score([...ev, ...end(1.6, 2)], 2.1);
      }},
      {id: 'rumble', label: 'Rumble', score: () => {
        const ev = start(2, {pitch: 130, loudness: 0.4, tractLength: 32});
        ev.push([0.05, 'gate', 1, 60], [0.05, 'loudness', 0.75, 300], [0.6, 'pitch', 115, 400]);
        return score([...ev, ...end(1.8, 2)], 2.3);
      }},
    ],
  },
  {
    id: 'seal', name: 'Seal',
    description: 'Barks from the same kind of airway as ours: a longer tract, a pressed and growling larynx, and a little of the nose.',
    calls: [
      {id: 'bark', label: 'Bark', score: () => {
        const ev = start(0, {pitch: 300, loudness: 0.9, tenseness: 0.75, breath: 0.1, tractLength: 22, growl: 0.55, fry: 0.15, velum: 0.3,
          tongueX: 0.25, tongueY: 0.25, jaw: 0.2, lipOpen: 0.35, lipRound: 0.4, throat: 0.6});
        let t = 0.1;
        for (let k = 0; k < 3; k++) {
          ev.push([t, 'gate', 1, 6], [t, 'jaw', 0.75, 30], [t, 'pitch', 300, 0], [t + 0.02, 'pitch', 210, 90], [t + 0.16, 'jaw', 0.2, 30], [t + 0.18, 'gate', 0, 15]);
          t += 0.32;
        }
        return score([...ev, ...end(t, 0)], t + 0.4);
      }},
    ],
  },
  {
    id: 'alligator', name: 'Alligator',
    description: 'A bellow with the mouth nearly shut: a long tract, a very low, growling, creaky voice and the nose open. (A real bellow goes lower than this voice can.)',
    calls: [
      {id: 'bellow', label: 'Bellow', score: () => {
        const ev = start(0, {pitch: 56, loudness: 1, tenseness: 0.6, breath: 0.15, tractLength: 32, growl: 1, fry: 0.6, velum: 0.6,
          tongueX: 0.1, tongueY: 0.3, jaw: 0.22, lipOpen: 0.2, lipRound: 0.2, throat: 0.9, vibratoRate: 4, vibratoDepth: 0.25, gain: 1});
        ev.push([0.05, 'gate', 1, 60], [1.2, 'pitch', 52, 300]);
        return score([...ev, ...end(2.2, 0)], 2.8);
      }},
    ],
  },
];
