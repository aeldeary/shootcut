import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { useI18n, type Key } from '../i18n';
import { classifyError, openPreview, readBytes, type PdfErrorKind, type PdfPreview } from '../lib/pdf';
import { clearHeld, takeFile } from '../lib/handoff';
import { isKeepEnabled, loadSaved, saveFile } from '../lib/persist';
import { PasswordRequiredError, unlockPdf, WrongPasswordError } from '../lib/source';

/** keep the file for a React dev double-mount, then forget it */
function clearHeldSoon() {
  setTimeout(clearHeld, 1000);
}

const ERR_KEY: Record<PdfErrorKind, Key> = {
  encrypted: 'errEncrypted',
  corrupt: 'errCorrupt',
  generic: 'errGeneric',
};

export interface LoadedPdf {
  file: File;
  /** unencrypted bytes, safe to hand to any tool */
  bytes: Uint8Array;
  preview: PdfPreview;
  numPages: number;
  /** the file needed a password to open (the bytes above are the unlocked copy) */
  wasEncrypted: boolean;
}

interface Options {
  /** open a pdf.js preview (needed by tools that show pages); default true */
  preview?: boolean;
  /**
   * keep the opened file on this device (and reopen it here next time); default true.
   * Tools that open several files side by side turn this off.
   */
  persist?: boolean;
}

/**
 * Loads one PDF: reads it, asks for the password when the file is encrypted, and (optionally) opens
 * a pdf.js preview. Owns the preview's lifetime.
 */
export function usePdfFile({ preview: wantPreview = true, persist = true }: Options = {}) {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [error, setError] = useState<Key | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<{ file: File; raw: Uint8Array; wrong: boolean } | null>(null);
  const current = useRef<PdfPreview | null>(null);
  const run = useRef(0);

  useEffect(
    () => () => {
      run.current += 1;
      current.current?.destroy();
      current.current = null;
    },
    [],
  );

  const finish = useCallback(
    async (file: File, bytes: Uint8Array, id: number, wasEncrypted: boolean, save: boolean) => {
      const preview = wantPreview ? await openPreview(bytes) : null;
      if (id !== run.current) {
        preview?.destroy();
        return;
      }
      current.current?.destroy();
      current.current = preview;
      const numPages = preview ? preview.numPages : (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount();
      setPdf({ file, bytes, preview: preview as PdfPreview, numPages, wasEncrypted });
      // only a file that opened fine is worth keeping
      if (save && persist) void saveFile(file);
    },
    [wantPreview, persist],
  );

  const open = useCallback(
    async (file: File, save: boolean) => {
      const id = ++run.current;
      setError(null);
      setPending(null);
      setLoading(true);
      try {
        const raw = await readBytes(file);
        try {
          await finish(file, await unlockPdf(raw), id, false, save);
        } catch (err) {
          if (err instanceof PasswordRequiredError && id === run.current) setPending({ file, raw, wrong: false });
          else throw err;
        }
      } catch (err) {
        if (id === run.current) setError(ERR_KEY[classifyError(err)]);
      } finally {
        if (id === run.current) setLoading(false);
      }
    },
    [finish],
  );

  const load = useCallback((file: File) => open(file, true), [open]);

  // a file handed over from another tool ("open in...") loads as if it had been dropped here
  useEffect(() => {
    const f = takeFile();
    if (f) {
      clearHeldSoon();
      // the tool that handed it over already saved the original; saving this opened copy would store it without its password
      void open(f, false);
      return;
    }
    // otherwise reopen the file kept on this device, unless the person already picked one meanwhile
    if (!persist || !isKeepEnabled()) return;
    const started = run.current;
    void loadSaved().then((saved) => {
      if (saved && run.current === started) void open(saved, false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the tool opens
  }, []);

  const submitPassword = useCallback(
    async (password: string) => {
      if (!pending) return;
      const id = ++run.current;
      setLoading(true);
      try {
        await finish(pending.file, await unlockPdf(pending.raw, password), id, true, true);
        if (id === run.current) setPending(null);
      } catch (err) {
        if (id !== run.current) return;
        if (err instanceof WrongPasswordError) setPending({ ...pending, wrong: true });
        else {
          setPending(null);
          setError(ERR_KEY[classifyError(err)]);
        }
      } finally {
        if (id === run.current) setLoading(false);
      }
    },
    [finish, pending],
  );

  const reset = useCallback(() => {
    run.current += 1;
    current.current?.destroy();
    current.current = null;
    setPdf(null);
    setPending(null);
    setError(null);
    setLoading(false);
  }, []);

  const passwordPrompt: ReactNode = pending ? (
    <PasswordForm wrong={pending.wrong} busy={loading} fileName={pending.file.name} onSubmit={submitPassword} onCancel={reset} />
  ) : null;

  return { pdf, error, loading, load, reset, passwordPrompt, setError };
}

function PasswordForm({
  wrong,
  busy,
  fileName,
  onSubmit,
  onCancel,
}: {
  wrong: boolean;
  busy: boolean;
  fileName: string;
  onSubmit: (pw: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [pw, setPw] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pw) onSubmit(pw);
  };
  return (
    <form className="panel password" onSubmit={submit}>
      <p className="panel-title">
        <Lock size={16} aria-hidden /> {t('pwTitle')}
      </p>
      <p className="muted">
        <bdi>{fileName}</bdi> — {t('pwHint')}
      </p>
      <div className="inline">
        <input
          className="input"
          type="password"
          autoFocus
          autoComplete="off"
          value={pw}
          placeholder={t('pwPlaceholder')}
          aria-label={t('pwPlaceholder')}
          onChange={(e) => setPw(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !pw}>
          {t('pwSubmit')}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
      {wrong && (
        <p className="notice notice-error" role="alert">
          {t('pwWrong')}
        </p>
      )}
    </form>
  );
}
