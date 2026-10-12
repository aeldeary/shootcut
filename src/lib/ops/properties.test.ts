// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { readProperties, writeProperties } from './properties';

describe('document properties', () => {
  it('reads and writes title, author, subject and keywords, Arabic included', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    doc.setProducer('Test producer');
    const original = await doc.save();
    expect((await readProperties(original)).producer).toBe('Test producer');

    const out = await writeProperties(original, { title: 'تقرير 2026', author: 'Ahmed', subject: 'موضوع', keywords: 'خير، Kuwait; report' });
    const p = await readProperties(out);
    expect(p.title).toBe('تقرير 2026');
    expect(p.author).toBe('Ahmed');
    expect(p.subject).toBe('موضوع');
    expect(p.keywords).toBe('خير Kuwait report');
    expect(p.producer).toBe('Test producer');
    expect(p.modified).toBeInstanceOf(Date);

    const dir = mkdtempSync(join(tmpdir(), 'pr-'));
    const f = join(dir, 'p.pdf');
    writeFileSync(f, out);
    expect(execFileSync('qpdf', ['--check', f]).toString()).toContain('No syntax or stream encoding errors');
    expect(execFileSync('pdfinfo', ['-enc', 'UTF-8', f]).toString()).toContain('تقرير 2026');
  });
});
