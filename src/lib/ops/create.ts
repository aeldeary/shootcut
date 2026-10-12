import { PDFDocument } from 'pdf-lib';
import { embedFonts } from '../fonts';
import { drawLine, layoutLine, wrapText } from '../text';

export interface CreateImage {
  bytes: Uint8Array;
  mime: 'image/jpeg' | 'image/png';
}

export type CreatePageSize = 'a4' | 'letter' | 'fit';

export interface CreateOptions {
  images: CreateImage[];
  /** optional text; becomes one or more text pages after the images */
  text?: string;
  pageSize?: CreatePageSize;
  landscape?: boolean;
  /** points */
  margin?: number;
  fontSize?: number;
}

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;

/** Builds a PDF from images (one per page, fitted inside the margins) and text (wrapped, paginated). */
export async function createPdf(o: CreateOptions): Promise<Uint8Array> {
  const margin = o.margin ?? 36;
  const fontSize = o.fontSize ?? 14;
  const pageSize = o.pageSize ?? 'a4';
  const doc = await PDFDocument.create();
  doc.setCreator('Shootcut');
  doc.setProducer('Shootcut');

  const base = (): [number, number] => {
    const [w, h] = pageSize === 'letter' ? SIZES.letter : SIZES.a4;
    return o.landscape ? [h, w] : [w, h];
  };

  for (const img of o.images) {
    const embedded = img.mime === 'image/png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
    if (pageSize === 'fit') {
      doc.addPage([embedded.width, embedded.height]).drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
      continue;
    }
    const [pw, ph] = base();
    const page = doc.addPage([pw, ph]);
    const scale = Math.min((pw - 2 * margin) / embedded.width, (ph - 2 * margin) / embedded.height, 1);
    const w = embedded.width * scale;
    const h = embedded.height * scale;
    page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }

  const text = (o.text ?? '').trim();
  if (text) {
    const fonts = await embedFonts(doc);
    const [pw, ph] = pageSize === 'fit' ? SIZES.a4 : base();
    const width = pw - 2 * margin;
    const lh = fontSize * 1.5;
    const perPage = Math.max(1, Math.floor((ph - 2 * margin) / lh));
    const lines = wrapText(text, fonts, fontSize, width);
    for (let start = 0; start < lines.length; start += perPage) {
      const page = doc.addPage([pw, ph]);
      lines.slice(start, start + perPage).forEach((ln, i) => {
        if (!ln) return;
        const rtl = layoutLine(ln, fonts, fontSize).rtl;
        drawLine(page, ln, {
          x: rtl ? pw - margin : margin,
          y: ph - margin - fontSize - i * lh,
          size: fontSize,
          fonts,
          align: rtl ? 'right' : 'left',
        });
      });
    }
  }
  if (doc.getPageCount() === 0) throw new Error('Nothing to create');
  return doc.save();
}
