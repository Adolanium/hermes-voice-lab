/** A word occurrence in the written lyric. The same address is used by the editor and Hermes. */
export interface WordAddress {word: string; occurrence: number}
export interface WordDirection extends WordAddress {
  swell?: boolean;
  slide?: boolean;
  /** Fraction of the held vowel before vibrato enters. One keeps the vowel straight. */
  vibratoAt?: number;
}

export function wordKey(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/^\[|\]$/g, '').replace(/[-.,!?:;“”"]/g, '');
}

export function lyricWords(lyrics: string) {
  const counts = new Map<string, number>();
  return lyrics.trim().split(/\s+/).flatMap((label, index) => {
    const word = wordKey(label);
    if (!word || word === '_') return [];
    const occurrence = (counts.get(word) ?? 0) + 1;
    counts.set(word, occurrence);
    return [{word, occurrence, label, index}];
  });
}

export function sameWord(a: WordAddress, b: WordAddress) {
  return a.word === b.word && a.occurrence === b.occurrence;
}

export function validateDirections(raw: unknown): WordDirection[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 256) throw new TypeError('Expected up to 256 word directions');
  const out: WordDirection[] = [];
  for (const d of raw) {
    const occurrence = d?.occurrence === undefined ? 1 : d.occurrence;
    if (!d || typeof d.word !== 'string' || !wordKey(d.word) || d.word.length > 120 || /\s/.test(d.word) ||
        !Number.isInteger(occurrence) || occurrence < 1 || occurrence > 2048 ||
        Object.keys(d).some(k => !['word', 'occurrence', 'slide', 'swell', 'vibratoAt'].includes(k))) throw new TypeError('Invalid word direction');
    const dir: WordDirection = {word: wordKey(d.word), occurrence};
    for (const k of ['slide', 'swell'] as const) {
      if (d[k] !== undefined && typeof d[k] !== 'boolean') throw new TypeError(k + ' must be boolean');
      if (d[k]) dir[k] = true;
    }
    if (d.vibratoAt !== undefined) {
      if (!Number.isFinite(d.vibratoAt) || d.vibratoAt < 0 || d.vibratoAt > 1) throw new RangeError('vibratoAt must be 0–1');
      dir.vibratoAt = d.vibratoAt;
    }
    if (out.some(x => sameWord(x, dir))) throw new TypeError('Duplicate word direction');
    out.push(dir);
  }
  return out;
}
