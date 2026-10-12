import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, type PDFObject } from 'pdf-lib';

/** What a PDF can carry besides the pages you see. */
export interface Audit {
  /** Info fields that are filled in (title, author, ...) */
  info: string[];
  xmp: boolean;
  javascript: boolean;
  attachments: number;
  /** comments and other markup (everything except links and form fields) */
  comments: number;
  links: number;
  formFields: number;
  bookmarks: boolean;
  thumbnails: number;
  privateData: boolean;
}

export interface CleanOptions {
  info: boolean;
  javascript: boolean;
  attachments: boolean;
  comments: boolean;
  links: boolean;
  bookmarks: boolean;
  thumbnails: boolean;
  privateData: boolean;
}

export const CLEAN_ALL: CleanOptions = { info: true, javascript: true, attachments: true, comments: true, links: false, bookmarks: false, thumbnails: true, privateData: true };

const INFO_KEYS = ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate'];

function dict(doc: PDFDocument, o: PDFObject | undefined): PDFDict | undefined {
  const v = o instanceof PDFRef ? doc.context.lookup(o) : o;
  return v instanceof PDFDict ? v : undefined;
}
function arr(doc: PDFDocument, o: PDFObject | undefined): PDFArray | undefined {
  const v = o instanceof PDFRef ? doc.context.lookup(o) : o;
  return v instanceof PDFArray ? v : undefined;
}
const subtype = (_doc: PDFDocument, a: PDFDict) => (a.lookup(PDFName.of('Subtype')) as { asString?: () => string } | undefined)?.asString?.().replace('/', '');
const isJs = (doc: PDFDocument, action: PDFObject | undefined) => {
  const d = dict(doc, action);
  return d?.get(PDFName.of('S')) === PDFName.of('JavaScript');
};

function annotsOf(doc: PDFDocument, page: PDFDict): PDFArray | undefined {
  return arr(doc, page.get(PDFName.of('Annots')));
}

export async function auditPdf(bytes: Uint8Array): Promise<Audit> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const cat = doc.catalog;
  const info = dict(doc, doc.context.trailerInfo.Info);
  const names = dict(doc, cat.get(PDFName.of('Names')));
  const out: Audit = {
    info: info ? INFO_KEYS.filter((k) => { const v = info.get(PDFName.of(k)); return v !== undefined && String((v as { decodeText?: () => string }).decodeText?.() ?? v).trim() !== ''; }) : [],
    xmp: cat.has(PDFName.of('Metadata')),
    javascript: false,
    attachments: 0,
    comments: 0,
    links: 0,
    formFields: 0,
    bookmarks: cat.has(PDFName.of('Outlines')),
    thumbnails: 0,
    privateData: cat.has(PDFName.of('PieceInfo')),
  };
  out.javascript = !!names?.has(PDFName.of('JavaScript')) || isJs(doc, cat.get(PDFName.of('OpenAction'))) || cat.has(PDFName.of('AA'));
  const files = dict(doc, names?.get(PDFName.of('EmbeddedFiles')));
  const list = arr(doc, files?.get(PDFName.of('Names')));
  out.attachments = list ? Math.floor(list.size() / 2) : 0;
  for (const page of doc.getPages()) {
    const p = page.node;
    if (p.has(PDFName.of('Thumb'))) out.thumbnails++;
    if (p.has(PDFName.of('PieceInfo'))) out.privateData = true;
    if (p.has(PDFName.of('AA'))) out.javascript = true;
    const annots = annotsOf(doc, p);
    for (let i = 0; annots && i < annots.size(); i++) {
      const a = dict(doc, annots.get(i));
      if (!a) continue;
      const st = subtype(doc, a);
      if (st === 'Link') {
        out.links++;
        if (isJs(doc, a.get(PDFName.of('A')))) out.javascript = true;
      } else if (st === 'Widget') {
        out.formFields++;
        if (a.has(PDFName.of('AA')) || isJs(doc, a.get(PDFName.of('A')))) out.javascript = true;
      } else if (st === 'FileAttachment') {
        out.attachments++;
      } else if (st !== 'Popup') out.comments++;
    }
  }
  return out;
}

/**
 * pdf-lib writes every object it holds, even ones nothing points to any more. Without this, a removed attachment
 * or comment would still sit in the file as bytes. Keeps what can be reached from the document, drops the rest.
 */
export function dropUnreachable(doc: PDFDocument): number {
  const ctx = doc.context;
  const seen = new Set<string>();
  const stack: PDFObject[] = [ctx.trailerInfo.Root, ctx.trailerInfo.Info, ctx.trailerInfo.Encrypt].filter(Boolean) as PDFObject[];
  while (stack.length) {
    const o = stack.pop()!;
    if (o instanceof PDFRef) {
      if (seen.has(o.tag)) continue;
      seen.add(o.tag);
      const v = ctx.lookup(o);
      if (v) stack.push(v);
    } else if (o instanceof PDFDict) {
      for (const v of o.values()) stack.push(v);
    } else if (o instanceof PDFArray) {
      for (let i = 0; i < o.size(); i++) stack.push(o.get(i));
    } else if (o instanceof PDFRawStream || (o as { dict?: PDFDict }).dict instanceof PDFDict) {
      stack.push((o as unknown as { dict: PDFDict }).dict);
    }
  }
  let dropped = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!seen.has(ref.tag)) {
      ctx.delete(ref);
      dropped++;
    }
  }
  return dropped;
}

/** Removes the chosen kinds of hidden information. The pages themselves stay exactly as they are. */
export async function cleanPdf(bytes: Uint8Array, o: CleanOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const cat = doc.catalog;
  const names = dict(doc, cat.get(PDFName.of('Names')));

  if (o.info) {
    const info = dict(doc, doc.context.trailerInfo.Info);
    INFO_KEYS.forEach((k) => info?.delete(PDFName.of(k)));
    cat.delete(PDFName.of('Metadata'));
  }
  if (o.javascript) {
    names?.delete(PDFName.of('JavaScript'));
    if (isJs(doc, cat.get(PDFName.of('OpenAction')))) cat.delete(PDFName.of('OpenAction'));
    cat.delete(PDFName.of('AA'));
  }
  if (o.attachments) {
    names?.delete(PDFName.of('EmbeddedFiles'));
    cat.delete(PDFName.of('AF')); // associated files point at the same attachments
  }
  if (o.bookmarks) cat.delete(PDFName.of('Outlines'));
  if (o.privateData) cat.delete(PDFName.of('PieceInfo'));

  for (const page of doc.getPages()) {
    const p = page.node;
    if (o.thumbnails) p.delete(PDFName.of('Thumb'));
    if (o.privateData) p.delete(PDFName.of('PieceInfo'));
    if (o.javascript) p.delete(PDFName.of('AA'));
    const annots = annotsOf(doc, p);
    if (!annots) continue;
    const keep: PDFObject[] = [];
    if (o.attachments) p.delete(PDFName.of('AF'));
    for (let i = 0; i < annots.size(); i++) {
      const raw = annots.get(i);
      const a = dict(doc, raw);
      if (!a) {
        keep.push(raw);
        continue;
      }
      const st = subtype(doc, a);
      const drop =
        (st === 'Link' && o.links) ||
        (st === 'FileAttachment' && o.attachments) ||
        (st !== 'Link' && st !== 'Widget' && st !== 'FileAttachment' && o.comments);
      if (drop) continue;
      if (o.javascript) {
        if (isJs(doc, a.get(PDFName.of('A')))) a.delete(PDFName.of('A'));
        a.delete(PDFName.of('AA'));
      }
      keep.push(raw);
    }
    if (keep.length !== annots.size()) p.set(PDFName.of('Annots'), doc.context.obj(keep));
  }
  dropUnreachable(doc);
  return doc.save();
}
