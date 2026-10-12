// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { fillPdf, isWinAnsiText, listFormFields } from './fill';

beforeAll(initNodeEnv);
const dir = mkdtempSync(join(tmpdir(), 'sc-'));
const write = (n: string, b: Uint8Array) => (writeFileSync(join(dir, n), b), join(dir, n));

async function formPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  page.drawText('Name:', { x: 20, y: 250, size: 12, font });
  const form = doc.getForm();
  const name = form.createTextField('fullName');
  name.addToPage(page, { x: 80, y: 240, width: 200, height: 24 });
  const agree = form.createCheckBox('agree');
  agree.addToPage(page, { x: 80, y: 200, width: 18, height: 18 });
  const country = form.createDropdown('country');
  country.addOptions(['Kuwait', 'Egypt', 'UAE']);
  country.addToPage(page, { x: 80, y: 160, width: 120, height: 22 });
  return doc.save();
}

describe('fill', () => {
  it('lists fields with their kind, options and page', async () => {
    const fields = await listFormFields(await formPdf());
    expect(fields.map((f) => [f.name, f.kind, f.page])).toEqual([
      ['fullName', 'text', 0],
      ['agree', 'checkbox', 0],
      ['country', 'dropdown', 0],
    ]);
    expect(fields[2].options).toEqual(['Kuwait', 'Egypt', 'UAE']);
  });

  it('fills fields and keeps them editable', async () => {
    const out = await fillPdf(await formPdf(), { values: { fullName: 'Ahmed Aldary', agree: true, country: 'Kuwait' } });
    const fields = await listFormFields(out);
    expect(fields.find((f) => f.name === 'fullName')?.value).toBe('Ahmed Aldary');
    expect(fields.find((f) => f.name === 'agree')?.value).toBe(true);
    expect(fields.find((f) => f.name === 'country')?.value).toBe('Kuwait');
    // appearance is drawn: poppler shows the typed name
    const f = write('filled.pdf', out);
    execFileSync('pdftoppm', ['-r', '72', '-png', f, join(dir, 'filled')]);
    const ink = execFileSync('convert', [join(dir, 'filled-1.png'), '-crop', '200x24+80+36', '+repage', '-colorspace', 'gray', '-threshold', '60%', '-negate', '-format', '%[fx:mean]', 'info:']).toString();
    expect(Number(ink)).toBeGreaterThan(0.01);
  });

  it('writes Arabic into a field by drawing it on the page', async () => {
    expect(isWinAnsiText('Ahmed')).toBe(true);
    expect(isWinAnsiText('أحمد')).toBe(false);
    const out = await fillPdf(await formPdf(), { values: { fullName: 'أحمد الديري' } });
    const f = write('ar.pdf', out);
    expect(execFileSync('pdftotext', [f, '-']).toString()).toContain('أحمد الديري');
    // the original field was replaced by page text
    expect((await listFormFields(out)).map((x) => x.name)).not.toContain('fullName');
  });

  it('flattens: values become page content and fields disappear', async () => {
    const out = await fillPdf(await formPdf(), { values: { fullName: 'Flat Name', agree: true }, flatten: true });
    expect(await listFormFields(out)).toEqual([]);
    expect(execFileSync('pdftotext', [write('flat.pdf', out), '-']).toString()).toContain('Flat Name');
  });

  it('places text, a check mark and a signature image where asked', async () => {
    const c = createCanvas(60, 30);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 0, 60, 30);
    const out = await fillPdf(await formPdf(), {
      marks: [
        { kind: 'text', page: 0, x: 20, y: 100, text: 'التاريخ 2026-10-10 Date', size: 14, color: '#000000' },
        { kind: 'check', page: 0, x: 300, y: 200, size: 20, color: '#000000' },
        { kind: 'image', page: 0, x: 250, y: 100, width: 60, height: 30, image: { bytes: new Uint8Array(await c.encode('png')), mime: 'image/png' } },
      ],
    });
    const f = write('marks.pdf', out);
    const txt = execFileSync('pdftotext', [f, '-']).toString();
    expect(txt).toContain('2026-10-10');
    expect(txt).toContain('Date');
    execFileSync('pdftoppm', ['-r', '72', '-png', f, join(dir, 'marks')]);
    const ink = (x: number, y: number, w: number, h: number) =>
      Number(execFileSync('convert', [join(dir, 'marks-1.png'), '-crop', `${w}x${h}+${x}+${y}`, '+repage', '-colorspace', 'gray', '-threshold', '60%', '-negate', '-format', '%[fx:mean]', 'info:']).toString());
    expect(ink(300, 80, 20, 20)).toBeGreaterThan(0.03); // check mark (page y 200..220 -> image 80..100)
    expect(ink(250, 170, 60, 30)).toBeGreaterThan(0.3); // signature image: blue is dark enough
  });
});
