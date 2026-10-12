import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas as napiCanvas, loadImage } from '@napi-rs/canvas';
import { setFontLoader } from '../lib/fonts';
import { setCanvasFactory, setImageDecoder } from '../lib/pdf';

/**
 * Wires the browser-only parts of the app (font download, canvas) to Node equivalents
 * so the real tool code can run against real PDF files in tests.
 * Test files that render PDFs must also mock pdfjs-dist, e.g.:
 *   vi.mock('pdfjs-dist', async () => ({ ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), GlobalWorkerOptions: {} }));
 */
export function initNodeEnv(): void {
  setFontLoader(async (url) => new Uint8Array(readFileSync(join(process.cwd(), url.split('?')[0]))));
  setCanvasFactory((w, h) => napiCanvas(w, h) as never);
  setImageDecoder(async (bytes) => {
    const img = await loadImage(Buffer.from(bytes));
    const canvas = napiCanvas(img.width, img.height);
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas as never;
  });
}
