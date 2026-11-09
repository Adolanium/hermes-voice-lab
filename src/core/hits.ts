/**
 * Live hits: one beatbox sound played the moment a pad is pressed.
 * Shared contract between the UI and the planner: the UI calls `planHit` and
 * plays the returned score; how the hit is articulated lives here.
 */
import type {Score} from './engine';
import type {Patch} from './params';
import {BEAT_SOUNDS, beatSong} from './beat';
import {planSong} from './planner';
import type {Lexicon} from './text';

/** The score for one pad press of beat sound `id` (see BEAT_SOUNDS), sounding as soon as it plays. */
export function planHit(id: string, voice: Patch, lexicon: Lexicon, bpm = 92): Score {
  if (!BEAT_SOUNDS.some(s => s.id === id)) throw new RangeError(`unknown beat sound ${id}`);
  const {notes, lyrics} = beatSong({bpm, steps: [id], loop: false});
  return planSong(notes, lyrics, lexicon, {bpm, voice}).score;
}
