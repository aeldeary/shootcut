import { EncryptedPDFError, PDFDict, PDFDocument, PDFInvalidObject, PDFName } from 'pdf-lib';

/** instanceof can fail when the library is loaded twice (ESM/CJS), so the message is checked too. */
export function isEncryptedError(err: unknown): boolean {
  return err instanceof EncryptedPDFError || /document .*is encrypted/i.test(String((err as Error)?.message));
}

export class PasswordRequiredError extends Error {
  constructor() {
    super('Password required');
    this.name = 'PasswordRequiredError';
  }
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Password incorrect');
    this.name = 'WrongPasswordError';
  }
}

/**
 * Returns bytes of a PDF that every tool can work with. Encrypted files are decrypted with
 * the given password and re-saved without encryption (so the output of the tools is not locked
 * unless the user asks for it with the Protect tool).
 */
export async function unlockPdf(bytes: Uint8Array, password?: string): Promise<Uint8Array> {
  try {
    await PDFDocument.load(bytes, { updateMetadata: false });
    return bytes;
  } catch (err) {
    if (!isEncryptedError(err)) throw err;
  }
  if (!password) throw new PasswordRequiredError();
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { password, updateMetadata: false });
  } catch (err) {
    if (/password/i.test((err as Error).message)) throw new WrongPasswordError();
    throw err;
  }
  dropEncryptionLeftovers(doc);
  return doc.save();
}

/**
 * After a password load the library keeps the parsed-away pieces of the old file around: the
 * /Encrypt dictionary, object streams that were already expanded and the original cross-reference
 * stream (as an invalid object). Left in, they confuse readers about whether the file is encrypted.
 */
function dropEncryptionLeftovers(doc: PDFDocument): void {
  const drop = [];
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : (obj as { dict?: PDFDict }).dict;
    const type = dict?.get(PDFName.of('Type'))?.toString();
    const isEncryptDict = obj instanceof PDFDict && obj.has(PDFName.of('O')) && obj.has(PDFName.of('U')) && obj.has(PDFName.of('Filter'));
    if (obj instanceof PDFInvalidObject || type === '/ObjStm' || type === '/XRef' || isEncryptDict) drop.push(ref);
  }
  for (const ref of drop) doc.context.delete(ref);
}
