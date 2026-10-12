import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { initNodeEnv } from '../test/node';
import { click, drag, makeFile, stageLayer, stubBrowserBits, upload } from '../test/dom';
import { listFormFields } from '../lib/ops/fill';
import { CommentTool } from './Comment';
import { CompareTool } from './Compare';
import { FillSignTool } from './FillSign';
import { FormTool } from './Form';
import { MeasureTool } from './Measure';
import { OcrTool } from './Ocr';
import { RedactTool } from './Redact';

vi.mock('pdfjs-dist', async () => (await import('../test/dom')).legacyPdfjs());

const downloads: { bytes: Uint8Array; name: string }[] = [];
vi.mock('../lib/pdf', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/pdf')>();
  return { ...orig, downloadBytes: (bytes: Uint8Array, name: string) => downloads.push({ bytes, name }) };
});

vi.mock('../lib/ops/ocr', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/ops/ocr')>();
  return {
    ...orig,
    createOcrEngine: async () => ({
      recognize: async () => ({
        text: 'مرحبا Hello',
        words: [
          { text: 'Hello', x0: 100, y0: 100, x1: 300, y1: 160, confidence: 95 },
          { text: 'مرحبا', x0: 400, y0: 100, x1: 600, y1: 160, confidence: 90 },
        ],
      }),
      terminate: async () => undefined,
    }),
  };
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
const tmp = () => mkdtempSync(join(tmpdir(), 'sc-'));
const Z = 1.25; // default zoom: CSS px per PDF point

/** 400x300 page: "Hello secret world" at (50,200) and a second page. */
async function textPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([400, 300]).drawText('Hello secret world', { x: 50, y: 200, size: 20, font });
  doc.addPage([400, 300]).drawText('Second page', { x: 50, y: 200, size: 20, font });
  return doc.save();
}
/** pdf point -> pixel on the (400x300) page */
const px = (x: number, y: number): [number, number] => [x * Z, (300 - y) * Z];

describe('Comment & highlight', () => {
  it('highlights dragged text and saves a real annotation', async () => {
    wrap(<CommentTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    const layer = await stageLayer();
    drag(layer, px(45, 225), px(300, 190));
    await screen.findByText(/Highlight · Page 1/);
    fireEvent.click(btn('Save and download'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe('doc-commented.pdf');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const d = await pdfjs.getDocument({ data: downloads[0].bytes.slice() }).promise;
    const annots = await (await d.getPage(1)).getAnnotations();
    expect(annots.map((a: { subtype: string }) => a.subtype)).toEqual(['Highlight']);
    // the highlight hugs the text line, not the whole dragged box
    const [x0, y0, x1, y1] = annots[0].rect as number[];
    expect(x0).toBeGreaterThanOrEqual(49);
    expect(y1 - y0).toBeLessThan(30);
    expect(x1).toBeGreaterThan(150);
  });

  it('adds a note with text', async () => {
    wrap(<CommentTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    const layer = await stageLayer();
    fireEvent.click(btn('Note'));
    click(layer, px(300, 280));
    fireEvent.change(await screen.findByLabelText('Comment text'), { target: { value: 'راجع ده' } });
    fireEvent.click(btn('Save and download'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const d = await pdfjs.getDocument({ data: downloads[0].bytes.slice() }).promise;
    const annots = await (await d.getPage(1)).getAnnotations();
    expect(annots[0].subtype).toBe('Text');
    expect(annots[0].contentsObj.str).toBe('راجع ده');
  });
});

describe('Redact', () => {
  it('finds text on every page, needs confirmation, and removes it from the file', async () => {
    wrap(<RedactTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    await stageLayer();
    fireEvent.change(screen.getByLabelText('Find text to remove'), { target: { value: 'secret' } });
    fireEvent.click(btn('Find'));
    await screen.findByText(/1 matches added/);
    expect((btn('Redact and download') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/I understand/));
    fireEvent.click(btn('Redact and download'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const f = join(tmp(), 'r.pdf');
    writeFileSync(f, downloads[0].bytes);
    expect(execFileSync('pdftotext', ['-f', '1', '-l', '1', f, '-']).toString()).not.toContain('secret');
    expect(execFileSync('pdftotext', ['-f', '2', '-l', '2', f, '-']).toString()).toContain('Second page');
  });

  it('draws a box by dragging', async () => {
    wrap(<RedactTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    const layer = await stageLayer();
    drag(layer, px(45, 225), px(300, 190));
    await screen.findByText('Boxes (1)');
  });
});

describe('Measure', () => {
  it('measures a distance at real size and recalibrates', async () => {
    wrap(<MeasureTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    const layer = await stageLayer();
    drag(layer, px(0, 150), px(72, 150)); // 72 pt = 1 inch = 2.54 cm
    await waitFor(() => expect(screen.getAllByText('2.54 cm').length).toBeGreaterThan(0));
    // calibrate: this 72 pt line is really 10 m
    fireEvent.click(btn('Set scale'));
    drag(layer, px(0, 100), px(72, 100));
    fireEvent.change(await screen.findByLabelText(/Real length of the line/), { target: { value: '10' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Set scale' }).pop() as HTMLElement);
    await screen.findByText('Custom scale in use.');
    drag(layer, px(0, 50), px(144, 50));
    await waitFor(() => expect(screen.getAllByText('20 cm').length).toBeGreaterThan(0));
  });

  it('measures an area from clicked corners', async () => {
    wrap(<MeasureTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    const layer = await stageLayer();
    fireEvent.click(btn('Area'));
    for (const p of [[0, 0], [72, 0], [72, 72], [0, 72]] as [number, number][]) click(layer, px(p[0], p[1]));
    fireEvent.click(btn('Finish'));
    await waitFor(() => expect(screen.getAllByText(/6\.452 cm²/).length).toBeGreaterThan(0));
  });
});

describe('Prepare form', () => {
  it('draws a text field, a checkbox and saves a fillable PDF', async () => {
    wrap(<FormTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    const layer = await stageLayer();
    drag(layer, px(50, 120), px(250, 90));
    await screen.findByText('Fields (1)');
    fireEvent.click(btn(/Checkbox/));
    click(layer, px(300, 60));
    await screen.findByText('Fields (2)');
    fireEvent.click(btn('Save and download'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const fields = await listFormFields(downloads[0].bytes);
    expect(fields.map((f) => [f.name, f.kind])).toEqual([['text_1', 'text'], ['checkbox_1', 'checkbox']]);
  });

  it('refuses duplicate field names', async () => {
    wrap(<FormTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    const layer = await stageLayer();
    drag(layer, px(50, 120), px(250, 90));
    drag(layer, px(50, 60), px(250, 30));
    await screen.findByText('Fields (2)');
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'text_1' } });
    await screen.findByText(/needs its own name/);
    expect((btn('Save and download') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Fill & sign', () => {
  it('places typed text and a check mark', async () => {
    wrap(<FillSignTool />);
    upload([makeFile(await textPdf(), 'doc.pdf')]);
    const layer = await stageLayer();
    click(layer, px(50, 100));
    fireEvent.change(await screen.findByLabelText('Text', { selector: 'input' }), { target: { value: 'Ahmed Aldary' } });
    fireEvent.click(btn('Check mark'));
    click(layer, px(300, 100));
    fireEvent.click(btn('Save and download'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const f = join(tmp(), 'f.pdf');
    writeFileSync(f, downloads[0].bytes);
    expect(execFileSync('pdftotext', ['-f', '1', '-l', '1', f, '-']).toString()).toContain('Ahmed Aldary');
  });

  it('fills existing form fields and keeps Arabic readable', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 300]);
    doc.getForm().createTextField('name').addToPage(page, { x: 50, y: 200, width: 200, height: 24 });
    wrap(<FillSignTool />);
    upload([makeFile(await doc.save(), 'form.pdf')]);
    fireEvent.change(await screen.findByLabelText(/^name/), { target: { value: 'أحمد الديري' } });
    fireEvent.click(btn('Save and download'));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const f = join(tmp(), 'a.pdf');
    writeFileSync(f, downloads[0].bytes);
    expect(execFileSync('pdftotext', [f, '-']).toString()).toContain('أحمد الديري');
  });
});

describe('OCR', () => {
  it('recognizes text and returns a searchable PDF plus the text', async () => {
    wrap(<OcrTool />);
    upload([makeFile(await textPdf(), 'scan.pdf')]);
    await screen.findByText('scan.pdf');
    fireEvent.click(btn('Recognize text'));
    await screen.findByText(/words recognized/);
    expect((screen.getByLabelText('Recognized text') as HTMLTextAreaElement).value).toContain('Hello');
    fireEvent.click(btn('Download searchable PDF'));
    expect(downloads[0].name).toBe('scan-searchable.pdf');
    const f = join(tmp(), 'o.pdf');
    writeFileSync(f, downloads[0].bytes);
    const txt = execFileSync('pdftotext', [f, '-']).toString();
    expect(txt).toContain('Hello');
    expect(txt).toContain('مرحبا');
  });
});

describe('Compare', () => {
  it('shows what changed between two versions', async () => {
    const make = async (word: string) => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      doc.addPage([400, 300]).drawText(`Total ${word} KWD`, { x: 50, y: 200, size: 20, font });
      return doc.save();
    };
    wrap(<CompareTool />);
    expect(screen.getByText(/Add the old and the new version/)).toBeTruthy();
    upload([makeFile(await make('100'), 'old.pdf')], 0);
    await screen.findByText('old.pdf');
    upload([makeFile(await make('250'), 'new.pdf')], 0);
    await screen.findByText('new.pdf');
    await screen.findByText(/pages changed/);
    const ins = document.querySelector('.diff ins');
    const del = document.querySelector('.diff del');
    expect(ins?.textContent).toBe('250');
    expect(del?.textContent).toBe('100');
  });
});
