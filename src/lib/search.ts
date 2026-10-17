/**
 * Finding a tool by what the person wants to do. Pure text matching, no network: the words are compared after
 * Arabic spelling variants are folded together, so "ضغط", "الضغط" and "اضغط" style typing and "compress" all land.
 */

/** Lower case, Western digits, no diacritics or tatweel, alef/ya/ta-marbuta variants folded, punctuation as spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export interface SearchItem {
  id: string;
  /** the name the person sees: matches in it count more */
  name: string;
  /** everything else worth matching: the description, and the same texts in the other language */
  text: string;
}

/** A word matches when the text contains it; an Arabic "ال" in front is tried both ways ("الدمج" finds "دمج"). */
function hasWord(haystack: string, word: string): boolean {
  if (haystack.includes(word)) return true;
  return word.length > 3 && word.startsWith('ال') && haystack.includes(word.slice(2));
}

/** The ids of the items that match every word of the query, best first (ties keep the original order). */
export function rankItems(query: string, items: SearchItem[]): string[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const scored: { id: string; score: number; at: number }[] = [];
  items.forEach((item, at) => {
    const name = normalize(item.name);
    const rest = normalize(item.text);
    let score = 0;
    for (const w of words) {
      const inName = hasWord(name, w);
      if (!inName && !hasWord(rest, w)) return;
      score += inName ? (name.split(' ').some((n) => n.startsWith(w)) ? 5 : 3) : 1;
    }
    scored.push({ id: item.id, score, at });
  });
  return scored.sort((a, b) => b.score - a.score || a.at - b.at).map((x) => x.id);
}
