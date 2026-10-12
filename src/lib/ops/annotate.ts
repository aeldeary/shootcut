import { PDFDocument, PDFHexString, PDFString, type PDFRef } from 'pdf-lib';
import { hexToRgb } from './stamp';
import type { Rect } from './textselect';

export type Markup =
  | { kind: 'highlight' | 'underline' | 'strikeout'; page: number; rects: Rect[]; color: string; comment?: string }
  | { kind: 'note'; page: number; x: number; y: number; text: string; color: string };

const NOTE_SIZE = 22;

const rgbOps = (hex: string) => {
  const c = hexToRgb(hex);
  return [c.red, c.green, c.blue].map((v) => +v.toFixed(3));
};

function bounds(rects: Rect[]): [number, number, number, number] {
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.width));
  const y1 = Math.max(...rects.map((r) => r.y + r.height));
  return [x0, y0, x1, y1];
}

/**
 * Adds real PDF annotations (highlight, underline, strikeout, sticky note) with their own appearance, so
 * they show in Acrobat, browsers and phones and stay editable there. Coordinates are PDF user space.
 */
export async function annotatePdf(bytes: Uint8Array, marks: Markup[], author = ''): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const now = PDFString.fromDate(new Date());

  const form = (bbox: number[], content: string, extra?: Record<string, unknown>): PDFRef =>
    ctx.register(ctx.stream(content, { Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: bbox, ...extra }));

  for (const m of marks) {
    const page = doc.getPage(m.page);
    const common = {
      Type: 'Annot',
      F: m.kind === 'note' ? 28 : 4,
      M: now,
      ...(author ? { T: PDFHexString.fromText(author) } : {}),
    };

    if (m.kind === 'note') {
      const [r, g, b] = rgbOps(m.color);
      const rect = [m.x, m.y - NOTE_SIZE, m.x + NOTE_SIZE, m.y];
      const ap = form(
        [0, 0, NOTE_SIZE, NOTE_SIZE],
        `${r} ${g} ${b} rg 0 0 ${NOTE_SIZE} ${NOTE_SIZE} re f 0.2 G 1 w 0.5 0.5 ${NOTE_SIZE - 1} ${NOTE_SIZE - 1} re S 5 16 m 17 16 l S 5 11 m 17 11 l S 5 6 m 12 6 l S`,
      );
      const annot = ctx.obj({
        ...common,
        Subtype: 'Text',
        Rect: rect,
        Contents: PDFHexString.fromText(m.text),
        Name: 'Comment',
        Open: false,
        C: [r, g, b],
        AP: { N: ap },
      });
      page.node.addAnnot(ctx.register(annot));
      continue;
    }

    if (m.rects.length === 0) continue;
    const [r, g, b] = rgbOps(m.color);
    const [x0, y0, x1, y1] = bounds(m.rects);
    const quads = m.rects.flatMap((q) => [q.x, q.y + q.height, q.x + q.width, q.y + q.height, q.x, q.y, q.x + q.width, q.y]);
    let content: string;
    let extra: Record<string, unknown> | undefined;
    if (m.kind === 'highlight') {
      content = `/GS gs ${r} ${g} ${b} rg ` + m.rects.map((q) => `${q.x} ${q.y} ${q.width} ${q.height} re f`).join(' ');
      extra = { Resources: { ExtGState: { GS: { Type: 'ExtGState', BM: 'Multiply' } } } };
    } else {
      const lineAt = (q: Rect) => (m.kind === 'underline' ? q.y + Math.max(1, q.height * 0.12) : q.y + q.height * 0.4);
      content = `${r} ${g} ${b} RG 1 w ` + m.rects.map((q) => `${q.x} ${lineAt(q)} m ${q.x + q.width} ${lineAt(q)} l S`).join(' ');
    }
    const ap = form([x0, y0, x1, y1], content, extra);
    const annot = ctx.obj({
      ...common,
      Subtype: m.kind === 'highlight' ? 'Highlight' : m.kind === 'underline' ? 'Underline' : 'StrikeOut',
      Rect: [x0, y0, x1, y1],
      QuadPoints: quads,
      C: [r, g, b],
      ...(m.comment ? { Contents: PDFHexString.fromText(m.comment) } : {}),
      AP: { N: ap },
    });
    page.node.addAnnot(ctx.register(annot));
  }
  return doc.save();
}
