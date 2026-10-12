import { File as NodeFile } from 'node:buffer';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { MergeTool } from './Merge';
import { OrganizeTool } from './Organize';

vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));

const downloads: { bytes: Uint8Array; name: string }[] = [];
vi.mock('../lib/pdf', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/pdf')>();
  return {
    ...orig,
    downloadBytes: (bytes: Uint8Array, name: string) => downloads.push({ bytes, name }),
    openPreview: async () => ({
      numPages: 3,
      render: async () => 'data:image/jpeg;base64,AAAA',
      destroy: () => {},
    }),
  };
});

/** Builds a PDF whose pages have the given widths, so page identity is checkable. */
async function makePdf(widths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  widths.forEach((w) => doc.addPage([w, 400]));
  return doc.save();
}

function pdfFile(bytes: Uint8Array, name: string) {
  return new NodeFile([bytes as never], name, { type: 'application/pdf' }) as unknown as File;
}

function upload(files: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

function renderTool(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  downloads.length = 0;
  localStorage.setItem('shootcut:lang', 'en');
});
afterEach(cleanup);

describe('MergeTool', () => {
  it('merges two PDFs in the chosen order', async () => {
    renderTool(<MergeTool />);
    upload([pdfFile(await makePdf([101, 102]), 'a.pdf'), pdfFile(await makePdf([201, 202, 203]), 'b.pdf')]);
    await screen.findByText('b.pdf');

    // swap the order: move the second file up
    const moveUp = screen.getAllByRole('button', { name: 'Move up' });
    fireEvent.click(moveUp[1]);

    fireEvent.click(screen.getByRole('button', { name: 'Merge and download' }));
    await waitFor(() => expect(downloads).toHaveLength(1));

    const out = await PDFDocument.load(downloads[0].bytes);
    expect(downloads[0].name).toBe('merged.pdf');
    expect(out.getPages().map((p) => p.getWidth())).toEqual([201, 202, 203, 101, 102]);
  });

  it('keeps merge disabled until two files are added', async () => {
    renderTool(<MergeTool />);
    upload([pdfFile(await makePdf([100]), 'only.pdf')]);
    await screen.findByText('only.pdf');
    expect((screen.getByRole('button', { name: 'Merge and download' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports a damaged file without crashing and still adds the valid one', async () => {
    renderTool(<MergeTool />);
    const bad = pdfFile(new TextEncoder().encode('this is not a pdf'), 'bad.pdf');
    upload([bad, pdfFile(await makePdf([100]), 'good.pdf')]);
    await screen.findByText('good.pdf');
    expect(screen.getByRole('alert').textContent).toContain('bad.pdf');
  });

  it('merges a picture with a PDF into one PDF, the picture as its own page', async () => {
    renderTool(<MergeTool />);
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    upload([pdfFile(await makePdf([301, 302]), 'a.pdf'), new NodeFile([png], 'photo.png', { type: 'image/png' }) as unknown as File]);
    await screen.findByText('photo.png');
    fireEvent.click(screen.getByRole('button', { name: 'Merge and download' }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const out = await PDFDocument.load(downloads[0].bytes);
    expect(out.getPageCount()).toBe(3);
    expect(out.getPages().map((p) => Math.round(p.getWidth()))).toEqual([301, 302, 1]);
  });

  it('rejects non-PDF files', async () => {
    renderTool(<MergeTool />);
    const txt = new NodeFile(['hi'], 'notes.txt', { type: 'text/plain' }) as unknown as File;
    upload([txt]);
    expect((await screen.findByRole('alert')).textContent).toMatch(/PDF/);
  });
});

describe('OrganizeTool', () => {
  it('deletes, rotates and reorders pages', async () => {
    renderTool(<OrganizeTool />);
    upload([pdfFile(await makePdf([101, 102, 103]), 'doc.pdf')]);
    await screen.findByText('Page 3');

    const items = () => screen.getAllByRole('listitem');
    // delete page 2 (source width 102)
    fireEvent.click(within(items()[1]).getByRole('button', { name: 'Remove' }));
    // rotate page 1 to the right
    fireEvent.click(within(items()[0]).getByRole('button', { name: 'Rotate right' }));
    // move page 1 later: order becomes 102(deleted), 101, 103
    fireEvent.click(within(items()[0]).getByRole('button', { name: 'Move later' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save and download' }));
    await waitFor(() => expect(downloads).toHaveLength(1));

    const out = await PDFDocument.load(downloads[0].bytes);
    expect(downloads[0].name).toBe('doc-organized.pdf');
    expect(out.getPages().map((p) => [p.getWidth(), p.getRotation().angle])).toEqual([
      [101, 90],
      [103, 0],
    ]);
  });

  it('blocks saving when every page is deleted', async () => {
    renderTool(<OrganizeTool />);
    upload([pdfFile(await makePdf([100, 100]), 'x.pdf')]);
    await screen.findByText('Page 2');
    screen.getAllByRole('button', { name: 'Remove' }).forEach((b) => fireEvent.click(b));
    expect((screen.getByRole('button', { name: 'Save and download' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
