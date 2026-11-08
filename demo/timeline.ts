/**
 * Export the lounge set's timeline (sections, sung notes, word cues) as JSON,
 * for scoring the backing music: esbuild demo/timeline.ts → demo/out/timeline.mjs (run from there)
 */
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {LOUNGE_SET, planShow} from '../src/core/show';
import {decodeLexicon} from '../src/core/text';
import {SIGNATURE} from '../src/core/presets';

const lexicon = decodeLexicon(gunzipSync(readFileSync(new URL('../../assets/lexicon.txt.gz', import.meta.url))).toString('utf8'));
const voice = {...SIGNATURE, tenseness: 0.42, breath: 0.2, humanize: 0.4, space: 0.22, loudness: 0.78};
const plan = planShow(LOUNGE_SET, lexicon, voice);
// planSong puts beat 0 of each song 0.25 s into its section.
const LEAD = 0.25;
const sections = plan.sections.map((s, i) => {
  const item = LOUNGE_SET[i];
  return {
    kind: s.kind, start: s.start, end: s.end,
    ...(item.kind === 'sing'
      ? {bpm: item.bpm, downbeat: s.start + LEAD, lyrics: item.lyrics, notes: item.notes.map(n => ({t: s.start + LEAD + (n.start * 60) / item.bpm, beat: n.start, len: (n.length * 60) / item.bpm, midi: n.midi}))}
      : {text: item.text}),
  };
});
process.stdout.write(JSON.stringify({length: plan.length, sections, cues: plan.cues.map(c => ({text: c.text, t: c.vowel, end: c.end}))}, null, 1));
