// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initNodeEnv } from '../../test/node';
import { openPreview } from '../pdf';
import { createPdf } from './create';
import { addTextLayer, createOcrEngine, recognizePages } from './ocr';

vi.mock('pdfjs-dist', async () => ({ ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), GlobalWorkerOptions: {} }));
beforeAll(initNodeEnv);
const dir = mkdtempSync(join(tmpdir(), 'sc-'));
const root = process.cwd();

async function scan() {
  GlobalFonts.registerFromPath(join(root, 'node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff'), 'PlexAr');
  GlobalFonts.registerFromPath(join(root, 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff'), 'InterX');
  const c = createCanvas(1400, 500);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1400, 500);
  ctx.fillStyle = '#000';
  ctx.font = '56px InterX';
  ctx.fillText('Invoice total: 1250 KWD', 60, 100);
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.font = '64px PlexAr';
  ctx.fillText('مرحبا بكم في شركة الديري للتسويق', 1340, 240);
  return new Uint8Array(await c.encode('png'));
}

describe('OCR (Arabic + English, engine running locally)', () => {
  it('turns a scanned image into a PDF whose text can be searched and copied', async () => {
    const pdf = await createPdf({ images: [{ bytes: await scan(), mime: 'image/png' }], pageSize: 'fit' });
    const preview = await openPreview(pdf);
    const engine = await createOcrEngine(['ara', 'eng'], { lang: join(root, 'public/ocr/lang'), core: join(root, 'public/ocr/core') });
    const progress: number[] = [];
    const results = await recognizePages(preview, engine, { pages: [0], dpi: 144, onPage: (d) => progress.push(d) });
    await engine.terminate();
    preview.destroy();
    expect(progress).toEqual([1]);
    expect(results[0].text).toContain('Invoice total');
    expect(results[0].text).toContain('1250');

    const out = await addTextLayer(pdf, results);
    const f = join(dir, 'ocr.pdf');
    writeFileSync(f, out);
    expect(execFileSync('qpdf', ['--check', f]).toString()).toContain('No syntax or stream encoding errors');
    const txt = execFileSync('pdftotext', [f, '-']).toString().replace(/[‪-‮⁦-⁩]/g, '');
    expect(txt).toContain('Invoice');
    expect(txt).toContain('1250');
    expect(txt).toContain('KWD');
    expect(txt).toContain('مرحبا');
    expect(txt).toContain('الديري');
    expect(txt).toContain('للتسويق');

    // the page still shows the scan (image kept, nothing drawn on top)
    expect(execFileSync('pdfimages', ['-list', f]).toString().split('\n').filter((l) => /image/.test(l))).toHaveLength(1);

    // words sit where they are on the page: "Invoice" starts near x=60 (1 px = 1 pt for a fitted page at 72 dpi)
    const bbox = execFileSync('pdftotext', ['-bbox', f, '-']).toString();
    const m = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">Invoice<\/word>/.exec(bbox);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThan(50);
    expect(Number(m![1])).toBeLessThan(80);
    expect(Number(m![2])).toBeLessThan(110);
  }, 120_000);

  it('reads only a selected area, enlarged, and places the words inside it', async () => {
    const pdf = await createPdf({ images: [{ bytes: await scan(), mime: 'image/png' }], pageSize: 'fit' });
    const preview = await openPreview(pdf);
    const engine = await createOcrEngine(['ara', 'eng'], { lang: join(root, 'public/ocr/lang'), core: join(root, 'public/ocr/core') });
    // the Arabic line sits about 240 px from the top of a 500 pt page: PDF y is 180..320 from the bottom
    const results = await recognizePages(preview, engine, { pages: [0], region: { page: 0, rect: { x: 40, y: 170, width: 1320, height: 150 } } });
    await engine.terminate();
    preview.destroy();
    expect(results[0].text).toContain('مرحبا');
    expect(results[0].text).not.toContain('Invoice');
    for (const w of results[0].words) {
      expect(w.ax).toBeGreaterThan(30);
      expect(w.ay).toBeGreaterThan(150);
      expect(w.ay).toBeLessThan(330);
    }
  }, 120_000);
});
