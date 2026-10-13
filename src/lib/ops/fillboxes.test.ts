// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, degrees } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { DEFAULT_BOX_STYLE, readingOrder, viewFrame, writeBoxes, type TextBox } from './fillboxes';

beforeAll(initNodeEnv);
const dir = mkdtempSync(join(tmpdir(), 'sc-'));
const text = (n: string, b: Uint8Array) => {
  const f = join(dir, n);
  writeFileSync(f, b);
  return execFileSync('pdftotext', [f, '-']).toString();
};
const blank = async (rotate = 0) => {
  const doc = await PDFDocument.create();
  const p = doc.addPage([400, 300]);
  if (rotate) p.setRotation(degrees(rotate));
  return doc.save();
};
const box = (over: Partial<TextBox> = {}): TextBox => ({ page: 0, rect: { x: 40, y: 200, width: 200, height: 24 }, text: 'Ahmed Aldary', multiline: false, style: DEFAULT_BOX_STYLE, ...over });

describe('fill boxes', () => {
  it('writes English and Arabic text into the boxes', async () => {
    const out = await writeBoxes(await blank(), [box(), box({ rect: { x: 40, y: 150, width: 200, height: 24 }, text: 'أحمد الديري' })]);
    const t = text('a.pdf', out);
    expect(t).toContain('Ahmed Aldary');
    expect(t).toContain('أحمد الديري');
  });

  it('draws bold, italic, underlined, centred and right-to-left text without failing', async () => {
    const styles = [
      { ...DEFAULT_BOX_STYLE, bold: true },
      { ...DEFAULT_BOX_STYLE, italic: true, underline: true, color: '#cc0000' },
      { ...DEFAULT_BOX_STYLE, mode: 'center' as const },
      { ...DEFAULT_BOX_STYLE, mode: 'rtl' as const, size: 14 },
    ];
    const out = await writeBoxes(await blank(), styles.map((style, i) => box({ style, rect: { x: 40, y: 250 - i * 40, width: 200, height: 24 }, text: `Line ${i}` })));
    const t = text('b.pdf', out);
    for (let i = 0; i < 4; i++) expect(t).toContain(`Line ${i}`);
  });

  it('wraps a text area inside its box', async () => {
    const out = await writeBoxes(await blank(), [box({ multiline: true, rect: { x: 40, y: 100, width: 80, height: 90 }, text: 'one two three four five six seven eight nine ten' })]);
    const t = text('c.pdf', out);
    expect(t.split('\n').filter((l) => l.trim()).length).toBeGreaterThan(2);
  });

  it('keeps text upright on a rotated page', async () => {
    const out = await writeBoxes(await blank(90), [box()]);
    const t = text('d.pdf', out);
    expect(t).toContain('Ahmed Aldary');
  });

  it('skips empty boxes', async () => {
    const out = await writeBoxes(await blank(), [box({ text: '   ' })]);
    expect(text('e.pdf', out).trim()).toBe('');
  });

  it('finds the box corner as read on turned pages', () => {
    expect(viewFrame({ x: 10, y: 20, width: 100, height: 30 }, 0)).toEqual({ x: 10, y: 20, width: 100, height: 30 });
    const f = viewFrame({ x: 10, y: 20, width: 100, height: 30 }, 90);
    expect([f.width, f.height]).toEqual([30, 100]);
  });

  it('orders boxes by page, then row from the top, then across the row', () => {
    const r = (x: number, y: number) => ({ page: 0, rect: { x, y, width: 50, height: 20 } });
    const a = { id: 'a', ...r(10, 200) };
    const b = { id: 'b', ...r(100, 201) };
    const c = { id: 'c', ...r(10, 100) };
    const d = { id: 'd', page: 1, rect: { x: 10, y: 300, width: 50, height: 20 } };
    expect(readingOrder([d, c, b, a]).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(readingOrder([d, c, b, a], true).map((x) => x.id)).toEqual(['b', 'a', 'c', 'd']);
  });
});
