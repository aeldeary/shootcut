import { PDFDocument } from 'pdf-lib';

export interface PdfProperties {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  created: Date | null;
  modified: Date | null;
}

export type EditableProperties = Pick<PdfProperties, 'title' | 'author' | 'subject' | 'keywords'>;

export async function readProperties(bytes: Uint8Array): Promise<PdfProperties> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: doc.getKeywords() ?? '',
    creator: doc.getCreator() ?? '',
    producer: doc.getProducer() ?? '',
    created: doc.getCreationDate() ?? null,
    modified: doc.getModificationDate() ?? null,
  };
}

/** Writes the document title, author, subject and keywords. Everything else in the file is left alone. */
export async function writeProperties(bytes: Uint8Array, p: EditableProperties): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.setTitle(p.title);
  doc.setAuthor(p.author);
  doc.setSubject(p.subject);
  doc.setKeywords(p.keywords.split(/[,،;؛]/).map((k) => k.trim()).filter(Boolean));
  doc.setModificationDate(new Date());
  return doc.save();
}
