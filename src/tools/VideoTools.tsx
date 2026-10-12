import { useState } from 'react';
import { useI18n, type Key } from '../i18n';
import { Checkbox, Field } from '../components/Fields';
import { VideoTool } from '../components/VideoTool';
import { CropFrame } from '../components/CropFrame';
import {
  ASPECT_RATIO,
  AUDIO_MIME,
  COMPRESS_PRESETS,
  VIDEO_MIME,
  audioArgs,
  compressArgs,
  convertArgs,
  cropArgs,
  cropRect,
  formatTime,
  gifArgs,
  mergeArgs,
  parseTime,
  resizeArgs,
  rotateArgs,
  speedArgs,
  trimArgs,
  type AudioFormat,
  type CropAspect,
  type RotateMode,
  type VideoFormat,
} from '../lib/video/args';

const FORMATS: VideoFormat[] = ['mp4', 'webm', 'mov', 'mkv'];
const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(/،/g, '.').replace(/,/g, '.')) || 0);

function FormatSelect({ value, onChange }: { value: VideoFormat; onChange: (v: VideoFormat) => void }) {
  const { t } = useI18n();
  return (
    <Field label={t('vidFormat')} hint={value === 'webm' ? t('vidWebmSlow') : undefined}>
      {(id) => (
        <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value as VideoFormat)}>
          {FORMATS.map((f) => (
            <option key={f} value={f}>{f.toUpperCase()}</option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function VidConvertTool() {
  const { t } = useI18n();
  const [format, setFormat] = useState<VideoFormat>('mp4');
  const [mute, setMute] = useState(false);
  return (
    <VideoTool
      title="toolVidConvert"
      desc="toolVidConvertDesc"
      job={() => ({ ext: format, mime: VIDEO_MIME[format], suffix: '-converted', args: (i, o) => convertArgs(i[0], o, format, mute) })}
      options={() => (
        <>
          <FormatSelect value={format} onChange={setFormat} />
          <Checkbox checked={mute} onChange={setMute}>{t('vidMute')}</Checkbox>
        </>
      )}
    />
  );
}

export function VidCompressTool() {
  const { t } = useI18n();
  const [presetId, setPresetId] = useState<(typeof COMPRESS_PRESETS)[number]['id']>('whatsapp');
  const preset = COMPRESS_PRESETS.find((p) => p.id === presetId)!;
  const [crf, setCrf] = useState(28);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const [fit, setFit] = useState(true);
  const [target, setTarget] = useState('');
  const [mute, setMute] = useState(false);
  const custom = presetId === 'custom';
  const targetMb = !custom && preset.limitMb && fit ? Math.floor(preset.limitMb * 0.92) : num(target) > 0 ? num(target) : null;
  return (
    <VideoTool
      title="toolVidCompress"
      desc="toolVidCompressDesc"
      job={() => ({
        ext: 'mp4',
        mime: 'video/mp4',
        suffix: '-compressed',
        args: (i, o, probes) =>
          compressArgs(i[0], o, { crf: custom ? crf : preset.crf, maxHeight: custom ? maxHeight : preset.maxHeight, audioKbps: preset.audioKbps, mute, targetMb }, probes[0]),
      })}
      options={() => (
        <>
          <Field label={t('vidPreset')}>
            {(id) => (
              <select id={id} className="input" value={presetId} onChange={(e) => setPresetId(e.target.value as typeof presetId)}>
                {COMPRESS_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{t(`vidPreset_${p.id}` as Key)}</option>
                ))}
              </select>
            )}
          </Field>
          {!custom && preset.limitMb && (
            <Checkbox checked={fit} onChange={setFit}>
              {t('vidFitLimit')} <bdi>{preset.limitMb} MB</bdi>
            </Checkbox>
          )}
          {custom && (
            <>
              <Field label={`${t('vidQuality')}: ${crf}`} hint={t('vidQualityHint')}>
                {(id) => <input id={id} className="input" type="range" min={18} max={38} value={crf} onChange={(e) => setCrf(Number(e.target.value))} />}
              </Field>
              <Field label={t('vidMaxHeight')}>
                {(id) => (
                  <select id={id} className="input" value={maxHeight ?? ''} onChange={(e) => setMaxHeight(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">{t('vidOriginal')}</option>
                    {[1080, 720, 480, 360].map((h) => (
                      <option key={h} value={h}>{h}p</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label={t('vidTargetSize')} hint={t('vidTargetHint')}>
                {(id) => <input id={id} className="input" type="number" min={1} inputMode="decimal" value={target} placeholder="25" onChange={(e) => setTarget(e.target.value)} />}
              </Field>
            </>
          )}
          <Checkbox checked={mute} onChange={setMute}>{t('vidMute')}</Checkbox>
        </>
      )}
    />
  );
}

export function VidTrimTool() {
  const { t } = useI18n();
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState('');
  const [fast, setFast] = useState(true);
  return (
    <VideoTool
      title="toolVidTrim"
      desc="toolVidTrimDesc"
      job={({ files, info }) => {
        const s = parseTime(start);
        const e = end.trim() === '' ? info?.duration ?? null : parseTime(end);
        if (s === null || e === null || e <= s || (info && s >= info.duration)) return null;
        const ext = /\.(mp4|mov|mkv|webm)$/i.exec(files[0].name)?.[1].toLowerCase() as VideoFormat | undefined;
        const format: VideoFormat = fast ? ext ?? 'mp4' : 'mp4';
        return { ext: format, mime: VIDEO_MIME[format], suffix: '-trimmed', args: (i, o) => trimArgs(i[0], o, s, e, fast, format) };
      }}
      options={({ player, info }) => (
        <>
          <Field label={t('vidStartAt')} hint={t('vidTimeHint')}>
            {(id) => (
              <div className="vid-time">
                <input id={id} className="input" value={start} dir="ltr" inputMode="decimal" onChange={(e) => setStart(e.target.value)} />
                <button type="button" className="btn" onClick={() => player.current && setStart(formatTime(player.current.currentTime))}>{t('vidHere')}</button>
              </div>
            )}
          </Field>
          <Field label={t('vidEndAt')}>
            {(id) => (
              <div className="vid-time">
                <input id={id} className="input" value={end} dir="ltr" inputMode="decimal" placeholder={info ? formatTime(info.duration) : ''} onChange={(e) => setEnd(e.target.value)} />
                <button type="button" className="btn" onClick={() => player.current && setEnd(formatTime(player.current.currentTime))}>{t('vidHere')}</button>
              </div>
            )}
          </Field>
          <Field label={t('vidCutMode')} hint={t(fast ? 'vidCutFastHint' : 'vidCutPreciseHint')}>
            {(id) => (
              <select id={id} className="input" value={fast ? 'fast' : 'precise'} onChange={(e) => setFast(e.target.value === 'fast')}>
                <option value="fast">{t('vidCutFast')}</option>
                <option value="precise">{t('vidCutPrecise')}</option>
              </select>
            )}
          </Field>
        </>
      )}
    />
  );
}

export function VidMergeTool() {
  const { t } = useI18n();
  return (
    <VideoTool
      title="toolVidMerge"
      desc="toolVidMergeDesc"
      multiple
      action="vidMergeStart"
      note={t('vidMergeNote')}
      job={({ files }) =>
        files.length < 2
          ? null
          : {
              ext: 'mp4',
              mime: 'video/mp4',
              suffix: '-merged',
              args: (i, o, probes) => {
                const first = probes[0];
                return mergeArgs(i, o, { width: first.width || 1280, height: first.height || 720 }, probes.every((p) => p.hasAudio), 'mp4');
              },
            }
      }
      options={({ files }) => (files.length < 2 ? <p className="hint">{t('vidMergeNeedTwo')}</p> : null)}
    />
  );
}

export function VidCropTool() {
  const { t } = useI18n();
  const [aspect, setAspect] = useState<CropAspect>('portrait916');
  const [px, setPx] = useState(50);
  const [py, setPy] = useState(50);
  const [c, setC] = useState({ x: '0', y: '0', w: '', h: '' });
  const rectFor = (info: { width: number; height: number }) => {
    if (aspect !== 'custom') return cropRect(info.width, info.height, ASPECT_RATIO[aspect], px / 100, py / 100);
    const w = Math.min(info.width, num(c.w) || info.width);
    const h = Math.min(info.height, num(c.h) || info.height);
    return { x: Math.min(info.width - w, Math.max(0, num(c.x))), y: Math.min(info.height - h, Math.max(0, num(c.y))), w, h };
  };
  return (
    <VideoTool
      title="toolVidCrop"
      desc="toolVidCropDesc"
      job={({ info }) => {
        if (!info) return null;
        const r = rectFor(info);
        return { ext: 'mp4', mime: 'video/mp4', suffix: '-cropped', args: (i, o) => cropArgs(i[0], o, r, 'mp4') };
      }}
      overlay={({ info }) => {
        if (!info) return null;
        const r = rectFor(info);
        const box = { x: r.x / info.width, y: r.y / info.height, w: r.w / info.width, h: r.h / info.height };
        return (
          <CropFrame
            box={box}
            label={t('cropFrameLabel')}
            resizable={aspect === 'custom'}
            onChange={(b) => {
              if (aspect === 'custom') {
                setC({ x: String(Math.round(b.x * info.width)), y: String(Math.round(b.y * info.height)), w: String(Math.round(b.w * info.width)), h: String(Math.round(b.h * info.height)) });
              } else {
                // the shape is fixed: only the place changes
                setPx(b.w >= 0.999 ? 50 : Math.round(Math.min(1, Math.max(0, b.x / (1 - b.w))) * 100));
                setPy(b.h >= 0.999 ? 50 : Math.round(Math.min(1, Math.max(0, b.y / (1 - b.h))) * 100));
              }
            }}
          />
        );
      }}
      options={({ info }) => (
        <>
          <Field label={t('vidAspect')}>
            {(id) => (
              <select id={id} className="input" value={aspect} onChange={(e) => {
                  const v = e.target.value as CropAspect;
                  if (v === 'custom' && info) {
                    const r = rectFor(info);
                    setC({ x: String(r.x), y: String(r.y), w: String(r.w), h: String(r.h) });
                  }
                  setAspect(v);
                }}>
                {(['portrait916', 'square', 'portrait45', 'landscape169', 'landscape43', 'custom'] as CropAspect[]).map((a) => (
                  <option key={a} value={a}>{t(`vidAspect_${a}` as Key)}</option>
                ))}
              </select>
            )}
          </Field>
          {aspect !== 'custom' ? (
            <>
              <Field label={`${t('vidPosX')}: ${px}%`}>{(id) => <input id={id} className="input" type="range" min={0} max={100} value={px} onChange={(e) => setPx(Number(e.target.value))} />}</Field>
              <Field label={`${t('vidPosY')}: ${py}%`}>{(id) => <input id={id} className="input" type="range" min={0} max={100} value={py} onChange={(e) => setPy(Number(e.target.value))} />}</Field>
            </>
          ) : (
            <div className="vid-grid">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <Field key={k} label={t(`vidCrop_${k}` as Key)}>
                  {(id) => <input id={id} className="input" type="number" min={0} inputMode="numeric" value={c[k]} placeholder={k === 'w' ? String(info?.width ?? '') : k === 'h' ? String(info?.height ?? '') : '0'} onChange={(e) => setC({ ...c, [k]: e.target.value })} />}
                </Field>
              ))}
            </div>
          )}
          <p className="hint">{t('vidCropDragHint')}</p>
          {!info && <p className="hint">{t('vidReadingSize')}</p>}
        </>
      )}
    />
  );
}

export function VidRotateTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<RotateMode>('cw');
  return (
    <VideoTool
      title="toolVidRotate"
      desc="toolVidRotateDesc"
      job={() => ({ ext: 'mp4', mime: 'video/mp4', suffix: '-rotated', args: (i, o) => rotateArgs(i[0], o, mode, 'mp4') })}
      options={() => (
        <Field label={t('vidRotateMode')}>
          {(id) => (
            <select id={id} className="input" value={mode} onChange={(e) => setMode(e.target.value as RotateMode)}>
              {(['cw', 'ccw', 'flip180', 'mirror', 'flipv'] as RotateMode[]).map((m) => (
                <option key={m} value={m}>{t(`vidRotate_${m}` as Key)}</option>
              ))}
            </select>
          )}
        </Field>
      )}
    />
  );
}

export function VidSpeedTool() {
  const { t } = useI18n();
  const [speed, setSpeed] = useState('2');
  const v = num(speed);
  const ok = v >= 0.25 && v <= 8;
  return (
    <VideoTool
      title="toolVidSpeed"
      desc="toolVidSpeedDesc"
      job={() => (ok ? { ext: 'mp4', mime: 'video/mp4', suffix: `-${v}x`, args: (i, o, probes) => speedArgs(i[0], o, v, probes[0].hasAudio !== false, 'mp4') } : null)}
      options={() => (
        <>
          <div className="chips">
            {['0.25', '0.5', '0.75', '1.5', '2', '3', '4'].map((s) => (
              <button key={s} type="button" className={`chip${speed === s ? ' is-active' : ''}`} onClick={() => setSpeed(s)}>
                <bdi>{s}×</bdi>
              </button>
            ))}
          </div>
          <Field label={t('vidSpeedValue')} hint={t('vidSpeedHint')}>
            {(id) => <input id={id} className="input" type="number" step="0.05" min={0.25} max={8} inputMode="decimal" value={speed} onChange={(e) => setSpeed(e.target.value)} />}
          </Field>
        </>
      )}
    />
  );
}

export function VidResizeTool() {
  const { t } = useI18n();
  const [height, setHeight] = useState('720');
  const [fps, setFps] = useState('');
  return (
    <VideoTool
      title="toolVidResize"
      desc="toolVidResizeDesc"
      job={() => (height || fps ? { ext: 'mp4', mime: 'video/mp4', suffix: '-resized', args: (i, o) => resizeArgs(i[0], o, { height: height ? Number(height) : null, fps: fps ? Number(fps) : null }, 'mp4') } : null)}
      options={() => (
        <>
          <Field label={t('vidHeight')} hint={t('vidHeightHint')}>
            {(id) => (
              <select id={id} className="input" value={height} onChange={(e) => setHeight(e.target.value)}>
                <option value="">{t('vidOriginal')}</option>
                {[2160, 1440, 1080, 720, 540, 480, 360, 240].map((h) => (
                  <option key={h} value={h}>{h}p</option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('vidFps')}>
            {(id) => (
              <select id={id} className="input" value={fps} onChange={(e) => setFps(e.target.value)}>
                <option value="">{t('vidOriginal')}</option>
                {[60, 30, 25, 24, 15, 12].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}
          </Field>
        </>
      )}
    />
  );
}

export function VidAudioTool() {
  const { t } = useI18n();
  const [format, setFormat] = useState<AudioFormat>('mp3');
  const [kbps, setKbps] = useState(192);
  const lossless = format === 'wav' || format === 'flac';
  return (
    <VideoTool
      title="toolVidAudio"
      desc="toolVidAudioDesc"
      result="audio"
      job={() => ({ ext: format, mime: AUDIO_MIME[format], suffix: '', args: (i, o) => audioArgs(i[0], o, format, kbps) })}
      options={() => (
        <>
          <Field label={t('vidFormat')}>
            {(id) => (
              <select id={id} className="input" value={format} onChange={(e) => setFormat(e.target.value as AudioFormat)}>
                {(['mp3', 'm4a', 'wav', 'ogg', 'flac'] as AudioFormat[]).map((f) => (
                  <option key={f} value={f}>{f.toUpperCase()}</option>
                ))}
              </select>
            )}
          </Field>
          {!lossless && (
            <Field label={t('vidBitrate')}>
              {(id) => (
                <select id={id} className="input" value={kbps} onChange={(e) => setKbps(Number(e.target.value))}>
                  {[96, 128, 192, 256, 320].map((b) => (
                    <option key={b} value={b}>{b} kbps</option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </>
      )}
    />
  );
}

export function VidGifTool() {
  const { t } = useI18n();
  const [start, setStart] = useState('0');
  const [dur, setDur] = useState('5');
  const [fps, setFps] = useState(12);
  const [width, setWidth] = useState(480);
  const s = parseTime(start);
  const d = num(dur);
  return (
    <VideoTool
      title="toolVidGif"
      desc="toolVidGifDesc"
      result="image"
      note={t('vidGifNote')}
      job={() => (s === null || d <= 0 || d > 30 ? null : { ext: 'gif', mime: 'image/gif', suffix: '', args: (i, o) => gifArgs(i[0], o, { start: s, duration: d, fps, width }) })}
      options={({ player }) => (
        <>
          <Field label={t('vidStartAt')} hint={t('vidTimeHint')}>
            {(id) => (
              <div className="vid-time">
                <input id={id} className="input" value={start} dir="ltr" inputMode="decimal" onChange={(e) => setStart(e.target.value)} />
                <button type="button" className="btn" onClick={() => player.current && setStart(formatTime(player.current.currentTime))}>{t('vidHere')}</button>
              </div>
            )}
          </Field>
          <Field label={t('vidGifLength')} hint={d > 30 ? t('vidGifTooLong') : undefined}>
            {(id) => <input id={id} className="input" type="number" min={1} max={30} inputMode="decimal" value={dur} onChange={(e) => setDur(e.target.value)} />}
          </Field>
          <Field label={`${t('vidFps')}: ${fps}`}>{(id) => <input id={id} className="input" type="range" min={5} max={20} value={fps} onChange={(e) => setFps(Number(e.target.value))} />}</Field>
          <Field label={`${t('vidWidth')}: ${width}px`}>{(id) => <input id={id} className="input" type="range" min={240} max={720} step={20} value={width} onChange={(e) => setWidth(Number(e.target.value))} />}</Field>
        </>
      )}
    />
  );
}
