import { PDFDocument, PDFName } from 'pdf-lib';
import { canvasToBytes, createCanvas, openPreview } from '../pdf';
import { pruneUnreferenced } from './optimize';
import type { Rect } from './textselect';

export interface RedactBox extends Rect {
  /** 0-based page */
  page: number;
}

export interface RedactOptions {
  /** resolution of the replacement page images */
  dpi?: number;
  /** also remove title, author, keywords and XMP metadata */
  stripMetadata?: boolean;
}

/**
 * Permanently redacts. Every page that has a box is redrawn as a picture with the boxes burned in as solid
 * black, and the original page (its text, fonts, images and annotations) is deleted from the file, so
 * nothing under a box can be copied out or recovered. Pages without boxes are left exactly as they were.
 * Boxes are PDF user-space rectangles.
 */
export async function redactPdf(bytes: Uint8Array, boxes: RedactBox[], o: RedactOptions = {}): Promise<Uint8Array> {
  if (boxes.length === 0) throw new Error('Nothing to redact');
  const dpi = o.dpi ?? 200;
  const scale = dpi / 72;
  const byPage = new Map<number, RedactBox[]>();
  for (const b of boxes) byPage.set(b.page, [...(byPage.get(b.page) ?? []), b]);

  const preview = await openPreview(bytes);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  try {
    for (const [index, list] of byPage) {
      const vp = await preview.viewport(index, scale);
      const size = await preview.pageSize(index);
      const canvas = createCanvas(1, 1);
      await preview.renderToCanvas(index, canvas, scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000000';
      for (const b of list) {
        // two opposite corners in PDF space -> pixels (handles rotated pages)
        const [x1, y1] = vp.toView(b.x, b.y);
        const [x2, y2] = vp.toView(b.x + b.width, b.y + b.height);
        ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      }
      const image = await doc.embedJpg(await canvasToBytes(canvas, 'image/jpeg', 0.9));
      doc.removePage(index);
      const page = doc.insertPage(index, [size.width, size.height]);
      page.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
    }
  } finally {
    preview.destroy();
  }
  if (o.stripMetadata ?? true) {
    doc.catalog.delete(PDFName.of('Metadata'));
    delete doc.context.trailerInfo.Info;
  }
  // deleting a page only unlinks it; pruning removes its content from the file for good
  pruneUnreferenced(doc);
  return doc.save({ useObjectStreams: false });
}
