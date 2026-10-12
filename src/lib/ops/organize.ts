import { degrees, PDFDocument } from 'pdf-lib';

/** One page of the result: a page of the main file, a page of an added file, or a blank page. */
export interface OrganizeItem {
  /** index in `extras` when the page comes from an added file; undefined for the main file */
  from?: number;
  /** 0-based page in its file; ignored for blank pages */
  src: number;
  blank?: boolean;
  /** extra rotation in degrees */
  rotation: number;
}

const A4: [number, number] = [595.28, 841.89];

/**
 * Builds the new file from the chosen pages. A blank page takes the size of the page before it
 * (or the page after it, or A4 when it is the only one).
 */
export async function buildOrganized(main: Uint8Array, extras: Uint8Array[], items: OrganizeItem[]): Promise<Uint8Array> {
  const docs = [await PDFDocument.load(main), ...(await Promise.all(extras.map((e) => PDFDocument.load(e))))];
  const out = await PDFDocument.create();
  const sizes: ([number, number] | null)[] = [];
  for (const it of items) {
    if (it.blank) {
      sizes.push(null);
      continue;
    }
    const doc = docs[(it.from ?? -1) + 1];
    const [page] = await out.copyPages(doc, [it.src]);
    if (it.rotation) page.setRotation(degrees((((page.getRotation().angle + it.rotation) % 360) + 360) % 360));
    out.addPage(page);
    sizes.push([page.getWidth(), page.getHeight()]);
  }
  // blank pages are added last, then moved into place so that every real page is copied only once
  const real = sizes.filter((s) => s !== null).length;
  if (real === items.length) return out.save();
  const final = await PDFDocument.create();
  const realPages = await final.copyPages(out, Array.from({ length: out.getPageCount() }, (_, i) => i));
  let r = 0;
  items.forEach((it, i) => {
    if (it.blank) {
      const near = sizes.slice(0, i).reverse().find((s) => s) ?? sizes.slice(i + 1).find((s) => s) ?? A4;
      final.addPage(near);
    } else final.addPage(realPages[r++]);
  });
  return final.save();
}
