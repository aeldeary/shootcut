// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { PasswordRequiredError, unlockPdf, WrongPasswordError } from './source';

async function encrypted() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 200]).drawText('Secret text', { x: 20, y: 100, font, size: 20 });
  const dir = mkdtempSync(join(tmpdir(), 'sc-'));
  writeFileSync(join(dir, 'a.pdf'), await doc.save());
  execFileSync('qpdf', ['--encrypt', 'user1', 'owner1', '256', '--', join(dir, 'a.pdf'), join(dir, 'e.pdf')]);
  return new Uint8Array(readFileSync(join(dir, 'e.pdf')));
}

describe('unlockPdf', () => {
  it('asks for a password, rejects a wrong one, accepts the right one', async () => {
    const enc = await encrypted();
    await expect(unlockPdf(enc)).rejects.toBeInstanceOf(PasswordRequiredError);
    await expect(unlockPdf(enc, 'nope')).rejects.toBeInstanceOf(WrongPasswordError);
    const out = await unlockPdf(enc, 'user1');
    const dir = mkdtempSync(join(tmpdir(), 'sc-'));
    writeFileSync(join(dir, 'o.pdf'), out);
    expect(execFileSync('qpdf', ['--show-encryption', join(dir, 'o.pdf')]).toString()).toContain('not encrypted');
    expect(readFileSync(join(dir, 'o.pdf')).includes('/Encrypt')).toBe(false);
    expect(execFileSync('pdftotext', [join(dir, 'o.pdf'), '-']).toString()).toContain('Secret text');
    const doc = await PDFDocument.load(out);
    expect(doc.isEncrypted).toBe(false);
    expect(doc.getPageCount()).toBe(1);
  });
  it('returns unencrypted files untouched', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    expect(await unlockPdf(bytes)).toBe(bytes);
  });
});
