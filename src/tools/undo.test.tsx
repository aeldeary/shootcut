import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { initNodeEnv } from '../test/node';
import { drag, makeFile, stageLayer, stubBrowserBits, upload } from '../test/dom';
import { MergeTool } from './Merge';
import { PrintTool } from './Print';
import { ProtectTool } from './Protect';
import { RedactTool } from './Redact';

vi.mock('pdfjs-dist', async () => (await import('../test/dom')).legacyPdfjs());

beforeAll(() => {
  initNodeEnv();
  stubBrowserBits();
});
beforeEach(() => localStorage.setItem('shootcut:lang', 'en'));
afterEach(cleanup);

const wrap = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);
const undoBtn = () => screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
const redoBtn = () => screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement;
const px = (x: number, y: number): [number, number] => [x * 1.25, (300 - y) * 1.25];

async function pdfBytes(text = 'Hello') {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 300]).drawText(text, { x: 50, y: 200, size: 20, font });
  return doc.save();
}

describe('Undo and redo', () => {
  it('starts disabled, then undoes and redoes drawing a redaction box with the buttons and the keyboard', async () => {
    wrap(<RedactTool />);
    expect(undoBtn().disabled).toBe(true);
    expect(redoBtn().disabled).toBe(true);
    upload([makeFile(await pdfBytes(), 'doc.pdf')]);
    const layer = await stageLayer();
    expect(undoBtn().disabled).toBe(true); // opening a file is not something to undo
    drag(layer, px(45, 225), px(300, 190));
    await waitFor(() => expect(document.querySelectorAll('.redact-box')).toHaveLength(1));
    await waitFor(() => expect(undoBtn().disabled).toBe(false));

    fireEvent.click(undoBtn());
    await waitFor(() => expect(document.querySelectorAll('.redact-box')).toHaveLength(0));
    expect(redoBtn().disabled).toBe(false);
    fireEvent.click(redoBtn());
    await waitFor(() => expect(document.querySelectorAll('.redact-box')).toHaveLength(1));

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(document.querySelectorAll('.redact-box')).toHaveLength(0));
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    await waitFor(() => expect(document.querySelectorAll('.redact-box')).toHaveLength(1));
    // with the Arabic keyboard layout the key reports another letter, but its position (code) is still Z / Y
    fireEvent.keyDown(window, { key: 'ئ', code: 'KeyZ', ctrlKey: true });
    await waitFor(() => expect(document.querySelectorAll('.redact-box')).toHaveLength(0));
    fireEvent.keyDown(window, { key: 'ؤ', code: 'KeyY', ctrlKey: true });
    await waitFor(() => expect(document.querySelectorAll('.redact-box')).toHaveLength(1));
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(document.querySelectorAll('.redact-box')).toHaveLength(1));
  });

  it('works for a list of files, and leaves typing in text fields to the browser', async () => {
    wrap(<MergeTool />);
    upload([makeFile(await pdfBytes('A'), 'a.pdf')]);
    await screen.findByText('a.pdf');
    await new Promise((r) => setTimeout(r, 500));
    upload([makeFile(await pdfBytes('B'), 'b.pdf')]);
    await screen.findByText('b.pdf');
    fireEvent.click(undoBtn());
    await waitFor(() => expect(screen.queryByText('b.pdf')).toBeNull());
    expect(screen.getByText('a.pdf')).toBeTruthy();
    fireEvent.click(redoBtn());
    await screen.findByText('b.pdf');

    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    expect(screen.getByText('b.pdf')).toBeTruthy(); // not undone: the text field keeps its own undo
    input.remove();
  });

  it('undoes settings such as a checkbox in Protect and a colour mode in Print', async () => {
    wrap(<ProtectTool />);
    upload([makeFile(await pdfBytes(), 'doc.pdf')]);
    await screen.findByText('doc.pdf');
    // the first checkbox is the "keep this file" switch of the file bar
    const box = screen.getAllByRole('checkbox')[1] as HTMLInputElement;
    const before = box.checked;
    fireEvent.click(box);
    expect(box.checked).toBe(!before);
    fireEvent.click(undoBtn());
    await waitFor(() => expect((screen.getAllByRole('checkbox')[1] as HTMLInputElement).checked).toBe(before));
    cleanup();

    wrap(<PrintTool />);
    upload([makeFile(await pdfBytes(), 'doc.pdf')]);
    await screen.findByText('doc.pdf');
    fireEvent.click(screen.getByLabelText(/Black and white/));
    expect((screen.getByLabelText(/Black and white/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(undoBtn());
    await waitFor(() => expect((screen.getByLabelText(/Black and white/) as HTMLInputElement).checked).toBe(false));
  });
});
