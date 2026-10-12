import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { embedFonts, type FontSet } from '../fonts';
import { drawLine, measureLine } from '../text';
import { viewAngleToUser, viewSize, viewToUser } from './geometry';

export interface StampPreset {
  id: string;
  en: string;
  ar: string;
  color: string;
}

export const STAMP_PRESETS: StampPreset[] = [
  { id: 'approved', en: 'APPROVED', ar: 'معتمد', color: '#15803d' },
  { id: 'rejected', en: 'REJECTED', ar: 'مرفوض', color: '#b91c1c' },
  { id: 'draft', en: 'DRAFT', ar: 'مسودة', color: '#6b7280' },
  { id: 'confidential', en: 'CONFIDENTIAL', ar: 'سري', color: '#b91c1c' },
  { id: 'final', en: 'FINAL', ar: 'نهائي', color: '#1d4ed8' },
  { id: 'copy', en: 'COPY', ar: 'نسخة', color: '#6b7280' },
  { id: 'review', en: 'FOR REVIEW', ar: 'للمراجعة', color: '#b45309' },
];

export type StampPosition =
  | 'center'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'tile'
  /** anywhere the person chose: see StampOptions.at */
  | 'custom';

export interface StampOptions {
  kind: 'text' | 'image' | 'numbers';
  /** text stamp: the text. numbers: template with {n} and {total}. */
  text?: string;
  image?: { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' };
  /** hex colour like #b91c1c */
  color?: string;
  size?: number;
  opacity?: number;
  /** degrees counter-clockwise as the viewer shows it */
  rotation?: number;
  position?: StampPosition;
  /** where the stamp centre goes when position is "custom": 0-1 of the page as shown, from the top-left */
  at?: { x: number; y: number };
  /** rubber-stamp frame around text */
  border?: boolean;
  /** image width in points (kind "image") */
  imageWidth?: number;
  /** 0-based page indices; default all */
  pages?: number[];
  /** first number for kind "numbers" */
  startAt?: number;
  /** value of {total}; default: pages in the file */
  total?: number;
}

export function hexToRgb(hex: string): ReturnType<typeof rgb> {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0;
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

const rot = (x: number, y: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};

/**
 * Fills in a numbering template: {n} page number, {n:6} the same padded with zeros to 6 digits (Bates style:
 * "CASE-{n:6}"), {total} page count, {date} today as 2026-10-12.
 */
export function fillTemplate(template: string, n: number, total: number, today = new Date()): string {
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return template
    .replace(/\{n(?::(\d{1,2}))?\}/g, (_, w) => String(n).padStart(w ? Number(w) : 0, '0'))
    .replace(/\{total\}/g, String(total))
    .replace(/\{date\}/g, date);
}

export async function stampPdf(bytes: Uint8Array, o: StampOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const fonts = o.kind === 'image' ? null : await embedFonts(doc, 'bold');
  const image = o.kind === 'image' && o.image ? (o.image.mime === 'image/png' ? await doc.embedPng(o.image.bytes) : await doc.embedJpg(o.image.bytes)) : null;
  if (o.kind === 'image' && !image) throw new Error('Image stamp needs an image');
  if (o.kind !== 'image' && !(o.text ?? '').trim()) throw new Error('Stamp needs text');

  const total = doc.getPageCount();
  const targets = o.pages ?? Array.from({ length: total }, (_, i) => i);
  const position = o.position ?? (o.kind === 'numbers' ? 'bottom-center' : 'center');
  const color = hexToRgb(o.color ?? '#b91c1c');
  const opacity = o.opacity ?? (o.kind === 'numbers' ? 1 : 0.6);

  for (const index of targets) {
    const page = doc.getPage(index);
    const { width: vw, height: vh } = viewSize(page);
    if (o.kind === 'image' && image) {
      const w = o.imageWidth ?? Math.min(vw * 0.4, image.width);
      const h = (image.height / image.width) * w;
      placeAt(position, vw, vh, w, h, o.rotation ?? 0, o.at, (cx, cy, ang) => {
        const [ux, uy] = viewToUser(page, cx, cy);
        const a = viewAngleToUser(page, ang);
        const [ox, oy] = rot(-w / 2, -h / 2, a);
        page.drawImage(image, { x: ux + ox, y: uy + oy, width: w, height: h, rotate: degrees(a), opacity });
      });
      continue;
    }
    const text = o.kind === 'numbers' ? fillTemplate(o.text ?? '{n}', (o.startAt ?? 1) + index, o.total ?? total) : (o.text as string);
    const size = o.size ?? (o.kind === 'numbers' ? 11 : 64);
    const pad = o.border ? size * 0.3 : 0;
    const w = measureLine(text, fonts as FontSet, size) + pad * 2;
    const h = size * 1.2 + pad * 2;
    placeAt(position, vw, vh, w, h, o.rotation ?? (o.kind === 'text' && position === 'center' ? 30 : 0), o.at, (cx, cy, ang) => {
      const [ux, uy] = viewToUser(page, cx, cy);
      const a = viewAngleToUser(page, ang);
      // text is positioned by its baseline-left; the box centre is offset from there
      const [bx, by] = rot(-w / 2 + pad, -size * 0.3, a);
      drawLine(page, text, { x: ux + bx, y: uy + by, size, fonts: fonts as FontSet, color, opacity, rotate: a, align: 'left' });
      if (o.border) {
        const [cx0, cy0] = rot(-w / 2, -h / 2, a);
        page.drawRectangle({
          x: ux + cx0,
          y: uy + cy0,
          width: w,
          height: h,
          rotate: degrees(a),
          borderColor: color,
          borderWidth: Math.max(1, size / 14),
          borderOpacity: opacity,
        });
      }
    });
  }
  doc.setProducer('Shootcut');
  return doc.save();
}

function placeAt(
  position: StampPosition,
  vw: number,
  vh: number,
  w: number,
  h: number,
  angle: number,
  at: { x: number; y: number } | undefined,
  draw: (cx: number, cy: number, angle: number) => void,
): void {
  if (position === 'tile') {
    const gx = Math.max(w, 1) * 1.6;
    const gy = Math.max(h, 1) * 3;
    let row = 0;
    for (let y = gy / 2; y < vh + gy; y += gy, row++) {
      for (let x = gx / 2 + (row % 2 ? gx / 2 : 0); x < vw + gx; x += gx) draw(x, y, angle);
    }
    return;
  }
  if (position === 'custom') {
    const fx = Math.min(1, Math.max(0, at?.x ?? 0.5));
    const fy = Math.min(1, Math.max(0, at?.y ?? 0.5));
    draw(fx * vw, (1 - fy) * vh, angle);
    return;
  }
  const edge = 36;
  const cx = position.endsWith('left') ? edge + w / 2 : position.endsWith('right') ? vw - edge - w / 2 : vw / 2;
  const cy = position.startsWith('top') ? vh - edge - h / 2 : position.startsWith('bottom') ? edge + h / 2 : vh / 2;
  draw(cx, cy, angle);
}

/**
 * One-page copy of the first target page with the stamp applied, for a live preview that shows
 * exactly what the real output will contain.
 */
export async function stampPreviewPdf(bytes: Uint8Array, o: StampOptions): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { updateMetadata: false });
  const index = (o.pages ?? [0])[0] ?? 0;
  const one = await PDFDocument.create();
  const [page] = await one.copyPages(src, [index]);
  one.addPage(page);
  return stampPdf(await one.save(), { ...o, pages: [0], startAt: (o.startAt ?? 1) + index, total: o.total ?? src.getPageCount() });
}
