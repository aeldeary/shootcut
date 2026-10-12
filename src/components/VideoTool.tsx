import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from './Dropzone';
import { Notice, ToolPage } from './Shell';
import { baseName, downloadBytes, formatBytes } from '../lib/pdf';
import { cancelEngine, engineCached, probeFile, readMeta, runFfmpeg } from '../lib/video/engine';
import { formatTime, type VideoInfo } from '../lib/video/args';

export interface VideoCtx {
  files: File[];
  /** what the browser's own player says about the first file; null when it cannot play it */
  info: Pick<VideoInfo, 'duration' | 'width' | 'height'> | null;
  /** object URL of the first file, for a preview player */
  url: string | null;
  /** the preview player, so a tool can read or set its position */
  player: RefObject<HTMLVideoElement | null>;
}

export interface VideoJob {
  /** the FFmpeg command; `probes` describe each input (sound, duration …) as FFmpeg sees them */
  args: (inputs: string[], output: string, probes: VideoInfo[]) => string[];
  ext: string;
  mime: string;
  suffix: string;
}

interface Props {
  title: Key;
  desc: Key;
  /** several files, in an order the person can change (merge) */
  multiple?: boolean;
  options: (ctx: VideoCtx) => ReactNode;
  /** null while the options are incomplete */
  job: (ctx: VideoCtx) => VideoJob | null;
  action?: Key;
  /** how to show the result */
  result?: 'video' | 'audio' | 'image';
  note?: ReactNode;
  /** drawn over the preview player (the crop frame) */
  overlay?: (ctx: VideoCtx) => ReactNode;
}

const LARGE = 400 * 1024 * 1024;

/**
 * Shared page for the video tools: add a video, set the options, run FFmpeg on the device, preview and download.
 * The engine (about 32 MB) is downloaded once and then kept in the browser's storage.
 */
export function VideoTool({ title, desc, multiple = false, options, job, action = 'vidStart', result = 'video', note, overlay }: Props) {
  const { t } = useI18n();
  const [files, setFiles] = useState<File[]>([]);
  const [info, setInfo] = useState<VideoCtx['info']>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [stored, setStored] = useState<boolean | null>(null);
  const [engine, setEngine] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [out, setOut] = useState<{ bytes: Uint8Array; name: string; url: string; mime: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const started = useRef(0);
  const [eta, setEta] = useState<number | null>(null);
  const outUrl = useRef<string | null>(null);
  const player = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    engineCached().then(setStored);
  }, []);

  const forget = () => {
    if (outUrl.current) URL.revokeObjectURL(outUrl.current);
    outUrl.current = null;
    setOut(null);
    setError(null);
  };
  useEffect(() => () => forget(), []);

  // the first file: object URL for the preview and the browser's own reading of its size
  const first = files[0];
  useEffect(() => {
    if (!first) {
      setUrl(null);
      setInfo(null);
      return;
    }
    const u = URL.createObjectURL(first);
    setUrl(u);
    let live = true;
    readMeta(first)
      .then((m) => m ?? probeFile(first).then((p) => (p.width > 0 ? p : null)).catch(() => null))
      .then((m) => live && setInfo(m));
    return () => {
      live = false;
      URL.revokeObjectURL(u);
    };
  }, [first]);

  const ctx: VideoCtx = { files, info, url, player };
  const j = files.length > 0 ? job(ctx) : null;
  const busy = progress !== null || engine !== null;

  const add = (list: File[]) => {
    forget();
    setSkipped(false);
    setFiles((prev) => (multiple ? [...prev, ...list] : list.slice(0, 1)));
  };
  const move = (i: number, d: number) => {
    forget();
    setFiles((prev) => {
      const next = [...prev];
      const k = i + d;
      if (k < 0 || k >= next.length) return prev;
      [next[i], next[k]] = [next[k], next[i]];
      return next;
    });
  };

  const run = async () => {
    if (!j || busy) return;
    forget();
    setProgress(0);
    started.current = Date.now();
    setEta(null);
    try {
      const probes: VideoInfo[] = [];
      for (const f of files) probes.push(await probeFile(f, (x) => setEngine(x)));
      setEngine(null);
      const bytes = await runFfmpeg(
        files,
        (inputs, output) => j.args(inputs, output, probes),
        j.ext,
        (p) => {
          setEngine(null);
          setProgress(p);
          const spent = (Date.now() - started.current) / 1000;
          setEta(p > 0.05 ? Math.round((spent / p) * (1 - p)) : null);
        },
        (f) => setEngine(f),
      );
      const blobUrl = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: j.mime }));
      outUrl.current = blobUrl;
      setOut({ bytes, name: `${baseName(files[0].name) || 'video'}${j.suffix}.${j.ext}`, url: blobUrl, mime: j.mime });
      setStored(true);
    } catch (e) {
      console.error('[shootcut] video job failed', e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : e);
      if (!(e instanceof Error && /terminate|called FFmpeg\.terminate/i.test(e.message))) setError(files.some((f) => f.size > LARGE) ? 'vidFailedLarge' : 'vidFailed');
    } finally {
      setEngine(null);
      setProgress(null);
    }
  };

  const cancel = () => {
    cancelEngine();
    setEngine(null);
    setProgress(null);
  };

  const total = files.reduce((n, f) => n + f.size, 0);

  return (
    <ToolPage title={t(title)} desc={t(desc)}>
      <Dropzone kind="video" multiple={multiple} compact={files.length > 0} onFiles={add} onRejected={() => setSkipped(true)} />
      {skipped && <Notice kind="error">{t('vidNotVideo')}</Notice>}
      {stored === false && files.length === 0 && <p className="hint">{t('vidEngineOnce')}</p>}
      {files.length > 0 && (
        <div className="split">
          <div className="panel">
            <ul className="vid-files">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="vid-file">
                  <span className="vid-file-name" dir="auto" title={f.name}>{f.name}</span>
                  <span className="muted"><bdi>{formatBytes(f.size)}</bdi></span>
                  {multiple && files.length > 1 && (
                    <>
                      <button type="button" className="icon-btn" aria-label={t('moveUp')} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={16} aria-hidden /></button>
                      <button type="button" className="icon-btn" aria-label={t('moveDown')} disabled={i === files.length - 1} onClick={() => move(i, 1)}><ArrowDown size={16} aria-hidden /></button>
                    </>
                  )}
                  <button type="button" className="icon-btn" aria-label={t('remove')} onClick={() => { forget(); setFiles((p) => p.filter((_, k) => k !== i)); }}><X size={16} aria-hidden /></button>
                </li>
              ))}
            </ul>
            {info && (
              <p className="muted">
                <bdi>{info.width}×{info.height}</bdi> · <bdi>{formatTime(info.duration)}</bdi>
              </p>
            )}
            {total > LARGE && <Notice kind="info">{t('vidLargeWarn')}</Notice>}
            {options(ctx)}
            {note && <p className="hint">{note}</p>}
            {stored === false && <p className="hint">{t('vidEngineOnce')}</p>}
            <div className="actions">
              <button type="button" className="btn btn-primary" data-save disabled={!j || busy} onClick={run}>
                {engine !== null ? `${t('vidEngineLoading')} ${Math.round(engine * 100)}%` : progress !== null ? `${t('processing')} ${Math.round(progress * 100)}%` : t(action)}
              </button>
              {busy && (
                <button type="button" className="btn" onClick={cancel}>
                  {t('vidCancel')}
                </button>
              )}
            </div>
            {progress !== null && (
              <div className="vid-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                <div style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
            {eta !== null && progress !== null && <p className="hint"><bdi>{formatTime(eta)}</bdi> {t('vidRemaining')}</p>}
            {error && <Notice kind="error">{t(error as Key)}</Notice>}
          </div>
          <div className="preview-box">
            {out ? (
              <div className="vid-out">
                <Notice kind="success">{t('vidDone')}</Notice>
                {result === 'video' && <video src={out.url} controls playsInline className="vid-player" />}
                {result === 'audio' && <audio src={out.url} controls className="vid-audio" />}
                {result === 'image' && <img src={out.url} alt="" className="vid-img" />}
                <p className="muted">
                  <bdi>{out.name}</bdi> · <bdi>{formatBytes(total)} → {formatBytes(out.bytes.length)}</bdi>
                </p>
                <button type="button" className="btn btn-primary" onClick={() => downloadBytes(out.bytes, out.name, out.mime)}>
                  {t('imgDownload')}
                </button>
              </div>
            ) : url ? (
              <div className="vid-stage">
                <video ref={player} src={url} controls playsInline className="vid-player" />
                {overlay?.(ctx)}
              </div>
            ) : (
              <p className="muted">{t('imgNothingYet')}</p>
            )}
          </div>
        </div>
      )}
    </ToolPage>
  );
}
