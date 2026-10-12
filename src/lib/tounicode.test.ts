// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { openPreview } from './pdf';
import { reverseLigatureEntries, withFixedLigatureMaps } from './tounicode';

vi.mock('pdfjs-dist', async () => ({ ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), GlobalWorkerOptions: {} }));

describe('Arabic ligature text maps', () => {
  it('reverses multi-letter Arabic entries only', () => {
    const cmap = '2 beginbfchar\n<00AE> <0644062E>\n<0041> <0041>\n<00B0> <00660069>\nendbfchar\n1 beginbfchar\n<00EA> <06440645>\nendbfchar';
    const fixed = reverseLigatureEntries(cmap)!;
    expect(fixed).toContain('<00AE> <062E0644>'); // lam+khah -> khah+lam
    expect(fixed).toContain('<00EA> <06450644>');
    expect(fixed).toContain('<0041> <0041>'); // single letters untouched
    expect(fixed).toContain('<00B0> <00660069>'); // the Latin "fi" ligature untouched
    expect(reverseLigatureEntries('<0041> <0041>')).toBeNull();
  });

  // The file below is the user's own flyer; it only exists on the machine that was given it.
  const flyer = '/tmp/claude-0/sp/user.pdf';
  it.skipIf(!existsSync(flyer))('reads "المصاحف", "تمويل" and "الخيرية" correctly from an InDesign export', async () => {
    const bytes = new Uint8Array(readFileSync(flyer));
    const plain = await openPreview(bytes);
    const text = (await plain.textItems(0)).map((i) => i.str).join(' ').replace(/\u0640/g, '');
    expect(text).toContain('المصاحف');
    expect(text).toContain('تمويل');
    expect(text).toContain('الخيرية');
    expect(text).not.toContain('املصاحف');
    // the copy is only for reading text: the original bytes are untouched
    expect(await withFixedLigatureMaps(bytes)).not.toBeNull();
    plain.destroy();
  }, 60_000);
});
