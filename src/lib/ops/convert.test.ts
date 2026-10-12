// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { embedFonts } from '../fonts';
import { openPreview, type PdfPreview } from '../pdf';
import { drawLine } from '../text';
import { initNodeEnv } from '../../test/node';
import { columnName, convertPdf, extractPages, isRtlText, toParagraphs, type PageLine } from './convert';

vi.mock('pdfjs-dist', async () => ({ ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), GlobalWorkerOptions: {} }));
beforeAll(initNodeEnv);
const dir = mkdtempSync(join(tmpdir(), 'sc-conv-'));

async function sample(): Promise<PdfPreview> {
  const doc = await PDFDocument.create();
  const fonts = await embedFonts(doc);
  const p1 = doc.addPage([400, 400]);
  drawLine(p1, 'Quarterly report', { x: 40, y: 360, size: 20, fonts });
  drawLine(p1, 'This is the first paragraph of the report and it is long enough', { x: 40, y: 330, size: 11, fonts });
  drawLine(p1, 'to wrap onto a second line of the same paragraph.', { x: 40, y: 316, size: 11, fonts });
  drawLine(p1, 'مرحبا بكم في شركة الديري للتسويق', { x: 360, y: 270, size: 14, fonts, align: 'right', base: 'rtl' });
  // a small table
  for (const [row, y] of [[['Item', 'Qty', 'Price'], 200], [['Pens', '4', '12.5'], 180], [['Books', '2', '30'], 160]] as const) {
    drawLine(p1, row[0], { x: 40, y, size: 11, fonts });
    drawLine(p1, row[1], { x: 160, y, size: 11, fonts });
    drawLine(p1, row[2], { x: 280, y, size: 11, fonts });
  }
  const p2 = doc.addPage([400, 400]);
  drawLine(p2, 'Second page text', { x: 40, y: 360, size: 12, fonts });
  return openPreview(await doc.save());
}

// LibreOffice is used to prove the files open in a real office suite; CI machines may not have it
const HAS_OFFICE = (() => {
  try {
    execFileSync('soffice', ['--version'], { stdio: 'pipe', timeout: 60_000 });
    return true;
  } catch {
    return false;
  }
})();
const office = it.skipIf(!HAS_OFFICE);
const HAS_XMLLINT = (() => {
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
})();

const soffice = (args: string[]) =>
  execFileSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/profile`, ...args], { timeout: 90_000, stdio: 'pipe' });

describe('Export to other formats', () => {
  it('reads lines in reading order and finds table cells', async () => {
    const [p1] = await extractPages(await sample(), [0]);
    const texts = p1.lines.map((l) => l.text);
    expect(texts[0]).toBe('Quarterly report');
    expect(texts).toContain('مرحبا بكم في شركة الديري للتسويق');
    const row = p1.lines.find((l) => l.text.startsWith('Books'))!;
    expect(row.cells.map((c) => c.text)).toEqual(['Books', '2', '30']);
    // wrapped lines become one paragraph, headings and short lines stand alone
    const paras = p1.paragraphs.map((q) => q.text);
    expect(paras).toContain('This is the first paragraph of the report and it is long enough to wrap onto a second line of the same paragraph.');
  });

  it('knows the direction of a paragraph from its first letter', () => {
    expect(isRtlText('مرحبا Hello')).toBe(true);
    expect(isRtlText('2026 مرحبا')).toBe(true);
    expect(isRtlText('Hello مرحبا')).toBe(false);
    expect(columnName(0)).toBe('A');
    expect(columnName(27)).toBe('AB');
    const l = (text: string, top: number): PageLine => ({ text, rtl: false, top, height: 10, left: 0, right: 100, cells: [{ text, x: 0, width: 100 }] });
    expect(toParagraphs([l('a', 100), l('b', 88), l('c', 40)]).map((q) => q.text)).toEqual(['a b', 'c']);
  });

  it('writes plain text, RTF, HTML and XML with Arabic intact', async () => {
    const preview = await sample();
    for (const f of ['txt', 'html', 'xml'] as const) {
      const r = await convertPdf(preview, 'report.pdf', f, [0, 1]);
      const s = Buffer.from(r.bytes).toString('utf8');
      expect(s).toContain('مرحبا بكم في شركة الديري للتسويق');
      expect(s).toContain('Second page text');
      expect(r.name).toBe(`report.${f}`);
    }
    const xml = Buffer.from((await convertPdf(preview, 'report.pdf', 'xml', [0])).bytes);
    writeFileSync(join(dir, 'x.xml'), xml);
    if (HAS_XMLLINT) execFileSync('xmllint', ['--noout', join(dir, 'x.xml')]);
    expect(xml.toString()).toMatch(/^<\?xml[^>]*\?>\s*<document /);
    expect(xml.toString().trim().endsWith('</document>')).toBe(true);
    const html = Buffer.from((await convertPdf(preview, 'report.pdf', 'html', [0])).bytes).toString();
    expect(html).toContain('dir="rtl"');
  });

  office('writes RTF that an office suite reads back', async () => {
    const preview = await sample();
    const rtf = await convertPdf(preview, 'report.pdf', 'rtf', [0, 1]);
    writeFileSync(join(dir, 'r.rtf'), rtf.bytes);
    soffice(['--convert-to', 'txt:Text (encoded):UTF8', '--outdir', dir, join(dir, 'r.rtf')]);
    const back = readFileSync(join(dir, 'r.txt'), 'utf8');
    expect(back).toContain('مرحبا بكم في شركة الديري للتسويق');
    expect(back).toContain('Quarterly report');
    expect(back).toContain('Second page text');
  }, 120_000);

  office('writes a Word file that Word-compatible software reads back, right-to-left included', async () => {
    const r = await convertPdf(await sample(), 'report.pdf', 'docx', [0, 1]);
    const zip = unzipSync(r.bytes);
    expect(Object.keys(zip)).toContain('word/document.xml');
    expect(Buffer.from(zip['word/document.xml']).toString()).toContain('<w:bidi/>');
    writeFileSync(join(dir, 'd.docx'), r.bytes);
    soffice(['--convert-to', 'txt:Text (encoded):UTF8', '--outdir', dir, join(dir, 'd.docx')]);
    const back = readFileSync(join(dir, 'd.txt'), 'utf8');
    expect(back).toContain('مرحبا بكم في شركة الديري للتسويق');
    expect(back).toContain('Second page text');
    soffice(['--convert-to', 'pdf', '--outdir', dir, join(dir, 'd.docx')]);
    expect(execFileSync('pdfinfo', [join(dir, 'd.pdf')]).toString()).toMatch(/Pages:\s+2/);
    expect(execFileSync('pdftotext', [join(dir, 'd.pdf'), '-']).toString()).toContain('مرحبا بكم في شركة الديري للتسويق');
  }, 120_000);

  office('writes a spreadsheet with the table in separate columns', async () => {
    const r = await convertPdf(await sample(), 'report.pdf', 'xlsx', [0]);
    writeFileSync(join(dir, 's.xlsx'), r.bytes);
    soffice(['--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76', '--outdir', dir, join(dir, 's.xlsx')]);
    const csv = readFileSync(join(dir, 's.csv'), 'utf8');
    expect(csv).toMatch(/Books,2,30/);
    expect(csv).toMatch(/Pens,4,12\.5/);
  }, 120_000);

  office('writes a presentation with one slide per page', async () => {
    const preview = await sample();
    const r = await convertPdf(preview, 'report.pdf', 'pptx', [0, 1]);
    writeFileSync(join(dir, 'p.pptx'), r.bytes);
    soffice(['--convert-to', 'pdf', '--outdir', dir, join(dir, 'p.pptx')]);
    expect(execFileSync('pdfinfo', [join(dir, 'p.pdf')]).toString()).toMatch(/Pages:\s+2/);
    expect(Object.keys(unzipSync(r.bytes)).some((n) => n.startsWith('ppt/notesSlides/'))).toBe(true);
  }, 120_000);

  it('reports when the PDF has no text', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const r = await convertPdf(await openPreview(await doc.save()), 'blank.pdf', 'txt', [0]);
    expect(r.chars).toBe(0);
  });
});
