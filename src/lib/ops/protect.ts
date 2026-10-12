import { PDFDocument } from 'pdf-lib';

export interface ProtectOptions {
  /** needed to open the file; empty = anyone can open it but the permissions below still apply */
  userPassword?: string;
  /** needed to change permissions; generated randomly when not given */
  ownerPassword?: string;
  allowPrinting: boolean;
  allowCopying: boolean;
  allowEditing: boolean;
  allowAnnotating: boolean;
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Encrypts with AES-256. `bytes` must be an unencrypted PDF (see unlockPdf). */
export async function protectPdf(bytes: Uint8Array, o: ProtectOptions): Promise<Uint8Array> {
  if (!o.userPassword && o.allowPrinting && o.allowCopying && o.allowEditing && o.allowAnnotating) {
    throw new Error('Nothing to protect: set a password or restrict a permission');
  }
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.encrypt({
    userPassword: o.userPassword ?? '',
    ownerPassword: o.ownerPassword || randomPassword(),
    algorithm: 'AES-256',
    permissions: {
      printing: o.allowPrinting ? 'highResolution' : false,
      copying: o.allowCopying,
      modifying: o.allowEditing,
      annotating: o.allowAnnotating,
      fillingForms: o.allowAnnotating,
      contentAccessibility: true,
      documentAssembly: o.allowEditing,
    },
  });
  return doc.save();
}
