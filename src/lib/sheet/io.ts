import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { MAX_COLS, MAX_ROWS, Sheet, cellKey, colName, display, parseKey, type Cells, type Value, SheetError } from './engine';

/* ------------------------------------------------------------------ CSV */

/** Reads CSV text (comma, semicolon or tab separated, quotes allowed) into cells. */
export function parseCsv(text: string): { cells: Cells; clipped: boolean } {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => ({ d, n: first.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur === '') quoted = true;
    else if (ch === delim) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  const cells: Cells = {};
  let clipped = false;
  rows.forEach((r, ri) =>
    r.forEach((v, ci) => {
      if (v === '') return;
      if (ri >= MAX_ROWS || ci >= MAX_COLS) clipped = true;
      else cells[cellKey(ci, ri)] = v;
    }),
  );
  return { cells, clipped };
}

/** The sheet as CSV: the shown values (CSV cannot hold formulas), with a BOM so Excel reads Arabic correctly. */
export function toCsv(cells: Cells): string {
  const { rows, cols } = extent(cells);
  const sheet = new Sheet(cells);
  const quote = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const line: string[] = [];
    for (let c = 0; c < cols; c++) line.push(quote(cells[cellKey(c, r)] === undefined ? '' : display(sheet.get(cellKey(c, r)))));
    lines.push(line.join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** The used area: number of rows and columns that hold something. */
export function extent(cells: Cells): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  for (const [k, v] of Object.entries(cells)) {
    const p = parseKey(k);
    if (p && v !== '') {
      rows = Math.max(rows, p.r + 1);
      cols = Math.max(cols, p.c + 1);
    }
  }
  return { rows, cols };
}

/* ------------------------------------------------------------------ XLSX */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function cellXml(key: string, raw: string, value: Value): string {
  const r = `r="${key}"`;
  if (raw.startsWith('=')) {
    const f = `<f>${esc(raw.slice(1))}</f>`;
    if (value instanceof SheetError) return `<c ${r} t="e">${f}<v>${esc(value.code)}</v></c>`;
    if (typeof value === 'number') return `<c ${r}>${f}<v>${value}</v></c>`;
    if (typeof value === 'boolean') return `<c ${r} t="b">${f}<v>${value ? 1 : 0}</v></c>`;
    return `<c ${r} t="str">${f}<v>${esc(String(value))}</v></c>`;
  }
  if (typeof value === 'number') return `<c ${r}><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c ${r} t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c ${r} t="inlineStr"><is><t xml:space="preserve">${esc(raw)}</t></is></c>`;
}

/** An .xlsx file (one sheet). Formulas are kept, with their current results stored beside them. */
export function toXlsx(cells: Cells, opts: { rtl?: boolean; sheetName?: string } = {}): Uint8Array {
  const sheet = new Sheet(cells);
  const { rows, cols } = extent(cells);
  let body = '';
  for (let r = 0; r < rows; r++) {
    let row = '';
    for (let c = 0; c < cols; c++) {
      const key = cellKey(c, r);
      const raw = cells[key];
      if (raw === undefined || raw === '') continue;
      row += cellXml(key, raw, sheet.get(key));
    }
    if (row) body += `<row r="${r + 1}">${row}</row>`;
  }
  const name = esc((opts.sheetName || 'Sheet1').slice(0, 31).replace(/[\\/?*[\]:]/g, ' '));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${opts.rtl ? ' rightToLeft="1"' : ''}/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="${Math.max(cols, 1)}" width="16" customWidth="1"/></cols><sheetData>${body}</sheetData></worksheet>`,
    ),
  };
  return zipSync(files);
}

/** Reads the first sheet of an .xlsx file. Formulas come back as "=…"; styles, charts and other sheets are ignored. */
export function fromXlsx(data: Uint8Array): { cells: Cells; clipped: boolean } {
  const zip = unzipSync(data);
  const read = (p: string) => (zip[p] ? new DOMParser().parseFromString(strFromU8(zip[p]), 'application/xml') : null);
  const ns = (d: Document, tag: string) => Array.from(d.getElementsByTagNameNS('*', tag));

  const shared: string[] = [];
  const sst = read('xl/sharedStrings.xml');
  if (sst) for (const si of ns(sst, 'si')) shared.push(ns(si as unknown as Document, 't').map((t) => t.textContent ?? '').join(''));

  // the first sheet listed in the workbook, resolved through its relationship
  let path = 'xl/worksheets/sheet1.xml';
  const wb = read('xl/workbook.xml');
  const rels = read('xl/_rels/workbook.xml.rels');
  const first = wb ? ns(wb, 'sheet')[0] : undefined;
  const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  if (rels && rid) {
    const rel = ns(rels, 'Relationship').find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const doc = read(path);
  if (!doc) throw new Error('no sheet');

  const cells: Cells = {};
  let clipped = false;
  for (const c of ns(doc, 'c')) {
    const p = parseKey(c.getAttribute('r') ?? '');
    if (!p) continue;
    const t = c.getAttribute('t');
    const f = ns(c as unknown as Document, 'f')[0]?.textContent;
    const vEl = ns(c as unknown as Document, 'v')[0]?.textContent ?? '';
    let raw: string;
    if (f) raw = `=${f}`;
    else if (t === 's') raw = shared[Number(vEl)] ?? '';
    else if (t === 'inlineStr') raw = ns(c as unknown as Document, 't').map((x) => x.textContent ?? '').join('');
    else if (t === 'b') raw = vEl === '1' ? 'TRUE' : 'FALSE';
    else raw = vEl;
    if (raw === '') continue;
    if (p.r >= MAX_ROWS || p.c >= MAX_COLS) clipped = true;
    else cells[cellKey(p.c, p.r)] = raw;
  }
  return { cells, clipped };
}

export { colName };
