import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { initNodeEnv } from '../test/node';
import { makeFile, stubBrowserBits, upload } from '../test/dom';
import { unlockPdf } from '../lib/source';
import { CreateTool } from './Create';
import { ExportTool } from './Export';
import { OptimizeTool } from './Optimize';
import { ProtectTool } from './Protect';
import { StampTool } from './Stamp';

vi.mock('pdfjs-dist', async () => (await import('../test/dom')).legacyPdfjs());

const downloads: { bytes: Uint8Array; name: string; mime?: string }[] = [];
vi.mock('../lib/pdf', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/pdf')>();
  return { ...orig, downloadBytes: (bytes: Uint8Array, name: string, mime?: string) => downloads.push({ bytes, name, mime }) };
});

beforeAll(() => {
  initNodeEnv();
  stubBrowserBits();
});
beforeEach(() => {
  downloads.length = 0;
  localStorage.setItem('shootcut:lang', 'en');
});
afterEach(cleanup);

const wrap = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

async function samplePdf(pages = 2) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage([300, 200]).drawText(`Page ${i + 1} body`, { x: 20, y: 100, size: 18, font });
  return doc.save();
}
const btn = (name: string | RegExp) => screen.getByRole('button', { name });

describe('Protect', () => {
  it('encrypts with the chosen password and blocks a mismatch', async () => {
    wrap(<ProtectTool />);
    upload([makeFile(await samplePdf(), 'doc.pdf')]);
    await screen.findByText('doc.pdf');
    fireEvent.change(screen.getByLabelText('Password to open'), { target: { value: 'abc12345' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different' } });
    expect(screen.getByRole('alert').textContent).toMatch(/do not match/);
    expect((btn('Protect and download') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'abc12345' } });
    fireEvent.click(btn('Protect and download'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe('doc-protected.pdf');
    await expect(unlockPdf(downloads[0].bytes)).rejects.toThrow(/Password required/);
    const opened = await unlockPdf(downloads[0].bytes, 'abc12345');
    expect((await PDFDocument.load(opened)).getPageCount()).toBe(2);
  });

  it('removes a password after asking for it', async () => {
    const enc = await (async () => {
      const { protectPdf } = await import('../lib/ops/protect');
      return protectPdf(await samplePdf(1), { userPassword: 'open-sesame', allowPrinting: true, allowCopying: true, allowEditing: true, allowAnnotating: true });
    })();
    wrap(<ProtectTool />);
    fireEvent.click(screen.getByRole('tab', { name: 'Remove password' }));
    upload([makeFile(enc, 'locked.pdf')]);
    const input = await screen.findByPlaceholderText('Password');
    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByText('Wrong password. Try again.');
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'open-sesame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(btn('Save without password')).toBeTruthy());
    fireEvent.click(btn('Save without password'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect((await PDFDocument.load(downloads[0].bytes)).isEncrypted).toBe(false);
  });
});

describe('Optimize', () => {
  it('shows the result and downloads it on request', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([300, 200]).drawText('x', { x: 1, y: 1, size: 9, font });
    doc.context.register(doc.context.obj({ Junk: 'y'.repeat(20000) }));
    wrap(<OptimizeTool />);
    upload([makeFile(await doc.save(), 'big.pdf')]);
    await screen.findByText('big.pdf');
    fireEvent.click(screen.getByLabelText(/Light/));
    fireEvent.click(btn('Optimize'));
    await screen.findByText(/smaller/);
    expect(downloads).toHaveLength(0);
    fireEvent.click(btn('Download'));
    expect(downloads[0].name).toBe('big-optimized.pdf');
  });
});

describe('Export', () => {
  it('exports every page as a PNG inside a ZIP', async () => {
    wrap(<ExportTool />);
    upload([makeFile(await samplePdf(3), 'slides.pdf')]);
    await screen.findByText('slides.pdf');
    fireEvent.change(screen.getByLabelText('Pages'), { target: { value: '2-3' } });
    fireEvent.click(btn('Export images'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe('slides-images.zip');
    const { unzipSync } = await import('fflate');
    expect(Object.keys(unzipSync(downloads[0].bytes)).sort()).toEqual(['slides-2.png', 'slides-3.png']);
  });

  it('flags an invalid page range and disables export', async () => {
    wrap(<ExportTool />);
    upload([makeFile(await samplePdf(2), 's.pdf')]);
    await screen.findByText('s.pdf');
    fireEvent.change(screen.getByLabelText('Pages'), { target: { value: '9' } });
    expect((btn('Export images') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Create', () => {
  it('builds a PDF from an image and text', async () => {
    const c = createCanvas(80, 40);
    c.getContext('2d').fillRect(0, 0, 80, 40);
    const png = new Uint8Array(await c.encode('png'));
    wrap(<CreateTool />);
    expect((btn('Create PDF') as HTMLButtonElement).disabled).toBe(true);
    upload([makeFile(png, 'pic.png', 'image/png')]);
    await screen.findByText('pic.png');
    fireEvent.change(screen.getByLabelText(/^Text \(optional\)/), { target: { value: 'مرحبا Hello' } });
    fireEvent.click(btn('Create PDF'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect((await PDFDocument.load(downloads[0].bytes)).getPageCount()).toBe(2);
  });
});

describe('Stamp', () => {
  it('stamps the chosen pages with a ready-made stamp', async () => {
    wrap(<StampTool />);
    upload([makeFile(await samplePdf(3), 'contract.pdf')]);
    await screen.findByText('contract.pdf');
    expect((btn('Apply and download') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn('DRAFT'));
    fireEvent.change(screen.getByLabelText('Rotation'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Pages'), { target: { value: '2' } });
    fireEvent.click(btn('Apply and download'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe('contract-stamped.pdf');
    const { execFileSync } = await import('node:child_process');
    const { writeFileSync, mkdtempSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const f = join(mkdtempSync(join(tmpdir(), 'sc-')), 'o.pdf');
    writeFileSync(f, downloads[0].bytes);
    const page = (n: number) => execFileSync('pdftotext', ['-f', String(n), '-l', String(n), f, '-']).toString();
    expect(page(1)).not.toContain('DRAFT');
    expect(page(2)).toContain('DRAFT');
    expect(page(3)).not.toContain('DRAFT');
  });
});
