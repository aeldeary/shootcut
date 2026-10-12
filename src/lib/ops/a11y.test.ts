// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { checkAccessibility, fixAccessibility } from './a11y';

const state = (cs: Awaited<ReturnType<typeof checkAccessibility>>, id: string) => cs.find((c) => c.id === id)?.state;

async function plain(pages = 1) {
  const d = await PDFDocument.create({ updateMetadata: false });
  for (let i = 0; i < pages; i++) d.addPage();
  return d.save();
}

describe('accessibility check', () => {
  it('fails an untitled, untagged file and reports what it cannot know', async () => {
    const c = await checkAccessibility(await plain(), null);
    expect(state(c, 'title')).toBe('fail');
    expect(state(c, 'language')).toBe('fail');
    expect(state(c, 'tagged')).toBe('fail');
    expect(state(c, 'text')).toBe('unknown');
    expect(state(c, 'figures')).toBe('unknown');
    expect(state(c, 'bookmarks')).toBe('pass'); // short file
    expect(c.find((x) => x.id === 'fields')).toBeUndefined();
  });

  it('asks for bookmarks only in long files', async () => {
    expect(state(await checkAccessibility(await plain(25), true), 'bookmarks')).toBe('fail');
  });

  it('fixes the title and the language', async () => {
    const out = await fixAccessibility(await plain(), { title: 'تقرير سنوي', lang: 'ar' });
    const c = await checkAccessibility(out, true);
    expect(state(c, 'title')).toBe('pass');
    expect(state(c, 'language')).toBe('pass');
    expect(state(c, 'text')).toBe('pass');
  });

  it('counts figures that have no description', async () => {
    const d = await PDFDocument.create({ updateMetadata: false });
    d.addPage();
    const ctx = d.context;
    const fig1 = ctx.register(ctx.obj({ Type: 'StructElem', S: 'Figure', Alt: PDFString.of('A chart') }));
    const fig2 = ctx.register(ctx.obj({ Type: 'StructElem', S: 'Figure' }));
    const root = ctx.register(ctx.obj({ Type: 'StructTreeRoot', K: [fig1, fig2] }));
    d.catalog.set(PDFName.of('StructTreeRoot'), root);
    d.catalog.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: true }));
    const c = await checkAccessibility(await d.save(), true);
    expect(state(c, 'tagged')).toBe('pass');
    expect(c.find((x) => x.id === 'figures')).toMatchObject({ state: 'fail', count: 1 });
  });
});
