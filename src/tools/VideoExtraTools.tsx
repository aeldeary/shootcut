import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Field, MediaKeepBar } from '../components/Fields';
import { useKeptMedia } from '../hooks/useKeptMedia';
import { Notice, ToolPage } from '../components/Shell';
import { baseName, canvasToBytes, createCanvas, downloadBytes, formatBytes } from '../lib/pdf';
import { zipFiles } from '../lib/ops/export';
import { engineCached, probeFile } from '../lib/video/engine';
import { formatTime, type VideoInfo } from '../lib/video/args';

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener('seeked', done);
      resolve();
    };
    v.addEventListener('seeked', done);
    v.currentTime = t;
  });
}

/** Saves single frames, or one frame every few seconds as a ZIP. Uses the browser's own player — no engine needed. */
export function VidThumbTool() {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [fmt, setFmt] = useState<'png' | 'jpeg'>('jpeg');
  const [every, setEvery] = useState('5');
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const keep = useKeptMedia('video', (kept) => setFile((old) => old ?? kept[0]));

  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    setBad(false);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const grab = async (): Promise<Uint8Array> => {
    const v = video.current!;
    const c = createCanvas(v.videoWidth, v.videoHeight);
    (c.getContext('2d') as CanvasRenderingContext2D).drawImage(v, 0, 0);
    return canvasToBytes(c, fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92);
  };
  const ext = fmt === 'png' ? 'png' : 'jpg';
  const name = (sec: number) => `${baseName(file!.name)}-${formatTime(sec).replace(/[:.]/g, '-')}.${ext}`;

  const saveHere = async () => {
    const v = video.current!;
    downloadBytes(await grab(), name(v.currentTime), fmt === 'png' ? 'image/png' : 'image/jpeg');
  };
  const saveMany = async () => {
    const v = video.current!;
    const step = Math.max(0.5, Number(every.replace(',', '.')) || 5);
    const keep = v.currentTime;
    const entries: { name: string; bytes: Uint8Array }[] = [];
    for (let s = 0; s < v.duration; s += step) {
      setBusy(s / v.duration);
      await seek(v, Math.min(s, v.duration - 0.05));
      entries.push({ name: name(s), bytes: await grab() });
    }
    await seek(v, keep);
    setBusy(null);
    downloadBytes(zipFiles(entries), `${baseName(file!.name)}-frames.zip`, 'application/zip');
  };

  return (
    <ToolPage title={t('toolVidThumb')} desc={t('toolVidThumbDesc')}>
      <Dropzone kind="video" compact={!!file} onFiles={(l) => { setFile(l[0]); keep([l[0]]); }} onRejected={() => undefined} />
      {file && <MediaKeepBar kind="video" onDeleted={() => setFile(null)} />}
      {file && url && (
        <div className="split">
          <div className="panel">
            <Field label={t('imgFormat')}>
              {(id) => (
                <select id={id} className="input" value={fmt} onChange={(e) => setFmt(e.target.value as 'png' | 'jpeg')}>
                  <option value="jpeg">JPG</option>
                  <option value="png">PNG</option>
                </select>
              )}
            </Field>
            <div className="actions">
              <button type="button" className="btn btn-primary" disabled={bad || busy !== null} onClick={saveHere}>{t('vidSaveFrame')}</button>
            </div>
            <Field label={t('vidEverySeconds')}>
              {(id) => <input id={id} className="input" type="number" min={0.5} step={0.5} inputMode="decimal" value={every} onChange={(e) => setEvery(e.target.value)} />}
            </Field>
            <div className="actions">
              <button type="button" className="btn" disabled={bad || busy !== null} onClick={saveMany}>
                {busy !== null ? `${t('processing')} ${Math.round(busy * 100)}%` : t('vidSaveFrames')}
              </button>
            </div>
            {bad && <Notice kind="error">{t('vidCannotPlay')}</Notice>}
          </div>
          <div className="preview-box">
            <video ref={video} src={url} controls playsInline className="vid-player" onError={() => setBad(true)} />
          </div>
        </div>
      )}
    </ToolPage>
  );
}

/** Describes a video: size, duration, codecs, frame rate, bitrate. */
export function VidInfoTool() {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [stored, setStored] = useState<boolean | null>(null);
  const keep = useKeptMedia('video', (kept) => setFile((old) => old ?? kept[0]));
  useEffect(() => {
    engineCached().then(setStored);
  }, []);
  useEffect(() => {
    if (!file) return;
    let live = true;
    setInfo(null);
    setFailed(false);
    probeFile(file)
      .then((i) => live && setInfo(i))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [file]);

  const rows: [string, string][] = info
    ? [
        [t('vidInfoName'), file!.name],
        [t('vidInfoSize'), formatBytes(file!.size)],
        [t('vidInfoDuration'), formatTime(info.duration)],
        [t('vidInfoResolution'), info.width ? `${info.width}×${info.height}` : '—'],
        [t('vidFps'), info.fps ? String(info.fps) : '—'],
        [t('vidInfoVideoCodec'), info.videoCodec ?? '—'],
        [t('vidInfoAudioCodec'), info.audioCodec ?? t('vidInfoNoAudio')],
        [t('vidInfoBitrate'), info.bitrateKbps ? `${info.bitrateKbps} kbps` : '—'],
      ]
    : [];
  return (
    <ToolPage title={t('toolVidInfo')} desc={t('toolVidInfoDesc')}>
      <Dropzone kind="video" compact={!!file} onFiles={(l) => { setFile(l[0]); keep([l[0]]); }} onRejected={() => undefined} />
      {file && <MediaKeepBar kind="video" onDeleted={() => setFile(null)} />}
      {stored === false && !file && <p className="hint">{t('vidEngineOnce')}</p>}
      {file && !info && !failed && <p className="muted">{t('vidInfoReading')}</p>}
      {failed && <Notice kind="error">{t('vidFailed')}</Notice>}
      {info && (
        <table className="info-table">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td dir="auto"><bdi>{v}</bdi></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ToolPage>
  );
}
