import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Field } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { Camera } from 'lucide-react';
import { downloadBytes, formatBytes, nextId } from '../lib/pdf';
import { createPdf, type CreateImage, type CreatePageSize } from '../lib/ops/create';
import { toCreateImage } from '../lib/ops/imagefile';
import { moveItem } from '../lib/reorder';
import { useHistory } from '../hooks/useHistory';

interface Item {
  id: string;
  name: string;
  size: number;
  image: CreateImage;
  url: string;
}

export function CreateTool() {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState('');
  const [pageSize, setPageSize] = useState<CreatePageSize>('a4');
  const [landscape, setLandscape] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const [done, setDone] = useState(false);
  useHistory({ items, pageSize, landscape, fontSize }, (s) => { setItems(s.items); setPageSize(s.pageSize); setLandscape(s.landscape); setFontSize(s.fontSize); setDone(false); });
  const urls = useRef<string[]>([]);
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const addImages = async (files: File[], fromCamera = false) => {
    setError(null);
    setDone(false);
    const added: Item[] = [];
    for (const file of files) {
      try {
        const image = await toCreateImage(file, fromCamera);
        const url = URL.createObjectURL(new Blob([image.bytes as unknown as BlobPart], { type: image.mime }));
        urls.current.push(url);
        added.push({ id: nextId(), name: file.name, size: file.size, image, url });
      } catch {
        setError('errImage');
      }
    }
    setItems((prev) => [...prev, ...added]);
  };

  const canCreate = items.length > 0 || text.trim() !== '';

  const create = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const bytes = await createPdf({ images: items.map((i) => i.image), text, pageSize, landscape, fontSize });
      downloadBytes(bytes, t('createdName'));
      setDone(true);
    } catch {
      setError('errGeneric');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={t('toolCreate')} desc={t('toolCreateDesc')}>
      <Dropzone kind="image" multiple compact={items.length > 0} onFiles={(f) => addImages(f)} onRejected={() => setError('onlyImages')} />
      <div className="actions">
        <button type="button" className="btn" onClick={() => camera.current?.click()}>
          <Camera size={16} aria-hidden /> {t('createCamera')}
        </button>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          data-camera
          onChange={(e) => {
            const f = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (f.length) void addImages(f, true);
          }}
        />
      </div>
      <p className="hint">{t('createCameraHint')}</p>
      {error && <Notice kind="error">{t(error)}</Notice>}

      {items.length > 0 && (
        <ul className="list">
          {items.map((item, i) => (
            <li key={item.id} className="row">
              <span className="row-index">{i + 1}</span>
              <img className="row-thumb" src={item.url} alt="" />
              <div className="row-main">
                <div className="row-name" dir="auto" title={item.name}>
                  {item.name}
                </div>
                <div className="row-meta">{formatBytes(item.size)}</div>
              </div>
              <div className="row-actions">
                <button type="button" className="icon-btn" title={t('moveUp')} aria-label={t('moveUp')} disabled={i === 0} onClick={() => setItems(moveItem(items, i, i - 1))}>
                  <ArrowUp size={16} aria-hidden />
                </button>
                <button type="button" className="icon-btn" title={t('moveDown')} aria-label={t('moveDown')} disabled={i === items.length - 1} onClick={() => setItems(moveItem(items, i, i + 1))}>
                  <ArrowDown size={16} aria-hidden />
                </button>
                <button type="button" className="icon-btn danger" title={t('remove')} aria-label={t('remove')} onClick={() => setItems(items.filter((x) => x.id !== item.id))}>
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="panel">
        <Field label={t('createText')} hint={t('createTextHint')}>
          {(id) => <textarea id={id} className="input" rows={6} dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
        <div className="grid-3">
          <Field label={t('createPageSize')}>
            {(id) => (
              <select id={id} className="input" value={pageSize} onChange={(e) => setPageSize(e.target.value as CreatePageSize)}>
                <option value="a4">A4</option>
                <option value="letter">Letter</option>
                <option value="fit">{t('createFit')}</option>
              </select>
            )}
          </Field>
          <Field label={t('createOrientation')}>
            {(id) => (
              <select id={id} className="input" value={landscape ? 'l' : 'p'} disabled={pageSize === 'fit'} onChange={(e) => setLandscape(e.target.value === 'l')}>
                <option value="p">{t('portrait')}</option>
                <option value="l">{t('landscape')}</option>
              </select>
            )}
          </Field>
          <Field label={t('createFontSize')}>
            {(id) => <input id={id} className="input" type="number" min={8} max={48} value={fontSize} onChange={(e) => setFontSize(Math.min(48, Math.max(8, Number(e.target.value) || 14)))} />}
          </Field>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" data-save disabled={!canCreate || busy} onClick={create}>
            {busy ? t('processing') : t('createAction')}
          </button>
        </div>
        {!canCreate && <p className="muted">{t('createNeedInput')}</p>}
        {done && <Notice kind="success">{t('createDone')}</Notice>}
      </div>
    </ToolPage>
  );
}
