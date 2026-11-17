import {PALATALIZABLE, type Phone} from './phonemes';

const vowels: Record<string, string> = {а: 'AA', я: 'AA', о: 'O', ё: 'O', у: 'U', ю: 'U', э: 'EH', е: 'EH', и: 'IY', ы: 'IH'};
const consonants: Record<string, string> = {
  б: 'B',
  в: 'V',
  г: 'G',
  д: 'D',
  ж: 'ZR',
  з: 'Z',
  й: 'Y',
  к: 'K',
  л: 'L',
  м: 'M',
  н: 'N',
  п: 'P',
  р: 'RR',
  с: 'S',
  т: 'T',
  ф: 'F',
  х: 'HH',
  ц: 'T S',
  ч: 'CC',
  ш: 'SR',
  щ: 'SC',
};
const final: Record<string, string> = {B: 'P', V: 'F', G: 'K', D: 'T', ZR: 'SR', Z: 'S'};
export const isRussian = (word: string) => /[а-яё]/i.test(word);

/** Letter-to-gesture approximation for singing. An acute accent or ё supplies lexical stress. */
export function russianPhones(word: string): Phone[] {
  const chars = [
    ...word
      .toLowerCase()
      .normalize('NFC')
      .replace(/[^а-яё\u0301]/g, ''),
  ];
  const phones: Phone[] = [];
  const stressed = chars.some((c) => c === 'ё' || c === '\u0301');
  const letters = chars.filter((c) => c !== '\u0301');
  let index = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '\u0301') continue;
    const prev = letters[index - 1],
      next = letters[++index];
    if (vowels[c]) {
      if ('еёюя'.includes(c) && (!prev || vowels[prev] || /[ъь]/.test(prev))) phones.push({symbol: 'Y', stress: 0});
      const strong = c === 'ё' || chars[i + 1] === '\u0301';
      const symbol = stressed && !strong && c === 'о' ? 'AH' : vowels[c];
      phones.push({symbol, stress: strong || !stressed ? 1 : 0});
    } else if (consonants[c]) {
      for (let symbol of consonants[c].split(' ')) {
        if (!next || (index + 1 === letters.length && next === 'ь')) symbol = final[symbol] ?? symbol;
        if (next && 'еёиюяь'.includes(next) && PALATALIZABLE.includes(symbol)) symbol += 'J';
        phones.push({symbol, stress: 0});
      }
    }
  }
  return phones;
}
