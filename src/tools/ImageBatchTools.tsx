import { useState } from 'react';
import { useI18n } from '../i18n';
import { Checkbox, Field } from '../components/Fields';
import { ImageBatch } from '../components/ImageBatch';
import { decodeFile } from '../lib/img';
import { adjustCanvas, enlargedFits, upscaleCanvas, fitToSize, fitWithin, NO_ADJUST, resizeCanvas, rotateCanvas, watermarkCanvas, type Adjust, type Place } from '../lib/ops/imgops';
import type { CanvasLike } from '../lib/pdf';

const num = (v: string) => (v.trim() === '' ? 0 : Math.max(0, Math.round(Number(v)) || 0));

export function ImgCompressTool() {
  const { t } = useI18n();
  const [maxSide, setMaxSide] = useState('');
  const limit = num(maxSide);
  return (
    <ImageBatch
      title="toolImgCompress"
      desc="toolImgCompressDesc"
      suffix="-compressed"
      defaultFormat="jpeg"
      defaultQuality={70}
      note={t('imgStripNote')}
      deps={[limit]}
      process={(src) => {
        if (!limit) return src;
        const s = fitWithin(src.width, src.height, limit, limit);
        return s.width < src.width ? resizeCanvas(src, s.width, s.height) : src;
      }}
      options={
        <Field label={t('imgMaxSide')}>
          {(id) => <input id={id} className="input" type="number" min={0} inputMode="numeric" value={maxSide} placeholder="1920" onChange={(e) => setMaxSide(e.target.value)} />}
        </Field>
      }
    />
  );
}

export function ImgResizeTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<'px' | 'pct'>('px');
  const [w, setW] = useState('1080');
  const [h, setH] = useState('');
  const [keep, setKeep] = useState(true);
  const [pct, setPct] = useState(50);
  const wn = num(w);
  const hn = num(h);
  const ready = mode === 'pct' ? pct > 0 : wn > 0 || hn > 0;
  const process = (src: CanvasLike): CanvasLike => {
    if (mode === 'pct') return resizeCanvas(src, (src.width * pct) / 100, (src.height * pct) / 100);
    if (!keep) return resizeCanvas(src, wn || src.width, hn || src.height);
    const k = wn && hn ? Math.min(wn / src.width, hn / src.height) : wn ? wn / src.width : hn / src.height;
    return resizeCanvas(src, src.width * k, src.height * k);
  };
  return (
    <ImageBatch
      title="toolImgResize"
      desc="toolImgResizeDesc"
      suffix="-resized"
      ready={ready}
      note={t('imgEnlargeNote')}
      process={process}
      options={
        <>
          <div className="tabs" role="tablist">
            {(['px', 'pct'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} className={`tab${mode === m ? ' is-active' : ''}`} onClick={() => setMode(m)}>
                {t(m === 'px' ? 'imgResizeByPx' : 'imgResizeByPct')}
              </button>
            ))}
          </div>
          {mode === 'px' ? (
            <>
              <div className="grid-2">
                <Field label={t('imgWidth')}>{(id) => <input id={id} className="input" type="number" min={1} inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} />}</Field>
                <Field label={t('imgHeight')}>{(id) => <input id={id} className="input" type="number" min={1} inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} />}</Field>
              </div>
              <Checkbox checked={keep} onChange={setKeep}>{t('imgKeepRatio')}</Checkbox>
            </>
          ) : (
            <Field label={`${t('imgPercent')}: ${pct}%`}>{(id) => <input id={id} className="input" type="range" min={5} max={400} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} />}</Field>
          )}
        </>
      }
    />
  );
}

export function ImgRotateTool() {
  const { t } = useI18n();
  const [deg, setDeg] = useState(0);
  const [fh, setFh] = useState(false);
  const [fv, setFv] = useState(false);
  return (
    <ImageBatch
      title="toolImgRotate"
      desc="toolImgRotateDesc"
      suffix="-rotated"
      preview
      deps={[deg, fh, fv]}
      process={(src) => rotateCanvas(src, deg, fh, fv)}
      options={
        <div className="chips">
          <button type="button" className="chip" onClick={() => setDeg((d) => (d + 90) % 360)}>{t('imgRotRight')}</button>
          <button type="button" className="chip" onClick={() => setDeg((d) => (d + 270) % 360)}>{t('imgRotLeft')}</button>
          <button type="button" className="chip" aria-pressed={fh} onClick={() => setFh((v) => !v)}>{t('imgFlipH')}</button>
          <button type="button" className="chip" aria-pressed={fv} onClick={() => setFv((v) => !v)}>{t('imgFlipV')}</button>
        </div>
      }
    />
  );
}

export function ImgAdjustTool() {
  const { t } = useI18n();
  const [a, setA] = useState<Adjust>(NO_ADJUST);
  const set = (k: keyof Adjust) => (e: { target: { value: string } }) => setA((p) => ({ ...p, [k]: Number(e.target.value) }));
  const slider = (k: 'brightness' | 'contrast' | 'saturation' | 'grayscale' | 'sepia' | 'blur', label: Parameters<typeof t>[0], min: number, max: number) => (
    <Field label={`${t(label)}: ${a[k]}`}>{(id) => <input id={id} className="input" type="range" min={min} max={max} value={a[k]} onChange={set(k)} />}</Field>
  );
  return (
    <ImageBatch
      title="toolImgAdjust"
      desc="toolImgAdjustDesc"
      suffix="-adjusted"
      preview
      deps={[a]}
      process={(src) => adjustCanvas(src, a)}
      options={
        <>
          {slider('brightness', 'imgBrightness', -100, 100)}
          {slider('contrast', 'imgContrast', -100, 100)}
          {slider('saturation', 'imgSaturation', -100, 100)}
          {slider('grayscale', 'imgGrayscale', 0, 100)}
          {slider('sepia', 'imgSepia', 0, 100)}
          {slider('blur', 'imgBlur', 0, 5)}
          <Checkbox checked={!!a.invert} onChange={(v) => setA((p) => ({ ...p, invert: v }))}>{t('imgInvert')}</Checkbox>
          <button type="button" className="btn btn-ghost" onClick={() => setA(NO_ADJUST)}>{t('imgResetAdjust')}</button>
        </>
      }
    />
  );
}

export function ImgConvertTool() {
  return <ImageBatch title="toolImgConvert" desc="toolImgConvertDesc" suffix="" defaultFormat="jpeg" process={(src) => src} options={null} />;
}

export const SOCIAL_SIZES: { id: string; w: number; h: number; en: string; ar: string }[] = [
  { id: 'ig-post', w: 1080, h: 1080, en: 'Instagram post (square)', ar: 'منشور إنستغرام (مربع)' },
  { id: 'ig-portrait', w: 1080, h: 1350, en: 'Instagram post (portrait)', ar: 'منشور إنستغرام (طولي)' },
  { id: 'story', w: 1080, h: 1920, en: 'Story or Reel, TikTok, WhatsApp status', ar: 'ستوري أو ريلز أو تيك توك أو حالة واتساب' },
  { id: 'fb-post', w: 1200, h: 630, en: 'Facebook post / link picture', ar: 'منشور فيسبوك / صورة رابط' },
  { id: 'x-post', w: 1600, h: 900, en: 'X (Twitter) post', ar: 'منشور إكس (تويتر)' },
  { id: 'linkedin', w: 1200, h: 627, en: 'LinkedIn post', ar: 'منشور لينكدإن' },
  { id: 'yt-thumb', w: 1280, h: 720, en: 'YouTube thumbnail', ar: 'صورة يوتيوب المصغّرة' },
  { id: 'yt-banner', w: 2560, h: 1440, en: 'YouTube channel banner', ar: 'غلاف قناة يوتيوب' },
  { id: 'profile', w: 400, h: 400, en: 'Profile picture', ar: 'صورة الحساب الشخصي' },
];

export function ImgSocialTool() {
  const { t, lang } = useI18n();
  const [size, setSize] = useState('ig-post');
  const [mode, setMode] = useState<'cover' | 'contain'>('cover');
  const [bg, setBg] = useState('#ffffff');
  const sz = SOCIAL_SIZES.find((x) => x.id === size)!;
  return (
    <ImageBatch
      title="toolImgSocial"
      desc="toolImgSocialDesc"
      suffix={`-${sz.w}x${sz.h}`}
      preview
      deps={[size, mode, bg]}
      process={(src) => fitToSize(src, sz.w, sz.h, mode, bg)}
      defaultFormat="jpeg"
      options={
        <>
          <Field label={t('imgSocialSize')}>
            {(id) => (
              <select id={id} className="input" value={size} onChange={(e) => setSize(e.target.value)}>
                {SOCIAL_SIZES.map((s) => (
                  <option key={s.id} value={s.id}>{`${lang === 'ar' ? s.ar : s.en} — ${s.w}×${s.h}`}</option>
                ))}
              </select>
            )}
          </Field>
          <fieldset className="choices">
            <label className="check"><input type="radio" name="fit" checked={mode === 'cover'} onChange={() => setMode('cover')} /> {t('imgFitFill')}</label>
            <label className="check"><input type="radio" name="fit" checked={mode === 'contain'} onChange={() => setMode('contain')} /> {t('imgFitContain')}</label>
          </fieldset>
          {mode === 'contain' && <Field label={t('imgBarColor')}>{(id) => <input id={id} className="input color" type="color" value={bg} onChange={(e) => setBg(e.target.value)} />}</Field>}
        </>
      }
    />
  );
}

const PLACES: Place[] = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];

export function ImgWatermarkTool() {
  const { t } = useI18n();
  const [kind, setKind] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('Shootcut');
  const [logo, setLogo] = useState<CanvasLike | null>(null);
  const [logoName, setLogoName] = useState('');
  const [size, setSize] = useState(30);
  const [opacity, setOpacity] = useState(0.7);
  const [rotation, setRotation] = useState(0);
  const [place, setPlace] = useState<Place>('bottom-right');
  const [color, setColor] = useState('#ffffff');
  const ready = kind === 'text' ? text.trim() !== '' : !!logo;
  return (
    <ImageBatch
      title="toolImgWatermark"
      desc="toolImgWatermarkDesc"
      suffix="-marked"
      preview
      ready={ready}
      deps={[kind, text, logo, size, opacity, rotation, place, color]}
      process={(src) => watermarkCanvas(src, { text: kind === 'text' ? text : undefined, image: kind === 'image' ? (logo ?? undefined) : undefined, size, opacity, rotation, place, color })}
      options={
        <>
          <div className="tabs" role="tablist">
            {(['text', 'image'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} className={`tab${kind === k ? ' is-active' : ''}`} onClick={() => setKind(k)}>
                {t(k === 'text' ? 'imgWmText' : 'imgWmImage')}
              </button>
            ))}
          </div>
          {kind === 'text' ? (
            <div className="grid-2">
              <Field label={t('imgWmTextLabel')}>{(id) => <input id={id} className="input" dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
              <Field label={t('imgWmColor')}>{(id) => <input id={id} className="input color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />}</Field>
            </div>
          ) : (
            <Field label={t('imgWmLogoLabel')} hint={logoName || undefined}>
              {(id) => (
                <input
                  id={id}
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setLogoName(f.name);
                    setLogo(await decodeFile(f).catch(() => null));
                  }}
                />
              )}
            </Field>
          )}
          <div className="grid-3">
            <Field label={`${t('imgWmSize')}: ${size}`}>{(id) => <input id={id} className="input" type="range" min={5} max={90} value={size} onChange={(e) => setSize(Number(e.target.value))} />}</Field>
            <Field label={`${t('imgWmOpacity')}: ${Math.round(opacity * 100)}%`}>{(id) => <input id={id} className="input" type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />}</Field>
            <Field label={`${t('imgWmRotation')}: ${rotation}°`}>{(id) => <input id={id} className="input" type="range" min={-90} max={90} step={5} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />}</Field>
          </div>
          <fieldset className="choices">
            <legend>{t('imgWmPlace')}</legend>
            <div className="pos-grid" dir="ltr">
              {PLACES.map((p) => (
                <button key={p} type="button" aria-label={p} aria-pressed={place === p} className={`pos${place === p ? ' is-active' : ''}`} onClick={() => setPlace(p)} />
              ))}
            </div>
            <Checkbox checked={place === 'tile'} onChange={(v) => setPlace(v ? 'tile' : 'bottom-right')}>{t('imgWmTile')}</Checkbox>
          </fieldset>
        </>
      }
    />
  );
}

export function ImgUpscaleTool() {
  const { t } = useI18n();
  const [factor, setFactor] = useState(2);
  const [sharpen, setSharpen] = useState(40);
  return (
    <ImageBatch
      title="toolImgUpscale"
      desc="toolImgUpscaleDesc"
      suffix={`-${factor}x`}
      note={t('imgUpscaleNote')}
      process={(src) => {
        if (!enlargedFits(src.width, src.height, factor)) throw new Error('too-large');
        return upscaleCanvas(src, factor, sharpen);
      }}
      options={
        <>
          <div className="chips">
            {[2, 3, 4].map((f) => (
              <button key={f} type="button" className={`chip${factor === f ? ' is-active' : ''}`} aria-pressed={factor === f} onClick={() => setFactor(f)}>
                <bdi>{f}×</bdi>
              </button>
            ))}
          </div>
          <Field label={`${t('imgSharpen')}: ${sharpen}%`}>
            {(id) => <input id={id} className="input" type="range" min={0} max={100} step={5} value={sharpen} onChange={(e) => setSharpen(Number(e.target.value))} />}
          </Field>
        </>
      }
    />
  );
}
