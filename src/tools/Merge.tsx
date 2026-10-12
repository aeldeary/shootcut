import { useState } from 'react';
import { forgetSaved, getSavedMeta, saveFile } from '../lib/persist';
import { useReopenKept } from '../hooks/useReopenKept';
import { PDFDocument } from 'pdf-lib';
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Notice, ToolPage } from '../components/Shell';
import { classifyError, downloadBytes, formatBytes, nextId, readBytes, type PdfErrorKind } from '../lib/pdf';
import { moveItem, useDragReorder } from '../lib/reorder';
import { useHistory } from '../hooks/useHistory';

interface Item {
  id: string;
  file: File;
  pages: number;
}

const ERR_KEY: Record<PdfErrorKind, Key> = {
  encrypted: 'errEncrypted',
  corrupt: 'errCorrupt',
  generic: 'errGeneric',
};

export function MergeTool() {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [errorFile, setErrorFile] = useState('');
  const [done, setDone] = useState(false);
  useHistory({ items }, (s) => { setItems(s.items); setDone(false); });
  const { dragId, overId, bind } = useDragReorder(items, setItems);

  const addFiles = async (files: File[], remember = true) => {
    setError(null);
    setDone(false);
    setBusy(true);
    const added: Item[] = [];
    for (const file of files) {
      try {
        const doc = await PDFDocument.load(await readBytes(file));
        added.push({ id: nextId(), file, pages: doc.getPageCount() });
      } catch (err) {
        setError(ERR_KEY[classifyError(err)]);
        setErrorFile(file.name);
      }
    }
    // a file that is already in the list (a development double-mount, or the kept file added again) is not added twice
    setItems((prev) => [...prev, ...added.filter((a) => !prev.some((p) => p.file.name === a.file.name && p.file.size === a.file.size))]);
    setBusy(false);
    // the last file added is the one kept for the other tools
    if (remember && added.length > 0) void saveFile(added[added.length - 1].file);
  };
  useReopenKept((f) => void addFiles([f], false));

  /** dropping the kept file from the list deletes the saved copy too, as the X does in the other tools */
  const forgetIfKept = async (files: File[]) => {
    const meta = await getSavedMeta();
    if (meta && files.some((f) => f.name === meta.name && f.size === meta.size)) await forgetSaved();
  };

  const merge = async () => {
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      const out = await PDFDocument.create();
      for (const item of items) {
        const src = await PDFDocument.load(await readBytes(item.file));
        const copied = await out.copyPages(src, src.getPageIndices());
        copied.forEach((p) => out.addPage(p));
      }
      downloadBytes(await out.save(), t('mergedName'));
      setDone(true);
    } catch (err) {
      setError(ERR_KEY[classifyError(err)]);
      setErrorFile('');
    } finally {
      setBusy(false);
    }
  };

  const totalPages = items.reduce((n, i) => n + i.pages, 0);

  return (
    <ToolPage title={t('toolMerge')} desc={t('toolMergeDesc')}>
      <Dropzone multiple compact={items.length > 0} onFiles={addFiles} onRejected={() => { setError('onlyPdf'); setErrorFile(''); }} />

      {error && (
        <Notice kind="error">
          {errorFile && <bdi>{errorFile}: </bdi>}
          {t(error)}
        </Notice>
      )}
      {done && <Notice kind="success">{t('mergeDone')}</Notice>}

      {items.length > 0 && (
        <>
          <div className="toolbar">
            <p className="muted">
              {items.length} {items.length === 1 ? t('file') : t('files')} · {totalPages}{' '}
              {totalPages === 1 ? t('pageSingular') : t('pagePlural')}
              {' — '}
              {t('mergeHint')}
            </p>
            <div className="toolbar-actions">
              <button type="button" className="btn" onClick={() => { void forgetIfKept(items.map((x) => x.file)); setItems([]); setDone(false); setError(null); }} disabled={busy}>
                {t('clearAll')}
              </button>
              <button type="button" className="btn btn-primary" data-save onClick={merge} disabled={busy || items.length < 2}>
                {busy ? t('processing') : t('mergeAction')}
              </button>
            </div>
          </div>
          {items.length < 2 && <Notice kind="info">{t('mergeNeedTwo')}</Notice>}

          <ul className="list">
            {items.map((item, i) => (
              <li
                key={item.id}
                className={`row${dragId === item.id ? ' is-dragging' : ''}${overId === item.id && dragId !== item.id ? ' is-over' : ''}`}
                {...bind(item.id)}
              >
                <GripVertical size={18} className="grip" aria-hidden />
                <span className="row-index">{i + 1}</span>
                <div className="row-main">
                  <div className="row-name" dir="auto" title={item.file.name}>
                    {item.file.name}
                  </div>
                  <div className="row-meta">
                    {item.pages} {item.pages === 1 ? t('pageSingular') : t('pagePlural')} · {formatBytes(item.file.size)}
                  </div>
                </div>
                <div className="row-actions">
                  <button type="button" className="icon-btn" title={t('moveUp')} aria-label={t('moveUp')} disabled={i === 0 || busy} onClick={() => setItems(moveItem(items, i, i - 1))}>
                    <ArrowUp size={16} aria-hidden />
                  </button>
                  <button type="button" className="icon-btn" title={t('moveDown')} aria-label={t('moveDown')} disabled={i === items.length - 1 || busy} onClick={() => setItems(moveItem(items, i, i + 1))}>
                    <ArrowDown size={16} aria-hidden />
                  </button>
                  <button type="button" className="icon-btn danger" title={t('remove')} aria-label={t('remove')} disabled={busy} onClick={() => { void forgetIfKept([item.file]); setItems(items.filter((x) => x.id !== item.id)); setDone(false); }}>
                    <Trash2 size={16} aria-hidden />
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
