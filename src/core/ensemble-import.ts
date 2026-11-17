import {importScoreFile} from './score-import';
import {songFromScore} from './project';
import {defaultExpression} from './face-expression';
import {defaultAvatarColor, defaultMovement, type Ensemble} from './ensemble';

/** Import up to three pitched tracks on the same downbeat, with the lyric track first. */
export async function importArrangement(filename: string, bytes: Uint8Array) {
  const first = await importScoreFile(filename, bytes, {preserveStart: true});
  const tracks = first.parts.filter((p) => p.notes > 0);
  if (!tracks.length) throw new Error('This score contains no pitched parts.');
  const lead = tracks.find((p) => p.id === first.part) ?? tracks[0];
  const chosen = [lead, ...tracks.filter((p) => p.id !== lead.id)].slice(0, 3);
  const messages = new Set<string>();
  if (tracks.length > chosen.length) messages.add('Loaded three parts. Use Import score on a singer to choose another track.');
  const singers: Ensemble['singers'] = [];
  let bpm = first.bpm;
  for (const [i, part] of chosen.entries()) {
    const line = part.id === first.part ? first : await importScoreFile(filename, bytes, {part: part.id, preserveStart: true});
    const {song, messages: warnings} = songFromScore(line, 1440);
    bpm = song.bpm;
    warnings.forEach((w) => messages.add(w));
    singers.push({
      avatarColor: defaultAvatarColor(i), movement: defaultMovement(i), expression: defaultExpression(i),
      name: (part.name || 'Singer ' + (i + 1)).slice(0, 40),
      voice: ['tenor', 'bright', 'baritone'][i],
      lyrics: song.lyrics,
      notes: song.notes,
      level: [0.96, 0.55, 0.7][i],
      pan: [0, 0.58, -0.35][i],
      muted: false,
    });
  }
  const arrangement: Ensemble = {
    title:
      filename
        .replace(/\.[^.]+$/, '')
        .trim()
        .slice(0, 120) || 'Arrangement',
    bpm,
    singers,
  };
  return {arrangement, messages: [...messages]};
}
