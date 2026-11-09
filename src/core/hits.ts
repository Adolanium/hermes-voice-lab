/**
 * Live hits: one beatbox sound played the moment a pad is pressed.
 * Shared contract between the UI and the planner: the UI calls `planHit` and
 * plays the returned score; how the hit is articulated lives here.
 */
import {compileScore, type Score, type ScoreEvent} from './engine';
import {PARAM_NAMES, type Patch} from './params';
import {BEAT_SOUNDS, beatSong} from './beat';
import {planSong} from './planner';
import type {Lexicon} from './text';

/** planSong's silent lead-in before the first note (seconds). */
const SONG_LEAD = 0.25;

/**
 * How each pad is played: `lead` is how much of the approach to the sound is
 * kept (seconds); short hits are articulated at a quick tempo so their closure
 * is brief. A click's pop comes from the vacuum built under the sealed tongue
 * (~0.19 s of suction), so it keeps its build-up.
 */
const HIT: Record<string, {lead: number; quick: boolean}> = {
  kick: {lead: 0.03, quick: true},
  snare: {lead: 0.03, quick: true},
  hat: {lead: 0.03, quick: true},
  open: {lead: 0.03, quick: false},
  click: {lead: 0.1, quick: false},
  bass: {lead: 0.03, quick: false},
  hum: {lead: 0.03, quick: false},
};
const QUICK_BPM = 140;

/**
 * The score for one pad press of beat sound `id` (see BEAT_SOUNDS), sounding as soon as it plays.
 * It is the beat's own articulation with the song lead-in cut away. A pad
 * starts from silence, so whatever was scheduled before the press (moving to the
 * closure, raising the larynx) is set at once and the hit starts from a formed
 * closure. `bpm` is the beat's tempo: it sets how long held sounds (open hat,
 * bass, hum) last.
 */
export function planHit(id: string, voice: Patch, lexicon: Lexicon, bpm = 92): Score {
  const how = HIT[id];
  if (!how || !BEAT_SOUNDS.some(s => s.id === id)) throw new RangeError(`unknown beat sound ${id}`);
  const tempo = how.quick ? Math.max(bpm, QUICK_BPM) : bpm;
  const {notes, lyrics} = beatSong({bpm: tempo, steps: [id], loop: false});
  const song = planSong(notes, lyrics, lexicon, {bpm: tempo, voice}).score;
  const shift = SONG_LEAD - how.lead;
  const events: ScoreEvent[] = [];
  for (let i = 0; i < song.events.length; i += 4) {
    const t = song.events[i] - shift;
    const name = PARAM_NAMES[song.events[i + 1]];
    const tau = song.events[i + 3];
    // Before the press: set it now (instantly while silent; the gate itself opens quickly).
    if (t <= 0) events.push([0, name, song.events[i + 2], name === 'gate' ? Math.min(tau, 4) : 0]);
    else events.push([t, name, song.events[i + 2], tau]);
  }
  return compileScore(events, Math.max(0.05, song.length - shift));
}
