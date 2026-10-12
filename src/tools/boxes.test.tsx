import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { initNodeEnv } from '../test/node';
import { drag, makeFile, stageLayer, stubBrowserBits, upload } from '../test/dom';
import { FormTool } from './Form';

vi.mock('pdfjs-dist', async () => (await import('../test/dom')).legacyPdfjs());

beforeAll(() => {
  initNodeEnv();
  stubBrowserBits();
});
beforeEach(() => localStorage.setItem('shootcut:lang', 'en'));
afterEach(cleanup);

const px = (x: number, y: number): [number, number] => [x * 1.25, (300 - y) * 1.25];

describe('Boxes can be resized', () => {
  it('changes the width and height of a form field by typing, by dragging a handle and with the keyboard', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 300]);
    render(<I18nProvider><FormTool /></I18nProvider>);
    upload([makeFile(await doc.save(), 'blank.pdf')]);
    const layer = await stageLayer();
    drag(layer, px(50, 250), px(150, 220));
    const box = await screen.findByTestId('editable-box');
    const width = () => screen.getByLabelText(/^Width/) as HTMLInputElement;
    const height = () => screen.getByLabelText(/^Height/) as HTMLInputElement;
    await waitFor(() => expect(Number(width().value)).toBeGreaterThan(90));
    const w0 = Number(width().value);

    fireEvent.change(width(), { target: { value: '200' } });
    await waitFor(() => expect(Number(width().value)).toBe(200));
    fireEvent.change(height(), { target: { value: '40' } });
    await waitFor(() => expect(Number(height().value)).toBe(40));
    expect(w0).not.toBe(200);

    // keyboard: Ctrl+Arrow grows the box by 1 point (Shift: 10)
    fireEvent.keyDown(box, { key: 'ArrowRight', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(Number(width().value)).toBeGreaterThan(205));
    fireEvent.keyDown(box, { key: 'ArrowDown', ctrlKey: true });
    await waitFor(() => expect(Number(height().value)).toBeGreaterThan(40));

    // eight handles appear on the selected box
    expect(document.querySelectorAll('.grip')).toHaveLength(8);
    const before = Number(width().value);
    const grip = document.querySelector('[data-grip="e"]') as HTMLElement;
    fireEvent.pointerDown(grip, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 140, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(grip, { clientX: 140, clientY: 100, pointerId: 1 });
    await waitFor(() => expect(Number(width().value)).toBeGreaterThan(before + 20));

    // Delete removes the box
    fireEvent.keyDown(screen.getByTestId('editable-box'), { key: 'Delete' });
    await waitFor(() => expect(screen.queryByTestId('editable-box')).toBeNull());
  });
});
