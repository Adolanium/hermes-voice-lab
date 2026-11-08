#!/usr/bin/env node
/**
 * Build assets/lexicon.txt.gz from a CMU Pronouncing Dictionary file.
 *   node scripts/build-lexicon.mjs /path/to/cmudict.dict
 * Source: https://github.com/cmusphinx/cmudict (BSD-style license, see
 * assets/CMUDICT-LICENSE). Keeps the first pronunciation of purely
 * alphabetic words (apostrophes allowed), front-codes sorted words and maps
 * each phone+stress to one character.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {PHONE_CODES} from '../src/core/lexicon-codes.mjs';

const source = process.argv[2];
if (!source) throw new Error('usage: build-lexicon.mjs <cmudict.dict>');
const code = new Map(PHONE_CODES.map((p, i) => [p, String.fromCharCode(0x21 + i)]));
const entries = new Map();
for (const raw of readFileSync(source, 'utf8').split('\n')) {
  const line = raw.split('#')[0].trim();
  if (!line) continue;
  const [head, ...phones] = line.split(/\s+/);
  if (/\(\d+\)$/.test(head) || !/^[a-z][a-z']*$/.test(head) || entries.has(head)) continue;
  const encoded = phones.map(p => code.get(p)).join('');
  if (encoded.length !== phones.length) throw new Error(`Unknown phone in ${line}`);
  entries.set(head, encoded);
}
const words = [...entries.keys()].sort();
let previous = '';
const lines = words.map(word => {
  let shared = 0;
  while (shared < Math.min(previous.length, word.length, 40) && previous[shared] === word[shared]) shared++;
  previous = word;
  return String.fromCharCode(0x30 + shared) + word.slice(shared) + '\t' + entries.get(word);
});
const out = fileURLToPath(new URL('../assets/lexicon.txt.gz', import.meta.url));
const gz = gzipSync(lines.join('\n'), {level: 9});
writeFileSync(out, gz);
console.log(`${words.length} words → ${gz.length} bytes`);
