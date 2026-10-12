import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib';

/**
 * Arabic fonts draw some letter pairs as one glyph (lam+meem, tah+meem, ...). The font's text map says what
 * letters that glyph stands for, in the right order. PDF readers that rebuild right-to-left text reverse every
 * character of a run, including the two inside such a glyph, so "المصاحف" is read back as "املصاحف".
 * Storing those pairs reversed in the map makes the final result come out right.
 */
const ARABIC_UNIT = /^(06[0-9A-F]{2}|07[5-7][0-9A-F]|FB[5-9A-F][0-9A-F]|FC[0-9A-F]{2}|FD[0-3][0-9A-F]|FE[7-9A-F][0-9A-F])$/i;

/** Reverses the multi-letter Arabic entries of a ToUnicode CMap. Returns null when there is nothing to change. */
export function reverseLigatureEntries(cmap: string): string | null {
  let changed = false;
  const out = cmap.replace(/<([0-9A-Fa-f]{2,4})>(\s*)<([0-9A-Fa-f]{8,32})>/g, (whole, code: string, gap: string, dest: string) => {
    if (dest.length % 4 !== 0) return whole;
    const units = dest.match(/.{4}/g)!;
    if (!units.every((u) => ARABIC_UNIT.test(u))) return whole;
    changed = true;
    return `<${code}>${gap}<${[...units].reverse().join('')}>`;
  });
  return changed ? out : null;
}

/** The Arabic font this app embeds; its text maps must not be reversed a second time. */
const OWN_ARABIC_FONT = 'IBMPlexSansArabic';

/**
 * A copy of the PDF whose fonts carry the reversed ligature maps, for reading text only (never for drawing).
 * Returns null when the PDF has no such fonts or cannot be processed, so callers keep the original.
 */
export async function withFixedLigatureMaps(bytes: Uint8Array): Promise<Uint8Array | null> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  } catch {
    return null;
  }
  const ctx = doc.context;
  const done = new Set<PDFRef>();
  let changed = false;
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const ref = obj.get(PDFName.of('ToUnicode'));
    if (!(ref instanceof PDFRef) || done.has(ref)) continue;
    // fonts embedded by this app already store their ligatures the way readers expect (see fonts.ts)
    const base = obj.get(PDFName.of('BaseFont'));
    if (base instanceof PDFName && base.decodeText().includes(OWN_ARABIC_FONT)) continue;
    done.add(ref);
    const stream = ctx.lookup(ref);
    if (!(stream instanceof PDFRawStream)) continue;
    let text: string;
    try {
      text = new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
    } catch {
      continue;
    }
    const fixed = reverseLigatureEntries(text);
    if (fixed === null) continue;
    const bytesOut = Uint8Array.from(fixed, (c) => c.charCodeAt(0));
    ctx.assign(ref, ctx.flateStream(bytesOut));
    changed = true;
  }
  if (!changed) return null;
  try {
    return await doc.save({ useObjectStreams: false });
  } catch {
    return null;
  }
}
