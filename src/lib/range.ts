/**
 * Parses a page range such as "1-3, 5, 8-" into sorted unique 0-based indices.
 * Empty input means "all pages". Returns null when the text is not a valid range
 * or points outside the document.
 */
export function parsePageRange(input: string, total: number): number[] | null {
  const text = input.trim();
  if (text === '') return Array.from({ length: total }, (_, i) => i);
  const set = new Set<number>();
  for (const raw of text.split(/[,،;\s]+/)) {
    if (!raw) continue;
    const m = /^(\d*)-(\d*)$/.exec(raw) ?? /^(\d+)$/.exec(raw);
    if (!m) return null;
    let from: number;
    let to: number;
    if (m.length === 2) {
      from = to = Number(m[1]);
    } else {
      if (m[1] === '' && m[2] === '') return null;
      from = m[1] === '' ? 1 : Number(m[1]);
      to = m[2] === '' ? total : Number(m[2]);
    }
    if (from < 1 || to < 1 || from > total || to > total || from > to) return null;
    for (let p = from; p <= to; p++) set.add(p - 1);
  }
  return set.size ? [...set].sort((a, b) => a - b) : null;
}
