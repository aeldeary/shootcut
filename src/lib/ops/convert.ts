import { strToU8, zipSync } from 'fflate';
import { baseName, canvasToBytes, createCanvas, type PdfPreview } from '../pdf';
import { hasArabic } from '../text';
import { groupLines, stripTatweel } from './textselect';

/** Formats the "Export to" tool can write. Images have their own tool. */
export type ConvertFormat = 'txt' | 'rtf' | 'html' | 'xml' | 'docx' | 'xlsx' | 'pptx';

export interface Cell {
  text: string;
  x: number;
  width: number;
}

export interface PageLine {
  text: string;
  rtl: boolean;
  /** vertical position of the baseline band, PDF points (bigger = higher on the page) */
  top: number;
  height: number;
  left: number;
  right: number;
  /** pieces of the line separated by wide gaps (table columns) */
  cells: Cell[];
  vertical?: boolean;
}

export interface Paragraph {
  text: string;
  rtl: boolean;
}

export interface ExtractedPage {
  /** 0-based page index */
  index: number;
  lines: PageLine[];
  paragraphs: Paragraph[];
}

const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LETTER = /\p{L}/u;

/** Direction of a piece of text: decided by its first letter, like a word processor does. */
export function isRtlText(text: string): boolean {
  for (const ch of text) {
    if (LETTER.test(ch)) return RTL_CHAR.test(ch);
  }
  return hasArabic(text);
}

/** Reads the text of the given pages, line by line, in reading order. */
export async function extractPages(preview: PdfPreview, pages: number[]): Promise<ExtractedPage[]> {
  const out: ExtractedPage[] = [];
  for (const index of pages) {
    const grouped = groupLines(await preview.textItems(index));
    const lines: PageLine[] = grouped.map((g) => {
      if (g.vertical) {
        const text = stripTatweel(g.items.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim());
        return { text, rtl: isRtlText(text), top: g.top, height: g.items[0].height, left: g.items[0].x, right: g.items[0].x + g.items[0].height, cells: [{ text, x: g.items[0].x, width: g.items[0].height }], vertical: true };
      }
      const rtl = g.rtl;
      const runs = rtl ? [...g.items].reverse() : g.items; // reading order
      const height = g.top - g.bottom;
      let text = '';
      const cells: Cell[] = [];
      let cell: Cell | null = null;
      let prev: (typeof runs)[number] | null = null;
      for (const run of runs) {
        const gap = prev ? (rtl ? prev.x - (run.x + run.width) : run.x - (prev.x + prev.width)) : 0;
        const startsCell = !prev || gap > height * 1.8;
        if (startsCell) {
          cell = { text: run.str.trim(), x: run.x, width: run.width };
          cells.push(cell);
          if (prev) text += '\t';
        } else if (cell) {
          const space = gap > height * 0.12 && !/\s$/.test(cell.text) && !/^\s/.test(run.str) ? ' ' : '';
          cell.text += space + run.str.trim();
          cell.width = Math.max(cell.width, run.x + run.width - cell.x);
          text += space;
        }
        text += run.str.trim();
        prev = run;
      }
      // stretched letters (tatweel) are decoration: they make editing and searching harder
      for (const c of cells) c.text = stripTatweel(c.text);
      return {
        text: stripTatweel(text).replace(/[ ]{2,}/g, ' '),
        rtl,
        top: g.top,
        height,
        left: Math.min(...g.items.map((i) => i.x)),
        right: Math.max(...g.items.map((i) => i.x + i.width)),
        cells,
      };
    });
    out.push({ index, lines, paragraphs: toParagraphs(lines) });
  }
  return out;
}

/** Joins lines into paragraphs: a new one starts after a big vertical gap or after a short line. */
export function toParagraphs(lines: PageLine[]): Paragraph[] {
  if (lines.length === 0) return [];
  const widest = Math.max(...lines.map((l) => l.right - l.left));
  const paras: Paragraph[] = [];
  let current: PageLine[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const text = current.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
    paras.push({ text, rtl: isRtlText(text) });
    current = [];
  };
  let prev: PageLine | null = null;
  for (const line of lines) {
    if (prev) {
      const gap = prev.top - line.top;
      const tabular = line.cells.length > 1 || prev.cells.length > 1;
      const short = prev.right - prev.left < widest * 0.7;
      // wrapped lines of one paragraph start at the same edge; a centred heading and the line under it do not
      const aligned = (prev.rtl ? Math.abs(prev.right - line.right) : Math.abs(prev.left - line.left)) < prev.height * 0.8;
      if (gap > prev.height * 1.9 || short || !aligned || tabular || prev.rtl !== line.rtl || prev.vertical || line.vertical) flush();
    }
    current.push(line);
    prev = line;
  }
  flush();
  return paras;
}

/* ------------------------------------------------------------------ writers */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// characters XML 1.0 cannot carry
const xmlSafe = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');

export function toPlainText(pages: ExtractedPage[]): string {
  return pages.map((p) => p.lines.map((l) => l.text).join('\n')).join('\n\n\f');
}

function rtfEscape(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') out += `\\${ch}`;
    else if (ch === '\t') out += '\\tab ';
    else if (c < 128) out += ch;
    else if (c > 0xffff) {
      const v = c - 0x10000;
      out += `\\u${((v >> 10) + 0xd800) - 65536}?\\u${((v & 0x3ff) + 0xdc00) - 65536}?`;
    } else out += `\\u${c > 32767 ? c - 65536 : c}?`;
  }
  return out;
}

export function toRtf(pages: ExtractedPage[]): string {
  const body = pages
    .map((p, i) => {
      const paras = p.paragraphs.map((q) => `{\\pard${q.rtl ? '\\rtlpar\\qr' : '\\ltrpar\\ql'}\\sa120 ${q.rtl ? '\\rtlch ' : ''}${rtfEscape(q.text)}\\par}`).join('\n');
      return paras + (i < pages.length - 1 ? '\n\\page\n' : '');
    })
    .join('');
  return `{\\rtf1\\ansi\\deff0\\uc1{\\fonttbl{\\f0\\fnil\\fcharset0 Arial;}}\\viewkind4\n${body}\n}`;
}

export function toHtml(pages: ExtractedPage[], title: string): string {
  const arabic = pages.some((p) => p.paragraphs.some((q) => q.rtl));
  const sections = pages
    .map((p) => `<section data-page="${p.index + 1}">\n${p.paragraphs.map((q) => `<p dir="${q.rtl ? 'rtl' : 'ltr'}">${esc(xmlSafe(q.text))}</p>`).join('\n')}\n</section>`)
    .join('\n<hr>\n');
  return `<!doctype html>\n<html lang="${arabic ? 'ar' : 'en'}">\n<head>\n<meta charset="utf-8">\n<title>${esc(title)}</title>\n<style>body{font-family:system-ui,Arial,sans-serif;max-width:50rem;margin:2rem auto;padding:0 1rem;line-height:1.7}</style>\n</head>\n<body>\n${sections}\n</body>\n</html>\n`;
}

export function toXml(pages: ExtractedPage[], title: string): string {
  const body = pages
    .map((p) => `  <page number="${p.index + 1}">\n${p.paragraphs.map((q) => `    <paragraph dir="${q.rtl ? 'rtl' : 'ltr'}">${esc(xmlSafe(q.text))}</paragraph>`).join('\n')}\n  </page>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<document title="${esc(xmlSafe(title))}">\n${body}\n</document>\n`;
}

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

export function toDocx(pages: ExtractedPage[], title: string): Uint8Array {
  const paras: string[] = [];
  pages.forEach((p, pi) => {
    p.paragraphs.forEach((q, qi) => {
      const pageBreak = pi > 0 && qi === 0 ? '<w:pageBreakBefore/>' : '';
      const ppr = `<w:pPr>${pageBreak}${q.rtl ? '<w:bidi/>' : ''}<w:spacing w:after="120"/></w:pPr>`;
      const rpr = q.rtl ? '<w:rPr><w:rFonts w:cs="Arial"/><w:rtl/></w:rPr>' : '';
      paras.push(`<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${esc(xmlSafe(q.text))}</w:t></w:r></w:p>`);
    });
  });
  if (paras.length === 0) paras.push('<w:p/>');
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W_NS}><w:body>${paras.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipSync({
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    ),
    'docProps/core.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(xmlSafe(title))}</dc:title><dc:creator>Shootcut</dc:creator></cp:coreProperties>`,
    ),
    'word/document.xml': strToU8(document),
  });
}

/** Excel column letters: 0 -> A, 26 -> AA */
export function columnName(i: number): string {
  let n = i;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Puts the cells of a page into columns by where they start, so tables line up. */
export function pageToRows(page: ExtractedPage): string[][] {
  const starts: number[] = [];
  const tol = 12;
  for (const l of page.lines) {
    if (l.cells.length < 2) continue;
    for (const c of l.cells) if (!starts.some((s) => Math.abs(s - c.x) < tol)) starts.push(c.x);
  }
  starts.sort((a, b) => a - b);
  const rtl = page.lines.filter((l) => l.rtl).length > page.lines.length / 2;
  const colOf = (x: number) => {
    let best = 0;
    starts.forEach((s, i) => {
      if (Math.abs(s - x) < Math.abs(starts[best] - x)) best = i;
    });
    return rtl ? starts.length - 1 - best : best;
  };
  return page.lines.map((l) => {
    if (l.cells.length < 2 || starts.length === 0) return [l.text];
    const row: string[] = Array(starts.length).fill('');
    for (const c of l.cells) {
      const i = colOf(c.x);
      row[i] = row[i] ? `${row[i]} ${c.text}` : c.text;
    }
    return row;
  });
}

export function toXlsx(pages: ExtractedPage[]): Uint8Array {
  const sheets = pages.length > 0 ? pages : [{ index: 0, lines: [], paragraphs: [] } as ExtractedPage];
  const files: Record<string, Uint8Array> = {};
  sheets.forEach((p, i) => {
    const rows = pageToRows(p);
    const rtl = p.lines.filter((l) => l.rtl).length > p.lines.length / 2;
    const data = rows
      .map((cells, r) => {
        const cs = cells
          .map((v, c) => (v === '' ? '' : `<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(xmlSafe(v))}</t></is></c>`))
          .join('');
        return `<row r="${r + 1}">${cs}</row>`;
      })
      .join('');
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${rtl ? ' rightToLeft="1"' : ''}/></sheetViews><sheetData>${data}</sheetData></worksheet>`,
    );
  });
  files['[Content_Types].xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`,
  );
  files['_rels/.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  files['xl/workbook.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map((p, i) => `<sheet name="Page ${p.index + 1}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}</Relationships>`,
  );
  return zipSync(files);
}

/** One slide per page: the page as a picture (so it looks exactly right), with its text in the notes. */
export async function toPptx(preview: PdfPreview, pages: ExtractedPage[], title: string): Promise<Uint8Array> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.title = title;
  pptx.author = 'Shootcut';
  const first = pages[0] ? await preview.pageSize(pages[0].index) : { width: 960, height: 540 };
  const width = 13.333;
  const height = Math.round((width * first.height * 100) / first.width) / 100;
  pptx.defineLayout({ name: 'PDF', width, height });
  pptx.layout = 'PDF';
  for (const p of pages) {
    const size = await preview.pageSize(p.index);
    const canvas = createCanvas(1, 1);
    await preview.renderToCanvas(p.index, canvas, Math.min(2.5, 2000 / Math.max(size.width, size.height)));
    const jpg = await canvasToBytes(canvas, 'image/jpeg', 0.88);
    const slide = pptx.addSlide();
    // fit the page inside the slide
    const k = Math.min(width / size.width, height / size.height);
    const w = size.width * k;
    const h = size.height * k;
    slide.addImage({ data: `data:image/jpeg;base64,${toBase64(jpg)}`, x: (width - w) / 2, y: (height - h) / 2, w, h });
    slide.addNotes(p.paragraphs.map((q) => q.text).join('\n'));
  }
  const data = (await pptx.write({ outputType: 'uint8array' })) as Uint8Array;
  return data;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export interface ConvertResult {
  bytes: Uint8Array;
  name: string;
  mime: string;
  /** characters found: 0 means the PDF has no text layer (a scan) */
  chars: number;
}

const MIME: Record<ConvertFormat, string> = {
  txt: 'text/plain;charset=utf-8',
  rtf: 'application/rtf',
  html: 'text/html;charset=utf-8',
  xml: 'application/xml;charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export async function convertPdf(preview: PdfPreview, fileName: string, format: ConvertFormat, pages: number[]): Promise<ConvertResult> {
  const extracted = await extractPages(preview, pages);
  const chars = extracted.reduce((n, p) => n + p.lines.reduce((m, l) => m + l.text.length, 0), 0);
  const stem = baseName(fileName);
  const text = (s: string, bom = true) => strToU8(bom ? `﻿${s}` : s);
  let bytes: Uint8Array;
  switch (format) {
    case 'txt':
      bytes = text(toPlainText(extracted));
      break;
    case 'rtf':
      bytes = strToU8(toRtf(extracted));
      break;
    case 'html':
      bytes = text(toHtml(extracted, stem), false);
      break;
    case 'xml':
      bytes = text(toXml(extracted, stem), false);
      break;
    case 'docx':
      bytes = toDocx(extracted, stem);
      break;
    case 'xlsx':
      bytes = toXlsx(extracted);
      break;
    case 'pptx':
      bytes = await toPptx(preview, extracted, stem);
      break;
  }
  return { bytes, name: `${stem}.${format}`, mime: MIME[format], chars };
}
