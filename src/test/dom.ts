import { File as NodeFile } from 'node:buffer';
import { fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

/** pdf.js running in Node instead of a browser (use inside vi.mock('pdfjs-dist', ...)). */
export async function legacyPdfjs() {
  return { ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), GlobalWorkerOptions: {} };
}

export function makeFile(bytes: Uint8Array | string, name: string, type = 'application/pdf'): File {
  return new NodeFile([bytes as never], name, { type }) as unknown as File;
}

export function upload(files: File[], index = 0) {
  const inputs = document.querySelectorAll('input[type="file"]');
  fireEvent.change(inputs[index] as HTMLInputElement, { target: { files } });
}

/** jsdom has no canvas: the page viewer then simply skips drawing. Also stubs object URLs. */
export function stubBrowserBits() {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:test-${++n}`);
  URL.revokeObjectURL = vi.fn();
}

/** Waits until the page viewer has measured the page, then returns the pointer layer. */
export async function stageLayer(): Promise<HTMLElement> {
  const { waitFor, screen } = await import('@testing-library/react');
  let layer!: HTMLElement;
  await waitFor(() => {
    layer = screen.getByTestId('stage-layer');
    if (!(layer.parentElement as HTMLElement).style.width) throw new Error('page not measured yet');
  });
  return layer;
}

/** Drags on the page layer between two points given in CSS pixels. */
export function drag(layer: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(layer, { clientX: from[0], clientY: from[1], pointerId: 1 });
  fireEvent.pointerMove(layer, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(layer, { clientX: to[0], clientY: to[1], pointerId: 1 });
}

export function click(layer: HTMLElement, at: [number, number]) {
  fireEvent.pointerDown(layer, { clientX: at[0], clientY: at[1], pointerId: 1 });
  fireEvent.pointerUp(layer, { clientX: at[0], clientY: at[1], pointerId: 1 });
}
