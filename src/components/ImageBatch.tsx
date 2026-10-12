import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from './Dropzone';
import { Field } from './Fields';
import { Notice, ToolPage } from './Shell';
import { decodeFile, encodeCanvas, formatOf, MIME, outName, previewSize, uniqueNames, type FormatChoice, type OutFormat } from '../lib/img';
import { resizeCanvas } from '../lib/ops/imgops';
import { canvasToBytes, downloadBytes, formatBytes, type CanvasLike } from '../lib/pdf';
import { zipFiles } from '../lib/ops/export';

interface Result {
  id: number;
  name: string;
  format: OutFormat;
  bytes: Uint8Array;
  url: string;
  before: number;
  after: number;
  width: number;
  height: number;
}

interface Props {
  title: Key;
  desc: Key;
  /** the tool's own controls */
  options: ReactNode;
  /** turns one decoded picture into the new one */
  process: (src: CanvasLike, index: number) => CanvasLike | Promise<CanvasLike>;
  /** added to each file name: photo.jpg → photo-small.jpg */
  suffix: string;
  /** hide the format chooser when the tool decides the format itself */
  fixedFormat?: OutFormat;
  /** show a live preview of the first picture; list what the preview depends on in `deps` */
  preview?: boolean;
  deps?: unknown[];
  /** false while the options are not complete */
  ready?: boolean;
  note?: ReactNode;
  /** the format the chooser starts on */
  defaultFormat?: FormatChoice;
  /** the action button's text */
  action?: Key;
  /** starting JPG/WebP quality, percent */
  defaultQuality?: number;
}

/**
 * Shared page for the tools that treat many pictures the same way: add pictures, set the options,
 * apply, then download one by one or as a ZIP. Everything happens on the device.
 */
export function ImageBatch({ title, desc, options, process, suffix, fixedFormat, preview, deps = [], ready = true, note, defaultFormat = 'keep', action = 'imgApply', defaultQuality = 85 }: Props) {
  const { t } = useI18n();
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<FormatChoice>(defaultFormat);
  const [quality, setQuality] = useState(defaultQuality);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState<[number, number] | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const [large, setLarge] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  const processRef = useRef(process);
  processRef.current = process;

  const forget = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    setResults([]);
    setDone(false);
  };
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const chosen = (f: File): OutFormat => fixedFormat ?? (format === 'keep' ? formatOf(f) : format);

  const add = (list: File[]) => {
    forget();
    setBad([]);
    setFiles((prev) => [...prev, ...list]);
  };

  const run = async () => {
    forget();
    setBad([]);
    setLarge([]);
    const made: Result[] = [];
    const failed: string[] = [];
    const tooLarge: string[] = [];
    for (const [i, file] of files.entries()) {
      setBusy([i, files.length]);
      try {
        const out = await processRef.current(await decodeFile(file), i);
        const fmt = chosen(file);
        const bytes = await encodeCanvas(out, fmt, quality / 100);
        const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: MIME[fmt] }));
        urls.current.push(url);
        made.push({ id: i, name: outName(file, suffix, fmt), format: fmt, bytes, url, before: file.size, after: bytes.length, width: out.width, height: out.height });
      } catch (e) {
        // a tool can say a picture would come out too big for the device's memory
        (e instanceof Error && e.message === 'too-large' ? tooLarge : failed).push(file.name);
      }
    }
    const names = uniqueNames(made.map((m) => m.name));
    setResults(made.map((m, i) => ({ ...m, name: names[i] })));
    setBad(failed);
    setLarge(tooLarge);
    setBusy(null);
    setDone(made.length > 0);
  };

  // live preview of the first picture, on a smaller copy so it stays quick
  const first = files[0];
  const token = useRef(0);
  useEffect(() => {
    if (!preview || !first || !ready) {
      setPreviewUrl(null);
      return;
    }
    const id = ++token.current;
    const timer = setTimeout(async () => {
      try {
        const full = await decodeFile(first);
        const s = previewSize(full.width, full.height);
        const small = s.width < full.width ? resizeCanvas(full, s.width, s.height) : full;
        const out = await processRef.current(small, 0);
        const bytes = await canvasToBytes(out, 'image/png');
        const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'image/png' }));
        if (id === token.current) {
          setPreviewUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return url;
          });
        } else URL.revokeObjectURL(url);
      } catch {
        if (id === token.current) setPreviewUrl(null);
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, first, ready, ...deps]);
  useEffect(() => () => setPreviewUrl((old) => (old && URL.revokeObjectURL(old), null)), []);

  const downloadAll = () => {
    if (results.length === 1) return downloadBytes(results[0].bytes, results[0].name, MIME[results[0].format]);
    downloadBytes(zipFiles(results.map((r) => ({ name: r.name, bytes: r.bytes }))), 'shootcut-images.zip', 'application/zip');
  };

  const anyPng = files.some((f) => chosen(f) === 'png');
  const allPng = files.length > 0 && files.every((f) => chosen(f) === 'png');

  return (
    <ToolPage title={t(title)} desc={t(desc)}>
      <Dropzone kind="image" multiple compact={files.length > 0} onFiles={add} onRejected={() => undefined} />
      {files.length > 0 && (
        <div className="split">
          <div className="panel">
            <div className="img-files">
              <p>
                {files.length} {t(files.length === 1 ? 'file' : 'files')}
              </p>
              <button type="button" className="btn btn-ghost" onClick={() => { setFiles([]); forget(); setBad([]); }}>
                {t('imgClear')}
              </button>
            </div>
            {options}
            {!fixedFormat && (
              <Field label={t('imgFormat')}>
                {(id) => (
                  <select id={id} className="input" value={format} onChange={(e) => { setFormat(e.target.value as FormatChoice); forget(); }}>
                    <option value="keep">{t('imgKeepFormat')}</option>
                    <option value="jpeg">JPG</option>
                    <option value="png">PNG</option>
                    <option value="webp">WebP</option>
                  </select>
                )}
              </Field>
            )}
            {!allPng && (
              <Field label={`${t('imgQuality')}: ${quality}%`} hint={anyPng ? t('imgQualityPng') : undefined}>
                {(id) => <input id={id} className="input" type="range" min={30} max={100} value={quality} onChange={(e) => { setQuality(Number(e.target.value)); forget(); }} />}
              </Field>
            )}
            {note && <p className="hint">{note}</p>}
            <div className="actions">
              <button type="button" className="btn btn-primary" data-save disabled={!ready || busy !== null} onClick={run}>
                {busy ? `${t('processing')} ${busy[0] + 1}/${busy[1]}` : t(action)}
              </button>
            </div>
            {done && <Notice kind="success">{t('imgDone')}</Notice>}
            {large.map((n) => (
              <Notice key={`l-${n}`} kind="error">
                {t('imgTooLarge')} <bdi>{n}</bdi>
              </Notice>
            ))}
            {bad.map((n) => (
              <Notice key={n} kind="error">
                {t('imgUnreadable')} <bdi>{n}</bdi>
              </Notice>
            ))}
          </div>
          <div className="preview-box" aria-label={t('imgResults')}>
            {preview && previewUrl && results.length === 0 && (
              <figure className="img-preview">
                <img src={previewUrl} alt={t('imgPreview')} />
                <figcaption className="muted">{t('imgPreview')}</figcaption>
              </figure>
            )}
            {results.length === 0 && !(preview && previewUrl) && <p className="muted">{t('imgNothingYet')}</p>}
            {results.length > 0 && (
              <>
                <ul className="img-results">
                  {results.map((r) => {
                    const pct = r.before > 0 ? Math.round((1 - r.after / r.before) * 100) : 0;
                    return (
                      <li key={r.id} className="img-result">
                        <img src={r.url} alt="" />
                        <div className="img-result-main">
                          <bdi className="img-result-name">{r.name}</bdi>
                          <span className="muted">
                            <bdi>{r.width}×{r.height}</bdi> · <bdi>{formatBytes(r.before)} → {formatBytes(r.after)}</bdi>
                            {pct !== 0 && <> · <bdi>{Math.abs(pct)}%</bdi> {t(pct > 0 ? 'imgSmaller' : 'imgLarger')}</>}
                          </span>
                        </div>
                        <button type="button" className="btn" onClick={() => downloadBytes(r.bytes, r.name, MIME[r.format])}>
                          {t('imgDownload')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {results.length > 1 && (
                  <button type="button" className="btn btn-primary" onClick={downloadAll}>
                    {t('imgDownloadAll')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </ToolPage>
  );
}

