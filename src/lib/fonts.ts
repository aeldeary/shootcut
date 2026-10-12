import fontkit from '@cantoo/fontkit';
import type { PDFDocument, PDFFont } from 'pdf-lib';
import latinRegular from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import latinBold from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import arabicRegular from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff?url';
import arabicBold from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff?url';

/** Two fonts that together cover Latin text and Arabic-script text. */
export interface FontSet {
  latin: PDFFont;
  arabic: PDFFont;
}

export type FontLoader = (url: string) => Promise<Uint8Array>;

const browserLoader: FontLoader = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font request failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

let loader: FontLoader = browserLoader;

/** Tests (running outside a browser) replace how font files are read. */
export function setFontLoader(fn: FontLoader): void {
  loader = fn;
}

export const FONT_URLS = { latinRegular, latinBold, arabicRegular, arabicBold };

const bytesCache = new Map<string, Promise<Uint8Array>>();
function fontBytes(url: string): Promise<Uint8Array> {
  let p = bytesCache.get(url);
  if (!p) {
    p = loader(url);
    p.catch(() => bytesCache.delete(url));
    bytesCache.set(url, p);
  }
  return p;
}

const docCache = new WeakMap<PDFDocument, Map<'regular' | 'bold', Promise<FontSet>>>();

/** Embeds (once per document) the regular or bold font pair. Fonts are subset automatically. */
export function embedFonts(doc: PDFDocument, weight: 'regular' | 'bold' = 'regular'): Promise<FontSet> {
  let perDoc = docCache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    docCache.set(doc, perDoc);
  }
  let p = perDoc.get(weight);
  if (!p) {
    p = (async () => {
      doc.registerFontkit(fontkit);
      const [latinBytes, arabicBytes] = await Promise.all([
        fontBytes(weight === 'bold' ? latinBold : latinRegular),
        fontBytes(weight === 'bold' ? arabicBold : arabicRegular),
      ]);
      const [latin, arabic] = await Promise.all([
        doc.embedFont(latinBytes, { subset: true }),
        doc.embedFont(arabicBytes, { subset: true }),
      ]);
      keepLigatureTextOrder(arabic);
      return { latin, arabic };
    })();
    perDoc.set(weight, p);
  }
  return p;
}

interface FontkitGlyph {
  codePoints: number[];
  __scReversed?: boolean;
}
interface FontkitFont {
  layout: (text: string, features?: unknown) => { glyphs: FontkitGlyph[] };
}

/**
 * Arabic fonts replace letter pairs with one ligature glyph (lam-alef, and in IBM Plex also pairs such
 * as seen+reh). The glyph's text mapping lists the letters in reading order, but text extractors (pdf.js,
 * poppler) reverse right-to-left runs character by character, including inside that mapping, and so
 * return the pair swapped ("سري" came out as "رسي"). Storing the pair reversed makes copy/search return
 * the right letters. Only used for the Arabic font: Latin ligatures such as "fi" must keep their order.
 */
function keepLigatureTextOrder(font: PDFFont): void {
  const inner = (font as unknown as { embedder?: { font?: FontkitFont } }).embedder?.font;
  if (!inner || typeof inner.layout !== 'function') return;
  const layout = inner.layout.bind(inner);
  inner.layout = (text, features) => {
    const run = layout(text, features);
    for (const g of run.glyphs) {
      if (g.codePoints.length > 1 && !g.__scReversed) {
        g.codePoints = [...g.codePoints].reverse();
        g.__scReversed = true;
      }
    }
    return run;
  };
}
