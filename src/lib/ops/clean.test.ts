// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { auditPdf, cleanPdf, CLEAN_ALL } from './clean';

async function dirty() {
  const d = await PDFDocument.create({ updateMetadata: false });
  d.setTitle('Secret plan');
  d.setAuthor('Ahmed');
  const page = d.addPage([300, 300]);
  const ctx = d.context;
  await d.attach(new Uint8Array([1, 2, 3]), 'notes.txt', { mimeType: 'text/plain' });
  const js = ctx.obj({ S: 'JavaScript', JS: PDFString.of('app.alert(1)') });
  d.catalog.set(PDFName.of('OpenAction'), js);
  const note = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [10, 10, 30, 30], Contents: PDFString.of('private note') }));
  const link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 40, 90, 60], A: { S: 'URI', URI: PDFString.of('https://x.test') } }));
  page.node.set(PDFName.of('Annots'), ctx.obj([note, link]));
  page.node.set(PDFName.of('Thumb'), ctx.obj({}));
  return d.save();
}

describe('audit and clean', () => {
  it('sees what is hidden in a file', async () => {
    const a = await auditPdf(await dirty());
    expect(a.info).toEqual(expect.arrayContaining(['Title', 'Author']));
    expect(a.javascript).toBe(true);
    expect(a.attachments).toBe(1);
    expect(a.comments).toBe(1);
    expect(a.links).toBe(1);
    expect(a.thumbnails).toBe(1);
  });

  it('removes the chosen kinds and leaves the rest', async () => {
    const out = await cleanPdf(await dirty(), CLEAN_ALL);
    const a = await auditPdf(out);
    expect(a.info).toEqual([]);
    expect(a.javascript).toBe(false);
    expect(a.attachments).toBe(0);
    expect(a.comments).toBe(0);
    expect(a.thumbnails).toBe(0);
    expect(a.links).toBe(1); // links are kept unless asked
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
    // the removed things are gone from the file itself, not only unlinked
    const left = (await PDFDocument.load(out, { updateMetadata: false })).context.enumerateIndirectObjects().map(([, o]) => {
      const d = (o as { dict?: PDFDict }).dict ?? (o instanceof PDFDict ? o : null);
      return d ? `${d.get(PDFName.of('Type'))} ${d.get(PDFName.of('Subtype'))} ${d.get(PDFName.of('Contents'))}` : '';
    });
    expect(left.some((x) => x.includes('EmbeddedFile') || x.includes('private note') || x.includes('Text'))).toBe(false);
  });

  it('can remove links too, and keeps everything when nothing is chosen', async () => {
    const none = await cleanPdf(await dirty(), { info: false, javascript: false, attachments: false, comments: false, links: false, bookmarks: false, thumbnails: false, privateData: false });
    const a = await auditPdf(none);
    expect(a.comments).toBe(1);
    expect(a.attachments).toBe(1);
    const noLinks = await cleanPdf(await dirty(), { ...CLEAN_ALL, links: true });
    expect((await auditPdf(noLinks)).links).toBe(0);
  });
});
void PDFDict;
