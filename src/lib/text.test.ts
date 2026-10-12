// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { embedFonts, setFontLoader } from './fonts';
import { drawLine, drawParagraph, layoutLine, wrapText } from './text';

beforeAll(() => {
  // In tests the font "URLs" are vite dev paths into node_modules.
  setFontLoader(async (url) => new Uint8Array(readFileSync(join(process.cwd(), url.split('?')[0]))));
});

const have = (cmd: string) => {
  try {
    execFileSync('which', [cmd]);
    return true;
  } catch {
    return false;
  }
};

describe('text engine', () => {
  it('lays out mixed Arabic / Latin / digits in visual order', async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedFonts(doc);
    const line = layoutLine('طلب رقم 123 من Ahmed', fonts, 14);
    expect(line.rtl).toBe(true);
    // visual (left-to-right) order for an RTL paragraph: Latin name first, digits next, Arabic words last
    const joined = line.chunks.map((c) => c.text.trim()).filter(Boolean);
    expect(joined[0]).toBe('Ahmed');
    expect(joined).toContain('123');
    expect(line.width).toBeGreaterThan(50);
  });

  it('keeps dates readable and puts brackets and spaces on the correct side', async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedFonts(doc);
    const line = layoutLine('طلب رقم 123 من Ahmed بتاريخ 2026-10-10 (معتمد)', fonts, 14);
    // visual order, left to right
    expect(line.chunks.map((c) => c.text)).toEqual([
      '(', 'معتمد', ') ', '2026-10-10', ' ', 'بتاريخ', ' ', 'Ahmed', ' ', 'من', ' ', '123', ' ', 'رقم', ' ', 'طلب',
    ]);
  });

  it('lays out plain English left to right', async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedFonts(doc);
    const line = layoutLine('Total: 1,250 KWD (paid)', fonts, 12);
    expect(line.rtl).toBe(false);
    expect(line.chunks.map((c) => c.text).join('')).toBe('Total: 1,250 KWD (paid)');
  });

  it('wraps text to the given width', async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedFonts(doc);
    const text = 'هذا نص طويل جدا يحتاج إلى التفاف على عدة أسطر داخل صفحة ضيقة';
    const lines = wrapText(text, fonts, 14, 120);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(layoutLine(l, fonts, 14).width).toBeLessThanOrEqual(120.5);
    expect(lines.join(' ')).toBe(text);
  });

  it.skipIf(!have('pdftotext'))('produces a PDF whose text extracts correctly', async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedFonts(doc);
    const bold = await embedFonts(doc, 'bold');
    const page = doc.addPage([420, 420]);
    drawLine(page, 'Shootcut — أدوات PDF', { x: 400, y: 380, size: 18, fonts: bold, align: 'right' });
    drawLine(page, 'English line: Total 1,250 KWD', { x: 20, y: 340, size: 14, fonts });
    drawLine(page, 'طلب رقم 123 من Ahmed بتاريخ 2026-10-10 (معتمد)', { x: 400, y: 300, size: 14, fonts, align: 'right' });
    drawLine(page, 'DRAFT مسودة', { x: 210, y: 200, size: 48, fonts: bold, align: 'center', rotate: 30, color: rgb(0.8, 0.1, 0.1), opacity: 0.4 });
    drawParagraph(page, 'هذه فقرة طويلة بالعربية تحتوي على كلمات كثيرة لاختبار الالتفاف والمحاذاة إلى اليمين داخل صندوق نص ضيق.', {
      x: 20, y: 150, width: 380, size: 13, fonts,
    });
    const bytes = await doc.save();

    const dir = mkdtempSync(join(tmpdir(), 'sc-text-'));
    const file = join(dir, 'out.pdf');
    writeFileSync(file, bytes);
    if (process.env.SC_OUT) writeFileSync(process.env.SC_OUT, bytes);

    const txt = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
    expect(txt).toContain('Shootcut');
    expect(txt).toContain('1,250 KWD');
    expect(txt).toContain('Ahmed');
    // Arabic must be extractable in logical order (not reversed letters)
    expect(txt).toContain('أدوات');
    expect(txt).toContain('معتمد');
  });
});

describe('Arabic ligatures stay extractable', () => {
  it.skipIf(!have('pdftotext'))('returns the letters in order for words that use ligature glyphs', async () => {
    const doc = await PDFDocument.create();
    const fonts = await embedFonts(doc, 'bold');
    const page = doc.addPage([500, 500]);
    const words = ['سري', 'نهائي', 'لا', 'كلام', 'إلى', 'الله', 'معتمد', 'للمراجعة'];
    words.forEach((w, i) => drawLine(page, w, { x: 20, y: 460 - i * 45, size: 30, fonts }));
    const file = join(mkdtempSync(join(tmpdir(), 'sc-')), 'a.pdf');
    writeFileSync(file, await doc.save());
    const strip = (s: string) => s.replace(/[‪-‮⁦-⁩]/g, '');
    const lines = strip(execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })).split('\n').filter(Boolean).filter((l) => l !== '\f');
    expect(lines).toEqual(words);
  });
});
