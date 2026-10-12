import { useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { ChevronLeft, ChevronRight, Copy, FilePlus, RotateCcw, RotateCw, Trash2, Undo2 } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { KeepBar } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { useReopenKept } from '../hooks/useReopenKept';
import { saveFile } from '../lib/persist';
import {
  baseName,
  classifyError,
  downloadBytes,
  nextId,
  openPreview,
  readBytes,
  type PdfErrorKind,
  type PdfPreview,
} from '../lib/pdf';
import { moveItem, useDragReorder } from '../lib/reorder';
import { useHistory } from '../hooks/useHistory';
import { buildOrganized } from '../lib/ops/organize';

interface PageItem {
  id: string;
  /** 0-based index in the source file */
  src: number;
  /** index in the added files, when the page comes from one; undefined for the main file */
  from?: number;
  blank?: boolean;
  /** extra rotation in degrees (multiple of 90, may be negative) */
  rotation: number;
  deleted: boolean;
}

const ERR_KEY: Record<PdfErrorKind, Key> = {
  encrypted: 'errEncrypted',
  corrupt: 'errCorrupt',
  generic: 'errGeneric',
};

const THUMB_WIDTH = 220;

export function OrganizeTool() {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<{ name: string; bytes: Uint8Array }[]>([]);
  const extraPreviews = useRef<PdfPreview[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [done, setDone] = useState(false);
  useHistory({ pages }, (s) => { setPages(s.pages); setDone(false); }, bytes);
  const previewRef = useRef<PdfPreview | null>(null);
  const runRef = useRef(0);

  const { dragId, overId, bind } = useDragReorder(pages, setPages);

  const closePreview = () => {
    previewRef.current?.destroy();
    previewRef.current = null;
    extraPreviews.current.forEach((p) => p.destroy());
    extraPreviews.current = [];
  };
  const key = (p: { from?: number; src: number }) => `${p.from ?? 'm'}-${p.src}`;

  useEffect(() => () => {
    runRef.current += 1;
    closePreview();
  }, []);

  const load = async (f: File, remember = true) => {
    const run = ++runRef.current;
    closePreview();
    setError(null);
    setDone(false);
    setThumbs({});
    setExtras([]);
    setPages([]);
    setLoading(true);
    try {
      const data = await readBytes(f);
      // pdf-lib validates the file (encryption, structure) and gives the page count.
      const count = (await PDFDocument.load(data)).getPageCount();
      const preview = await openPreview(data);
      if (run !== runRef.current) {
        preview.destroy();
        return;
      }
      previewRef.current = preview;
      setFile(f);
      setBytes(data);
      setPages(Array.from({ length: count }, (_, i) => ({ id: nextId(), src: i, rotation: 0, deleted: false })));
      setLoading(false);
      if (remember) void saveFile(f);
      // Render thumbnails one by one so the UI stays responsive on long documents.
      for (let i = 0; i < count; i++) {
        if (run !== runRef.current) return;
        try {
          const url = await preview.render(i, THUMB_WIDTH);
          if (run !== runRef.current) return;
          setThumbs((prev) => ({ ...prev, [`m-${i}`]: url }));
        } catch {
          /* a single unreadable page should not block the rest */
        }
      }
    } catch (err) {
      if (run !== runRef.current) return;
      setError(ERR_KEY[classifyError(err)]);
      setFile(null);
      setBytes(null);
      setLoading(false);
    }
  };

  useReopenKept((f) => void load(f, false));

  const update = (id: string, patch: (p: PageItem) => PageItem) => {
    setDone(false);
    setPages((prev) => prev.map((p) => (p.id === id ? patch(p) : p)));
  };

  const reorder = (next: PageItem[]) => {
    setDone(false);
    setPages(next);
  };

  const duplicate = (i: number) => {
    setDone(false);
    setPages((prev) => [...prev.slice(0, i + 1), { ...prev[i], id: nextId() }, ...prev.slice(i + 1)]);
  };
  const addBlank = (i: number) => {
    setDone(false);
    setPages((prev) => [...prev.slice(0, i + 1), { id: nextId(), src: 0, blank: true, rotation: 0, deleted: false }, ...prev.slice(i + 1)]);
  };
  // pages of another PDF join the end; move them where they belong
  const addFrom = async (f: File) => {
    setError(null);
    try {
      const data = await readBytes(f);
      const count = (await PDFDocument.load(data)).getPageCount();
      const preview = await openPreview(data);
      const from = extras.length;
      extraPreviews.current.push(preview);
      setExtras((prev) => [...prev, { name: f.name, bytes: data }]);
      setDone(false);
      setPages((prev) => [...prev, ...Array.from({ length: count }, (_, i) => ({ id: nextId(), src: i, from, rotation: 0, deleted: false }))]);
      const run = runRef.current;
      for (let i = 0; i < count; i++) {
        if (run !== runRef.current) return;
        try {
          const url = await preview.render(i, THUMB_WIDTH);
          setThumbs((prev) => ({ ...prev, [`${from}-${i}`]: url }));
        } catch {
          /* one unreadable page should not block the rest */
        }
      }
    } catch (err) {
      setError(ERR_KEY[classifyError(err)]);
    }
  };

  const kept = pages.filter((p) => !p.deleted);

  const save = async () => {
    if (!bytes || !file || kept.length === 0) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const out = await buildOrganized(bytes, extras.map((e) => e.bytes), kept);
      downloadBytes(out, `${baseName(file.name)}${t('organizeSuffix')}.pdf`);
      setDone(true);
    } catch (err) {
      setError(ERR_KEY[classifyError(err)]);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    runRef.current += 1;
    closePreview();
    setFile(null);
    setBytes(null);
    setPages([]);
    setThumbs({});
    setExtras([]);
    setError(null);
    setDone(false);
  };

  return (
    <ToolPage title={t('toolOrganize')} desc={t('toolOrganizeDesc')}>
      {!file && !loading && <Dropzone onFiles={(f) => void load(f[0])} onRejected={() => setError('onlyPdf')} />}
      {loading && <Notice kind="info">{t('loadingPages')}</Notice>}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {done && <Notice kind="success">{t('organizeDone')}</Notice>}

      {file && (
        <>
          <KeepBar name={file.name} size={file.size} onDeleted={reset} />
          <div className="toolbar">
            <p className="muted">
              <bdi>{file.name}</bdi> · {kept.length}/{pages.length} {pages.length === 1 ? t('pageSingular') : t('pagePlural')} — {t('organizeHint')}
            </p>
            <div className="toolbar-actions">
              <input ref={picker} type="file" accept="application/pdf,.pdf" hidden aria-label={t('organizeAddFile')} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void addFrom(f); }} />
              <button type="button" className="btn" onClick={() => picker.current?.click()} disabled={busy}>
                {t('organizeAddFile')}
              </button>
              <button type="button" className="btn" onClick={() => addBlank(pages.length - 1)} disabled={busy}>
                {t('organizeAddBlank')}
              </button>
              <button type="button" className="btn" onClick={reset} disabled={busy}>
                {t('clearAll')}
              </button>
              <button type="button" className="btn btn-primary" data-save onClick={() => void save()} disabled={busy || kept.length === 0}>
                {busy ? t('processing') : t('organizeAction')}
              </button>
            </div>
          </div>
          {kept.length === 0 && <Notice kind="info">{t('organizeEmpty')}</Notice>}

          <ul className="pages">
            {pages.map((p, i) => (
              <li
                key={p.id}
                className={`page${p.deleted ? ' is-deleted' : ''}${dragId === p.id ? ' is-dragging' : ''}${overId === p.id && dragId !== p.id ? ' is-over' : ''}`}
                {...bind(p.id)}
                // keep the source page order stable for the screen reader: position in list, not source number
                aria-label={`${t('pageLabel')} ${i + 1}`}
              >
                <div className="thumb">
                  {p.blank ? (
                    <span className="thumb-blank" style={{ transform: `rotate(${p.rotation}deg)` }} aria-hidden>{t('organizeBlank')}</span>
                  ) : thumbs[key(p)] ? (
                    <img
                      src={thumbs[key(p)]}
                      alt=""
                      draggable={false}
                      style={{ transform: `rotate(${p.rotation}deg)` }}
                    />
                  ) : (
                    <span className="thumb-ph" aria-hidden />
                  )}
                  {p.deleted && <span className="deleted-tag">{t('deleted')}</span>}
                </div>
                <div className="page-label">
                  {t('pageLabel')} {i + 1}
                </div>
                <div className="page-tools">
                  <button type="button" className="icon-btn" title={t('moveEarlier')} aria-label={t('moveEarlier')} disabled={i === 0} onClick={() => reorder(moveItem(pages, i, i - 1))}>
                    <ChevronLeft size={16} className="dir-flip" aria-hidden />
                  </button>
                  <button type="button" className="icon-btn" title={t('rotateLeft')} aria-label={t('rotateLeft')} disabled={p.deleted} onClick={() => update(p.id, (x) => ({ ...x, rotation: x.rotation - 90 }))}>
                    <RotateCcw size={16} aria-hidden />
                  </button>
                  <button type="button" className="icon-btn" title={t('rotateRight')} aria-label={t('rotateRight')} disabled={p.deleted} onClick={() => update(p.id, (x) => ({ ...x, rotation: x.rotation + 90 }))}>
                    <RotateCw size={16} aria-hidden />
                  </button>
                  <button type="button" className="icon-btn" title={t('organizeDuplicate')} aria-label={t('organizeDuplicate')} disabled={p.deleted} onClick={() => duplicate(i)}>
                    <Copy size={16} aria-hidden />
                  </button>
                  <button type="button" className="icon-btn" title={t('organizeBlankAfter')} aria-label={t('organizeBlankAfter')} onClick={() => addBlank(i)}>
                    <FilePlus size={16} aria-hidden />
                  </button>
                  {p.deleted ? (
                    <button type="button" className="icon-btn" title={t('restore')} aria-label={t('restore')} onClick={() => update(p.id, (x) => ({ ...x, deleted: false }))}>
                      <Undo2 size={16} aria-hidden />
                    </button>
                  ) : (
                    <button type="button" className="icon-btn danger" title={t('remove')} aria-label={t('remove')} onClick={() => update(p.id, (x) => ({ ...x, deleted: true }))}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  )}
                  <button type="button" className="icon-btn" title={t('moveLater')} aria-label={t('moveLater')} disabled={i === pages.length - 1} onClick={() => reorder(moveItem(pages, i, i + 1))}>
                    <ChevronRight size={16} className="dir-flip" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </ToolPage>
  );
}
