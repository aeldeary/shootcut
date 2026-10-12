import { PDFArray, PDFBool, PDFDict, PDFDocument, PDFName, PDFRef, PDFString, PDFHexString, type PDFObject } from 'pdf-lib';

export type CheckId = 'title' | 'language' | 'tagged' | 'text' | 'figures' | 'bookmarks' | 'fields';
export type CheckState = 'pass' | 'fail' | 'unknown';
export interface Check {
  id: CheckId;
  state: CheckState;
  /** a number to show next to the result (figures without a description, fields without a tooltip) */
  count?: number;
  /** the tool can repair this one by itself */
  fixable: boolean;
}

const text = (o: PDFObject | undefined): string => {
  if (o instanceof PDFString || o instanceof PDFHexString) return o.decodeText().trim();
  return '';
};

function lookupDict(doc: PDFDocument, o: PDFObject | undefined): PDFDict | undefined {
  const v = o instanceof PDFRef ? doc.context.lookup(o) : o;
  return v instanceof PDFDict ? v : undefined;
}

/** Figures in the structure tree that have neither alternate text nor actual text. */
function figuresWithoutText(doc: PDFDocument, root: PDFDict): { figures: number; missing: number } {
  let figures = 0;
  let missing = 0;
  const seen = new Set<string>();
  const stack: PDFObject[] = [root.get(PDFName.of('K')) as PDFObject].filter(Boolean);
  let budget = 50000;
  while (stack.length && budget-- > 0) {
    const o = stack.pop()!;
    if (o instanceof PDFRef) {
      if (seen.has(o.tag)) continue;
      seen.add(o.tag);
    }
    const v = o instanceof PDFRef ? doc.context.lookup(o) : o;
    if (v instanceof PDFArray) {
      for (let i = 0; i < v.size(); i++) stack.push(v.get(i));
    } else if (v instanceof PDFDict) {
      const s = v.get(PDFName.of('S'));
      if (s === PDFName.of('Figure')) {
        figures++;
        if (!text(v.lookup(PDFName.of('Alt'))) && !text(v.lookup(PDFName.of('ActualText')))) missing++;
      }
      const k = v.get(PDFName.of('K'));
      if (k) stack.push(k);
    }
  }
  return { figures, missing };
}

/**
 * Checks what can be checked without a person: title, language, tags, text, figure descriptions, bookmarks,
 * field tooltips. `hasText` comes from reading the pages (a scan has none). Colour contrast and reading order
 * need a human, so they are not claimed here.
 */
export async function checkAccessibility(bytes: Uint8Array, hasText: boolean | null): Promise<Check[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const cat = doc.catalog;
  const info = lookupDict(doc, doc.context.trailerInfo.Info);
  const prefs = lookupDict(doc, cat.get(PDFName.of('ViewerPreferences')));
  const hasTitle = !!text(info?.get(PDFName.of('Title')));
  const display = prefs?.get(PDFName.of('DisplayDocTitle')) === PDFBool.True;
  const lang = text(cat.get(PDFName.of('Lang')));
  const mark = lookupDict(doc, cat.get(PDFName.of('MarkInfo')));
  const root = lookupDict(doc, cat.get(PDFName.of('StructTreeRoot')));
  const tagged = mark?.get(PDFName.of('Marked')) === PDFBool.True && !!root;

  const checks: Check[] = [
    { id: 'title', state: hasTitle && display ? 'pass' : 'fail', fixable: true },
    { id: 'language', state: lang ? 'pass' : 'fail', fixable: true },
    { id: 'tagged', state: tagged ? 'pass' : 'fail', fixable: false },
    { id: 'text', state: hasText === null ? 'unknown' : hasText ? 'pass' : 'fail', fixable: false },
  ];
  if (root) {
    const f = figuresWithoutText(doc, root);
    checks.push({ id: 'figures', state: f.missing === 0 ? 'pass' : 'fail', count: f.missing, fixable: false });
  } else checks.push({ id: 'figures', state: 'unknown', fixable: false });

  checks.push({ id: 'bookmarks', state: doc.getPageCount() <= 20 || cat.has(PDFName.of('Outlines')) ? 'pass' : 'fail', fixable: false });

  let withoutTip = 0;
  let fields = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (!(annots instanceof PDFArray)) continue;
    for (let i = 0; i < annots.size(); i++) {
      const a = lookupDict(doc, annots.get(i));
      if (a?.get(PDFName.of('Subtype')) !== PDFName.of('Widget')) continue;
      fields++;
      const tip = text(a.get(PDFName.of('TU'))) || text(lookupDict(doc, a.get(PDFName.of('Parent')))?.get(PDFName.of('TU')));
      if (!tip) withoutTip++;
    }
  }
  if (fields > 0) checks.push({ id: 'fields', state: withoutTip === 0 ? 'pass' : 'fail', count: withoutTip, fixable: false });
  return checks;
}

/** Sets what can be set safely: the title (shown in the window bar) and the document language. */
export async function fixAccessibility(bytes: Uint8Array, o: { title?: string; lang?: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  if (o.title?.trim()) {
    doc.setTitle(o.title.trim(), { showInWindowTitleBar: true });
  } else if (text(lookupDict(doc, doc.context.trailerInfo.Info)?.get(PDFName.of('Title')))) {
    doc.setTitle(doc.getTitle() ?? '', { showInWindowTitleBar: true });
  }
  if (o.lang?.trim()) doc.catalog.set(PDFName.of('Lang'), PDFString.of(o.lang.trim()));
  return doc.save();
}
