import { PDFDocument, rgb } from 'pdf-lib';
import { embedFonts } from '../fonts';
import { drawLine, measureLine } from '../text';
import { hexToRgb } from './stamp';

export type Unit = 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'pt';

/** How many of each unit one PDF point is, when nothing has been calibrated (1 pt = 1/72 inch). */
const POINT_IN: Record<Unit, number> = {
  mm: 25.4 / 72,
  cm: 2.54 / 72,
  m: 0.0254 / 72,
  in: 1 / 72,
  ft: 1 / 864,
  pt: 1,
};

export interface Scale {
  /** real-world units per PDF point */
  perPoint: number;
  unit: Unit;
}

export const defaultScale = (unit: Unit = 'cm'): Scale => ({ perPoint: POINT_IN[unit], unit });

/** Scale from a known length: the person says "these two points are N units apart". */
export function calibrate(pointDistance: number, realLength: number, unit: Unit): Scale {
  if (!(pointDistance > 0) || !(realLength > 0)) throw new Error('Calibration needs two different points and a positive length');
  return { perPoint: realLength / pointDistance, unit };
}

export type Pt = [number, number];

export const distance = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function perimeter(points: Pt[], closed = false): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += distance(points[i - 1], points[i]);
  if (closed && points.length > 2) d += distance(points[points.length - 1], points[0]);
  return d;
}

/** Shoelace formula. */
export function polygonArea(points: Pt[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Western digits, trailing zeros trimmed. */
export function formatNumber(n: number): string {
  const digits = n >= 100 ? 1 : n >= 10 ? 2 : 3;
  return String(Number(n.toFixed(digits)));
}

export const formatLength = (points: number, s: Scale): string => `${formatNumber(points * s.perPoint)} ${s.unit}`;
export const formatArea = (pointsSquared: number, s: Scale): string => `${formatNumber(pointsSquared * s.perPoint * s.perPoint)} ${s.unit}²`;

export type Measurement =
  | { kind: 'distance'; page: number; a: Pt; b: Pt }
  | { kind: 'polyline'; page: number; points: Pt[] }
  | { kind: 'area'; page: number; points: Pt[] };

export function measurementLabel(m: Measurement, s: Scale): string {
  if (m.kind === 'distance') return formatLength(distance(m.a, m.b), s);
  if (m.kind === 'polyline') return formatLength(perimeter(m.points), s);
  return `${formatArea(polygonArea(m.points), s)} · ${formatLength(perimeter(m.points, true), s)}`;
}

/** Draws the measurement lines with their labels onto the pages (flattened into the content). */
export async function burnMeasurements(bytes: Uint8Array, items: Measurement[], scale: Scale, color = '#d32f2f'): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const fonts = await embedFonts(doc, 'bold');
  const c = hexToRgb(color);
  for (const m of items) {
    const page = doc.getPage(m.page);
    const pts: Pt[] = m.kind === 'distance' ? [m.a, m.b] : m.points;
    for (let i = 1; i < pts.length; i++) {
      page.drawLine({ start: { x: pts[i - 1][0], y: pts[i - 1][1] }, end: { x: pts[i][0], y: pts[i][1] }, thickness: 1.2, color: c });
    }
    if (m.kind === 'area' && pts.length > 2) {
      const last = pts[pts.length - 1];
      page.drawLine({ start: { x: last[0], y: last[1] }, end: { x: pts[0][0], y: pts[0][1] }, thickness: 1.2, color: c });
    }
    for (const p of pts) page.drawCircle({ x: p[0], y: p[1], size: 2.2, color: c });
    // label in the middle of the first/last point, on a white pill so it stays readable
    const mid: Pt = m.kind === 'distance' ? [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2] : [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    const label = measurementLabel(m, scale);
    const size = 9;
    const w = measureLine(label, fonts, size);
    page.drawRectangle({ x: mid[0] - w / 2 - 3, y: mid[1] + 3, width: w + 6, height: size + 5, color: rgb(1, 1, 1), opacity: 0.9, borderColor: c, borderWidth: 0.5 });
    drawLine(page, label, { x: mid[0], y: mid[1] + 6.5, size, fonts, color: c, align: 'center' });
  }
  return doc.save();
}
