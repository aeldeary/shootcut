import type { CSSProperties } from 'react';
import type { PageViewportInfo } from '../lib/pdf';
import type { Rect } from '../lib/ops/textselect';

/** A PDF-space rectangle as CSS pixels on the page (works for rotated pages too). */
export function viewRect(vp: PageViewportInfo, r: Rect): CSSProperties {
  const [x1, y1] = vp.toView(r.x, r.y);
  const [x2, y2] = vp.toView(r.x + r.width, r.y + r.height);
  return { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/** Rectangle from two page-pixel corners to a PDF-space rectangle. */
export function pdfRectFromView(vp: PageViewportInfo, a: [number, number], b: [number, number]): Rect {
  const [x1, y1] = vp.toPdf(a[0], a[1]);
  const [x2, y2] = vp.toPdf(b[0], b[1]);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

export function viewBox(a: [number, number], b: [number, number]): CSSProperties {
  return { left: Math.min(a[0], b[0]), top: Math.min(a[1], b[1]), width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) };
}
