// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument, PDFTextField, TextAlignment } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import { addFormFields } from './formbuild';
import { fillPdf, listFormFields } from './fill';

vi.mock('pdfjs-dist', async () => ({ ...(await import('pdfjs-dist/legacy/build/pdf.mjs')), GlobalWorkerOptions: {} }));
const dir = mkdtempSync(join(tmpdir(), 'sc-'));

async function blank(rotate = 0) {
  const doc = await PDFDocument.create();
  const p = doc.addPage([400, 300]);
  if (rotate) p.setRotation({ type: 'degrees', angle: rotate } as never);
  doc.addPage([400, 300]);
  return doc.save();
}

describe('addFormFields', () => {
  it('creates every field type and they can be filled afterwards', async () => {
    const out = await addFormFields(await blank(), [
      { kind: 'text', name: 'email', page: 0, rect: { x: 50, y: 240, width: 200, height: 24 }, required: true, tooltip: 'Your email' },
      { kind: 'multiline', name: 'notes', page: 0, rect: { x: 50, y: 150, width: 200, height: 70 } },
      { kind: 'checkbox', name: 'agree', page: 0, rect: { x: 50, y: 110, width: 18, height: 18 } },
      { kind: 'dropdown', name: 'city', page: 1, rect: { x: 50, y: 240, width: 120, height: 22 }, options: ['Kuwait City', 'Cairo'] },
      { kind: 'radio', name: 'plan', page: 1, rect: { x: 50, y: 200, width: 16, height: 16 }, options: ['free'] },
      { kind: 'radio', name: 'plan', page: 1, rect: { x: 50, y: 170, width: 16, height: 16 }, options: ['pro'] },
      { kind: 'list', name: 'langs', page: 1, rect: { x: 200, y: 150, width: 100, height: 60 }, options: ['Arabic', 'English', 'French'] },
    ]);
    const f = join(dir, 'form.pdf');
    writeFileSync(f, out);
    expect(execFileSync('qpdf', ['--check', f]).toString()).toContain('No syntax or stream encoding errors');
    const fields = await listFormFields(out);
    expect(fields.map((x) => [x.name, x.kind, x.page])).toEqual([
      ['email', 'text', 0],
      ['notes', 'text', 0],
      ['agree', 'checkbox', 0],
      ['city', 'dropdown', 1],
      ['plan', 'radio', 1],
      ['langs', 'list', 1],
    ]);
    expect(fields.find((x) => x.name === 'plan')?.options).toEqual(['free', 'pro']);
    expect(fields.find((x) => x.name === 'notes')?.multiline).toBe(true);

    // another reader (pdf.js) sees them as form widgets with the right types
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: out.slice() }).promise;
    const widgets = (await (await doc.getPage(1)).getAnnotations()).filter((a: { subtype: string }) => a.subtype === 'Widget');
    expect(widgets.map((w: { fieldType: string }) => w.fieldType).sort()).toEqual(['Btn', 'Tx', 'Tx']);
    expect(widgets.find((w: { fieldName: string }) => w.fieldName === 'email').required).toBe(true);

    // and it is a usable form: fill it with our own filler
    const filled = await fillPdf(out, { values: { email: 'a@b.co', plan: 'pro', city: 'Cairo' } });
    const after = await listFormFields(filled);
    expect(after.find((x) => x.name === 'plan')?.value).toBe('pro');
    expect(after.find((x) => x.name === 'city')?.value).toBe('Cairo');
  });

  it('leaves the page looking as it did: no frame and no fill around a text field', async () => {
    const out = await addFormFields(await blank(), [{ kind: 'text', name: 'a', page: 0, rect: { x: 50, y: 100, width: 200, height: 40 } }]);
    const f = join(dir, 'box.pdf');
    writeFileSync(f, out);
    execFileSync('pdftoppm', ['-r', '72', '-png', '-f', '1', '-l', '1', f, join(dir, 'box')]);
    // page y 100..140 -> image y 160..200: the inside and the edge of the field stay white
    for (const at of ['p{150,180}', 'p{50,180}', 'p{150,160}']) {
      const px = execFileSync('convert', [join(dir, 'box-1.png'), '-format', `%[pixel:${at}]`, 'info:']).toString();
      expect(px).toMatch(/white|srgb\(255,255,255\)/);
    }
  });

  it('rejects duplicate names, empty names and option lists without options', async () => {
    const base = await blank();
    await expect(
      addFormFields(base, [
        { kind: 'text', name: 'x', page: 0, rect: { x: 1, y: 1, width: 50, height: 20 } },
        { kind: 'text', name: 'x', page: 0, rect: { x: 1, y: 40, width: 50, height: 20 } },
      ]),
    ).rejects.toThrow(/already exists/);
    await expect(addFormFields(base, [{ kind: 'text', name: ' ', page: 0, rect: { x: 1, y: 1, width: 50, height: 20 } }])).rejects.toThrow();
    await expect(addFormFields(base, [{ kind: 'dropdown', name: 'd', page: 0, rect: { x: 1, y: 1, width: 50, height: 20 }, options: [] }])).rejects.toThrow(/option/);
    const withField = await addFormFields(base, [{ kind: 'text', name: 'dup', page: 0, rect: { x: 1, y: 1, width: 50, height: 20 } }]);
    await expect(addFormFields(withField, [{ kind: 'text', name: 'dup', page: 0, rect: { x: 1, y: 1, width: 50, height: 20 } }])).rejects.toThrow(/already exists/);
  });

  it('sets where typing starts in a text field: right for Arabic, or centred', async () => {
    const out = await addFormFields(await blank(), [
      { kind: 'text', name: 'a', page: 0, rect: { x: 50, y: 240, width: 200, height: 24 }, align: 'right' },
      { kind: 'multiline', name: 'b', page: 0, rect: { x: 50, y: 200, width: 200, height: 24 }, align: 'center' },
      { kind: 'text', name: 'c', page: 0, rect: { x: 50, y: 160, width: 200, height: 24 } },
    ]);
    const form = (await PDFDocument.load(out)).getForm();
    expect(form.getTextField('a').getAlignment()).toBe(TextAlignment.Right);
    expect(form.getTextField('b').getAlignment()).toBe(TextAlignment.Center);
    expect(form.getField('c') instanceof PDFTextField).toBe(true);
    expect(form.getTextField('c').getAlignment()).toBe(TextAlignment.Left);
  });
});

import { PDFDocument as PD, PDFName as PN } from 'pdf-lib';
import { addFormFields as add2 } from './formbuild';
describe('no border colour', () => {
  it('writes no /BC so viewers draw no black frame', async () => {
    const d = await PD.create();
    d.addPage([200, 200]);
    const out = await add2(await d.save(), [{ kind: 'text', name: 'a', page: 0, rect: { x: 10, y: 10, width: 80, height: 20 } }]);
    const f = (await PD.load(out)).getForm().getTextField('a');
    const mk = f.acroField.getWidgets()[0].dict.get(PN.of('MK'));
    expect(String(mk ?? '')).not.toContain('/BC');
  });
});
