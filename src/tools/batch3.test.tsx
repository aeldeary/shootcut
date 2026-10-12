import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { initNodeEnv } from '../test/node';
import { drag, makeFile, stageLayer, stubBrowserBits, upload } from '../test/dom';
import { CommentTool } from './Comment';
import { ConvertTool } from './Convert';
import { PrintTool } from './Print';
import { ShareTool } from './Share';
import { ViewerTool } from './Viewer';

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
const btn = (name: string | RegExp) => screen.getByRole('button', { name });

async function textPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 300]).drawText('Hello secret world', { x: 50, y: 200, size: 20, font });
  doc.addPage([400, 300]).drawText('Second page needle', { x: 50, y: 200, size: 20, font });
  return doc.save();
}
async function blankPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([400, 300]);
  return doc.save();
}
const px = (x: number, y: number): [number, number] => [x * 1.25, (300 - y) * 1.25];

describe('Comment & highlight: when there is no text', () => {
  it('tells the user instead of drawing a box that covers nothing', async () => {
    wrap(<CommentTool />);
    upload([makeFile(await blankPdf(), 'scan.pdf')]);
    const layer = await stageLayer();
    await screen.findByText(/no selectable text/i);
    drag(layer, px(50, 100), px(300, 60));
    await screen.findByText(/No text was found where you dragged/);
    expect(screen.queryByText(/Highlight · Page 1/)).toBeNull();
  });

  it('free area marks a rectangle anywhere', async () => {
    wrap(<CommentTool />);
    upload([makeFile(await blankPdf(), 'scan.pdf')]);
    const layer = await stageLayer();
    fireEvent.click(btn('Free area'));
    drag(layer, px(50, 100), px(300, 60));
    await screen.findByText(/Highlight · Page 1/);
  });
});

describe('Print', () => {
  it('prepares the pages in the chosen colour mode and opens the print dialog', async () => {
    const print = vi.fn();
    window.print = print;
    wrap(<PrintTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    await screen.findByText('doc.pdf');
    fireEvent.click(screen.getByLabelText(/Black and white/));
    fireEvent.change(screen.getByLabelText(/Pages/), { target: { value: '1' } });
    fireEvent.click(btn('Print'));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const root = document.getElementById('print-root')!;
    expect(root.querySelectorAll('img')).toHaveLength(1);
    expect(root.querySelector('img')!.getAttribute('src')!.startsWith('data:image/png')).toBe(true);
    // every page is landscape here, so the dialog starts in landscape
    expect(root.querySelector('style')!.textContent).toContain('landscape');
    fireEvent(window, new Event('afterprint'));
    await waitFor(() => expect(document.getElementById('print-root')).toBeNull());
  });
});

describe('Share', () => {
  it('shares the file through the system sheet when the browser can', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share, canShare: () => true });
    wrap(<ShareTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    fireEvent.click(await screen.findByRole('button', { name: /Share…/ }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect((share.mock.calls[0][0] as { files: File[] }).files[0].name).toBe('doc.pdf');
    await screen.findByText('Shared.');
  });

  it('explains what to do when it cannot, and opens WhatsApp with the message', async () => {
    Object.assign(navigator, { share: undefined, canShare: undefined });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    wrap(<ShareTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    await screen.findByText(/cannot hand files to other apps/);
    expect((screen.getByRole('button', { name: /Share…/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Report ready' } });
    // the first WhatsApp button belongs to "Open an app with a message"
    fireEvent.click(screen.getAllByRole('button', { name: 'WhatsApp' })[0]);
    expect(String(open.mock.calls[0][0])).toBe('https://wa.me/?text=Report%20ready');
    expect(open.mock.calls[0][2]).toContain('noopener');
    open.mockRestore();
  });
});

describe('Export to…', () => {
  it('exports Word and reports a PDF without text', async () => {
    wrap(<ConvertTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    await screen.findByText('doc.pdf');
    fireEvent.click(btn('Export'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe('doc.docx');
    await screen.findByText(/layout is approximate/);

    cleanup();
    downloads.length = 0;
    wrap(<ConvertTool />);
    upload([makeFile(await blankPdf(), 'scan.pdf')]);
    await screen.findByText('scan.pdf');
    fireEvent.change(screen.getByLabelText('Export as'), { target: { value: 'txt' } });
    fireEvent.click(btn('Export'));
    await screen.findByText(/no text to export/);
  });
});

describe('View & find', () => {
  it('finds text on other pages, jumps there and marks it', async () => {
    wrap(<ViewerTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    await screen.findByText('doc.pdf');
    fireEvent.change(screen.getByLabelText('Find in document'), { target: { value: 'NEEDLE' } });
    fireEvent.click(btn('Search'));
    await screen.findByText('1 / 1');
    await waitFor(() => expect((screen.getByLabelText('Go to page') as HTMLInputElement).value).toBe('2'));
    await waitFor(() => expect(document.querySelectorAll('.find-hit')).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Find in document'), { target: { value: 'zzz' } });
    fireEvent.click(btn('Search'));
    await screen.findByText('No matches');
  });

  it('rotates the view and changes the page', async () => {
    wrap(<ViewerTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    await screen.findByText('doc.pdf');
    await waitFor(() => expect((screen.getByTestId('viewer-canvas') as HTMLCanvasElement).style.width).not.toBe(''));
    const w = (screen.getByTestId('viewer-canvas') as HTMLCanvasElement).style.width;
    fireEvent.click(btn('Rotate view'));
    await waitFor(() => expect((screen.getByTestId('viewer-canvas') as HTMLCanvasElement).style.width).not.toBe(w));
    fireEvent.click(btn('Next page'));
    await waitFor(() => expect((screen.getByLabelText('Go to page') as HTMLInputElement).value).toBe('2'));
  });

  it('shows two pages or every page, and the document properties', async () => {
    wrap(<ViewerTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    await screen.findByText('doc.pdf');
    await waitFor(() => expect(screen.getAllByTestId('viewer-canvas')).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Page display'), { target: { value: 'two' } });
    await waitFor(() => expect(screen.getAllByTestId('viewer-canvas')).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Page display'), { target: { value: 'scroll' } });
    await waitFor(() => expect(screen.getAllByTestId('viewer-canvas').length).toBeGreaterThanOrEqual(2));
    fireEvent.click(screen.getByRole('button', { name: 'Document properties' }));
    await screen.findByLabelText('Title');
    expect(screen.getByRole('button', { name: 'Save as a new file' })).toBeTruthy();
    expect(screen.getByLabelText('Keywords')).toBeTruthy();
  });

  it('says so when a file has no text to read out loud', async () => {
    wrap(<ViewerTool />);
    upload([makeFile(await blankPdf(), 'scan.pdf')]);
    await screen.findByText('scan.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Read out loud' }));
    await screen.findByText(/no built-in voice|no text to read/);
  });
});

describe('Inspect a file', () => {
  it('shows facts about the file and one canvas per page', async () => {
    const { InspectTool } = await import('./Inspect');
    wrap(<InspectTool />);
    upload([makeFile(await textPdf(), 'two.pdf')]);
    await waitFor(() => expect(screen.getAllByTestId('inspect-canvas')).toHaveLength(2));
    await waitFor(() => expect(screen.getByText(/Real text/)).toBeTruthy());
    expect(screen.getByText(/Custom size/)).toBeTruthy();
    expect(screen.getByTestId('inspect-current').textContent).toContain('1 / 2');
  });

  it('calls a file with no text a scan', async () => {
    const { InspectTool } = await import('./Inspect');
    const doc = await PDFDocument.create();
    doc.addPage([595.28, 841.89]);
    wrap(<InspectTool />);
    upload([makeFile(await doc.save(), 'blank.pdf')]);
    await waitFor(() => expect(screen.getByText(/Scanned images only/)).toBeTruthy());
    expect(screen.getByText(/A4/)).toBeTruthy();
  });
});

describe('Open in another tool', () => {
  it('a handed-over file opens in the next tool without being dropped there', async () => {
    const { holdFile, clearHeld } = await import('../lib/handoff');
    holdFile(makeFile(await textPdf(), 'handed.pdf'));
    wrap(<ViewerTool />);
    await screen.findByText('handed.pdf');
    await waitFor(() => expect(screen.getAllByTestId('viewer-canvas').length).toBeGreaterThanOrEqual(1));
    clearHeld();
  });

  it('offers the other tools from the browse page', async () => {
    const { InspectTool } = await import('./Inspect');
    wrap(<InspectTool />);
    upload([makeFile(await textPdf(), 'two.pdf')]);
    await screen.findByText('Open this file in another tool');
    expect(btn('Print')).toBeTruthy();
    expect(btn('View & find')).toBeTruthy();
  });
});
