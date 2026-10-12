import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { I18nProvider } from '../i18n';
import { initNodeEnv } from '../test/node';
import { makeFile, stubBrowserBits, upload } from '../test/dom';
import { PdfExtractTool, PdfSplitTool } from './PdfPageTools';

vi.mock('pdfjs-dist', async () => (await import('../test/dom')).legacyPdfjs());

const downloads: { bytes: Uint8Array; name: string }[] = [];
vi.mock('../lib/pdf', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/pdf')>();
  return { ...orig, downloadBytes: (bytes: Uint8Array, name: string) => downloads.push({ bytes, name }) };
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
async function sample(n: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([300 + i, 400]);
  return doc.save();
}
const widths = async (b: Uint8Array) => (await PDFDocument.load(b)).getPages().map((p) => Math.round(p.getWidth()));

describe('page tools', () => {
  it('splits into a ZIP of several files', async () => {
    wrap(<PdfSplitTool />);
    upload([makeFile(await sample(5), 'report.pdf')]);
    await screen.findByText(/5 pages/);
    fireEvent.change(screen.getByPlaceholderText('1-3, 4-6, 7'), { target: { value: '1-2, 5' } });
    await screen.findByText(/This will make/);
    fireEvent.click(screen.getByRole('button', { name: 'Split' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe('report-split.zip');
    expect(Object.keys(unzipSync(downloads[0].bytes)).sort()).toEqual(['report-page-5.pdf', 'report-pages-1-2.pdf']);
  });

  it('extracts the pages named, and removes the others when asked', async () => {
    wrap(<PdfExtractTool />);
    upload([makeFile(await sample(5), 'report.pdf')]);
    await screen.findByText(/5 pages/);
    const run = () => screen.getByRole('button', { name: /Extract|Remove$/ });
    expect((run() as HTMLButtonElement).disabled).toBe(true); // nothing typed yet
    fireEvent.change(screen.getByPlaceholderText('All pages'), { target: { value: '2, 4' } });
    fireEvent.click(run());
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(await widths(downloads[0].bytes)).toEqual([301, 303]);

    fireEvent.click(screen.getByRole('tab', { name: 'Remove pages' }));
    fireEvent.click(run());
    await waitFor(() => expect(downloads).toHaveLength(2));
    expect(await widths(downloads[1].bytes)).toEqual([300, 302, 304]);

    fireEvent.change(screen.getByPlaceholderText('All pages'), { target: { value: '1-5' } });
    await screen.findByText(/remove every page/);
    expect((run() as HTMLButtonElement).disabled).toBe(true);
  });
});
