import { useState } from 'react';
import { useI18n } from '../i18n';
import { Checkbox, Field } from '../components/Fields';
import { VideoTool } from '../components/VideoTool';
import { AUDIO_MIME, audioMergeArgs, audioTrimArgs, parseTime, formatTime, polishArgs, type AudioFormat } from '../lib/video/args';

const FORMATS: AudioFormat[] = ['mp3', 'm4a', 'wav', 'ogg', 'flac'];
const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(/،/g, '.').replace(/,/g, '.')) || 0);

/** Format and quality pickers shared by the sound tools. */
function OutputFields({ format, kbps, setFormat, setKbps }: { format: AudioFormat; kbps: number; setFormat: (f: AudioFormat) => void; setKbps: (n: number) => void }) {
  const { t } = useI18n();
  const lossless = format === 'wav' || format === 'flac';
  return (
    <>
      <Field label={t('vidFormat')}>
        {(id) => (
          <select id={id} className="input" value={format} onChange={(e) => setFormat(e.target.value as AudioFormat)}>
            {FORMATS.map((f) => (
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
  );
}

export function AudConvertTool() {
  const [format, setFormat] = useState<AudioFormat>('mp3');
  const [kbps, setKbps] = useState(192);
  return (
    <VideoTool
      media="audio"
      title="toolAudConvert"
      desc="toolAudConvertDesc"
      result="audio"
      job={() => ({ ext: format, mime: AUDIO_MIME[format], suffix: '', args: (i, o) => polishArgs(i[0], o, { volumeDb: 0, normalize: false, fadeIn: 0, fadeOut: 0, speed: 1, mono: false, duration: 0 }, format, kbps) })}
      options={() => <OutputFields format={format} kbps={kbps} setFormat={setFormat} setKbps={setKbps} />}
    />
  );
}

export function AudTrimTool() {
  const { t } = useI18n();
  const [start, setStart] = useState('0');
  const [end, setEnd] = useState('');
  const [format, setFormat] = useState<AudioFormat>('mp3');
  const [kbps, setKbps] = useState(192);
  return (
    <VideoTool
      media="audio"
      title="toolAudTrim"
      desc="toolAudTrimDesc"
      result="audio"
      job={({ info }) => {
        const s = parseTime(start);
        const e = end.trim() === '' ? info?.duration ?? null : parseTime(end);
        if (s === null || e === null || e <= s || (info && s >= info.duration)) return null;
        return { ext: format, mime: AUDIO_MIME[format], suffix: '-trimmed', args: (i, o) => audioTrimArgs(i[0], o, s, e, format, kbps) };
      }}
      options={({ player, info }) => (
        <>
          <Field label={t('vidStartAt')} hint={t('vidTimeHint')}>
            {(id) => (
              <div className="vid-time">
                <input id={id} className="input" value={start} dir="ltr" inputMode="decimal" onChange={(e) => setStart(e.target.value)} />
                <button type="button" className="btn" onClick={() => player.current && setStart(formatTime(player.current.currentTime))}>{t('audHere')}</button>
              </div>
            )}
          </Field>
          <Field label={t('vidEndAt')}>
            {(id) => (
              <div className="vid-time">
                <input id={id} className="input" value={end} dir="ltr" inputMode="decimal" placeholder={info ? formatTime(info.duration) : ''} onChange={(e) => setEnd(e.target.value)} />
                <button type="button" className="btn" onClick={() => player.current && setEnd(formatTime(player.current.currentTime))}>{t('audHere')}</button>
              </div>
            )}
          </Field>
          <OutputFields format={format} kbps={kbps} setFormat={setFormat} setKbps={setKbps} />
        </>
      )}
    />
  );
}

export function AudMergeTool() {
  const { t } = useI18n();
  const [format, setFormat] = useState<AudioFormat>('mp3');
  const [kbps, setKbps] = useState(192);
  return (
    <VideoTool
      media="audio"
      multiple
      title="toolAudMerge"
      desc="toolAudMergeDesc"
      action="vidMergeStart"
      result="audio"
      job={({ files }) => (files.length < 2 ? null : { ext: format, mime: AUDIO_MIME[format], suffix: '-joined', args: (i, o) => audioMergeArgs(i, o, format, kbps) })}
      options={({ files }) => (
        <>
          {files.length < 2 && <p className="hint">{t('audMergeNeedTwo')}</p>}
          <OutputFields format={format} kbps={kbps} setFormat={setFormat} setKbps={setKbps} />
        </>
      )}
    />
  );
}

export function AudPolishTool() {
  const { t } = useI18n();
  const [volume, setVolume] = useState('0');
  const [normalize, setNormalize] = useState(false);
  const [fadeIn, setFadeIn] = useState('0');
  const [fadeOut, setFadeOut] = useState('0');
  const [speed, setSpeed] = useState('1');
  const [mono, setMono] = useState(false);
  const [format, setFormat] = useState<AudioFormat>('mp3');
  const [kbps, setKbps] = useState(192);
  const sp = num(speed);
  const ok = sp >= 0.25 && sp <= 4 && Math.abs(num(volume)) <= 40 && num(fadeIn) >= 0 && num(fadeOut) >= 0;
  return (
    <VideoTool
      media="audio"
      title="toolAudPolish"
      desc="toolAudPolishDesc"
      result="audio"
      job={({ info }) =>
        ok
          ? {
              ext: format,
              mime: AUDIO_MIME[format],
              suffix: '-improved',
              args: (i, o) => polishArgs(i[0], o, { volumeDb: num(volume), normalize, fadeIn: num(fadeIn), fadeOut: num(fadeOut), speed: sp, mono, duration: info?.duration ?? 0 }, format, kbps),
            }
          : null
      }
      options={() => (
        <>
          <Field label={t('audVolume')} hint={t('audVolumeHint')}>
            {(id) => <input id={id} className="input" type="number" step="1" min={-40} max={40} inputMode="decimal" value={volume} onChange={(e) => setVolume(e.target.value)} />}
          </Field>
          <Checkbox checked={normalize} onChange={setNormalize}>{t('audNormalize')}</Checkbox>
          <Field label={t('audFadeIn')}>
            {(id) => <input id={id} className="input" type="number" step="0.5" min={0} inputMode="decimal" value={fadeIn} onChange={(e) => setFadeIn(e.target.value)} />}
          </Field>
          <Field label={t('audFadeOut')}>
            {(id) => <input id={id} className="input" type="number" step="0.5" min={0} inputMode="decimal" value={fadeOut} onChange={(e) => setFadeOut(e.target.value)} />}
          </Field>
          <Field label={t('vidSpeedValue')} hint={t('audSpeedHint')}>
            {(id) => <input id={id} className="input" type="number" step="0.05" min={0.25} max={4} inputMode="decimal" value={speed} onChange={(e) => setSpeed(e.target.value)} />}
          </Field>
          <Checkbox checked={mono} onChange={setMono}>{t('audMono')}</Checkbox>
          <OutputFields format={format} kbps={kbps} setFormat={setFormat} setKbps={setKbps} />
        </>
      )}
    />
  );
}
