// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { protectPdf } from './protect';
import { unlockPdf } from '../source';

async function sample() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 200]).drawText('Top secret', { x: 20, y: 100, font, size: 20 });
  return doc.save();
}
const dir = mkdtempSync(join(tmpdir(), 'sc-'));
const write = (n: string, b: Uint8Array) => (writeFileSync(join(dir, n), b), join(dir, n));

describe('protectPdf', () => {
  it('requires the password to open and uses AES-256', async () => {
    const out = write('p.pdf', await protectPdf(await sample(), { userPassword: 'pässword-1', allowPrinting: true, allowCopying: true, allowEditing: true, allowAnnotating: true }));
    const enc = execFileSync('qpdf', ['--show-encryption', '--password=pässword-1', out]).toString();
    expect(enc).toMatch(/R = 6/);
    expect(enc).toMatch(/AESv3/);
    // wrong / missing password: pdftotext fails
    expect(spawnSync('pdftotext', [out, '-']).status).not.toBe(0);
    expect(spawnSync('pdftotext', ['-upw', 'wrong', out, '-']).status).not.toBe(0);
    expect(execFileSync('pdftotext', ['-upw', 'pässword-1', out, '-']).toString()).toContain('Top secret');
    // our own unlock path works too
    const back = await unlockPdf(new Uint8Array(await (await import('node:fs/promises')).readFile(out)), 'pässword-1');
    expect((await PDFDocument.load(back)).getPageCount()).toBe(1);
  });

  it('applies permission restrictions without a user password', async () => {
    const out = write('r.pdf', await protectPdf(await sample(), { allowPrinting: false, allowCopying: false, allowEditing: false, allowAnnotating: true }));
    const info = execFileSync('pdfinfo', [out]).toString();
    expect(info).toMatch(/Encrypted:\s+yes.*print:no.*copy:no.*change:no/);
    expect(execFileSync('pdftotext', [out, '-'], { encoding: 'utf8' }).length).toBeGreaterThan(0);
  });

  it('rejects a request that would protect nothing', async () => {
    await expect(protectPdf(await sample(), { allowPrinting: true, allowCopying: true, allowEditing: true, allowAnnotating: true })).rejects.toThrow();
  });
});
