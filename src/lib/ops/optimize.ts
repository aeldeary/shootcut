import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFStream, type PDFObject } from 'pdf-lib';
import { canvasToBytes, createCanvas, decodeImage, openPreview } from '../pdf';

export type OptimizeLevel = 'light' | 'balanced' | 'strong' | 'flatten';

export interface OptimizeOptions {
  level: OptimizeLevel;
  stripMetadata?: boolean;
}

export interface OptimizeResult {
  bytes: Uint8Array;
  before: number;
  after: number;
  imagesRecompressed: number;
  /** true when the result is the original file because optimizing did not make it smaller */
  keptOriginal: boolean;
}

const PRESETS = {
  balanced: { maxSide: 1800, quality: 0.72 },
  strong: { maxSide: 1100, quality: 0.5 },
} as const;

/** Reads width, height and component count from a JPEG's start-of-frame marker. */
export function jpegInfo(b: Uint8Array): { width: number; height: number; components: number } | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], components: b[i + 9] };
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

/** Deletes objects nothing points to any more (left over from edits, earlier saves or removed pages). */
export function pruneUnreferenced(doc: PDFDocument): number {
  const ctx = doc.context;
  const seen = new Set<string>();
  const stack: PDFObject[] = [];
  for (const root of [ctx.trailerInfo.Root, ctx.trailerInfo.Info, ctx.trailerInfo.Encrypt]) if (root) stack.push(root);
  while (stack.length) {
    const obj = stack.pop() as PDFObject;
    if (obj instanceof PDFRef) {
      if (seen.has(obj.tag)) continue;
      seen.add(obj.tag);
      const target = ctx.lookup(obj);
      if (target) stack.push(target);
    } else if (obj instanceof PDFStream) {
      stack.push(obj.dict);
    } else if (obj instanceof PDFDict) {
      for (const [, v] of obj.entries()) stack.push(v);
    } else if (obj instanceof PDFArray) {
      for (const v of obj.asArray()) stack.push(v);
    }
  }
  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!seen.has(ref.tag)) {
      ctx.delete(ref);
      removed += 1;
    }
  }
  return removed;
}

function stripMetadata(doc: PDFDocument): void {
  doc.catalog.delete(PDFName.of('Metadata'));
  delete doc.context.trailerInfo.Info;
}

async function recompressImages(doc: PDFDocument, maxSide: number, quality: number): Promise<number> {
  let changed = 0;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    // only plain single-filter JPEGs without masks or colour tricks
    if (d.get(PDFName.of('Filter')) !== PDFName.of('DCTDecode')) continue;
    if (d.has(PDFName.of('Mask')) || d.has(PDFName.of('Decode')) || d.has(PDFName.of('ImageMask'))) continue;
    const original = obj.contents;
    const info = jpegInfo(original);
    if (!info || info.components !== 3) continue;
    const scale = Math.min(1, maxSide / Math.max(info.width, info.height));
    const source = await decodeImage(original);
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const target = createCanvas(w, h);
    const ctx = target.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    const out = await canvasToBytes(target, 'image/jpeg', quality);
    if (out.length >= original.length * 0.95) continue;
    const dict = d.clone();
    dict.set(PDFName.of('Width'), PDFNumber.of(w));
    dict.set(PDFName.of('Height'), PDFNumber.of(h));
    dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    dict.set(PDFName.of('Length'), PDFNumber.of(out.length));
    doc.context.assign(ref, PDFRawStream.of(dict, out));
    changed += 1;
  }
  return changed;
}

async function flatten(bytes: Uint8Array): Promise<Uint8Array> {
  const preview = await openPreview(bytes);
  try {
    const out = await PDFDocument.create();
    const dpi = 110;
    for (let i = 0; i < preview.numPages; i++) {
      const canvas = createCanvas(1, 1);
      await preview.renderToCanvas(i, canvas, dpi / 72);
      const jpg = await out.embedJpg(await canvasToBytes(canvas, 'image/jpeg', 0.6));
      const { width, height } = await preview.pageSize(i);
      out.addPage([width, height]).drawImage(jpg, { x: 0, y: 0, width, height });
    }
    out.setProducer('Shootcut');
    return out.save();
  } finally {
    preview.destroy();
  }
}

export async function optimizePdf(bytes: Uint8Array, o: OptimizeOptions): Promise<OptimizeResult> {
  const before = bytes.length;
  let imagesRecompressed = 0;
  let result: Uint8Array;
  if (o.level === 'flatten') {
    result = await flatten(bytes);
  } else {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    if (o.level !== 'light') imagesRecompressed = await recompressImages(doc, PRESETS[o.level].maxSide, PRESETS[o.level].quality);
    if (o.stripMetadata) stripMetadata(doc);
    pruneUnreferenced(doc);
    result = await doc.save({ useObjectStreams: true });
  }
  if (result.length >= before) return { bytes, before, after: before, imagesRecompressed: 0, keptOriginal: true };
  return { bytes: result, before, after: result.length, imagesRecompressed, keptOriginal: false };
}
