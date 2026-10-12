import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Checkbox, Field, FileBar, PageRangeField } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, downloadBytes, openPreview } from '../lib/pdf';
import { STAMP_PRESETS, stampPdf, stampPreviewPdf, type StampOptions, type StampPosition } from '../lib/ops/stamp';
import { parsePageRange } from '../lib/range';
import { useHistory } from '../hooks/useHistory';

type Kind = 'text' | 'numbers' | 'image';

const POSITIONS: StampPosition[] = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

export function StampTool() {
  const { t, lang } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile({ preview: false });
  const [kind, setKind] = useState<Kind>('text');
  const [text, setText] = useState('');
  const [numbersText, setNumbersText] = useState('');
  const [color, setColor] = useState('#b91c1c');
  const [size, setSize] = useState(64);
  const [opacity, setOpacity] = useState(0.6);
  const [rotation, setRotation] = useState(30);
  const [position, setPosition] = useState<StampPosition>('center');
  const [at, setAt] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const [border, setBorder] = useState(false);
  const [range, setRange] = useState('');
  const [image, setImage] = useState<{ bytes: Uint8Array; mime: 'image/png' | 'image/jpeg'; name: string } | null>(null);
  const [startAt, setStartAt] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<Key | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useHistory({ kind, color, size, opacity, rotation, position, at, border, image, startAt }, (s) => { setAt(s.at); setKind(s.kind); setColor(s.color); setSize(s.size); setOpacity(s.opacity); setRotation(s.rotation); setPosition(s.position); setBorder(s.border); setImage(s.image); setStartAt(s.startAt); setDone(false); }, pdf);

  const pages = pdf ? parsePageRange(range, pdf.numPages) : null;
  const numbersTemplate = numbersText || t('stampNumbersDefault');
  const textValue = text || '';

  const options = (): StampOptions => {
    if (kind === 'image') {
      return { kind, image: image ?? undefined, imageWidth: size * 3, opacity, rotation, position, at, pages: pages ?? undefined };
    }
    if (kind === 'numbers') {
      return { kind, text: numbersTemplate, size: Math.min(size, 24), color, opacity: 1, rotation: 0, position: position === 'center' ? 'bottom-center' : position, at, pages: pages ?? undefined, startAt };
    }
    return { kind, text: textValue, size, color, opacity, rotation, position, at, border, pages: pages ?? undefined };
  };

  const ready = !!pdf && !!pages && (kind === 'text' ? textValue.trim() !== '' : kind === 'image' ? !!image : true);

  // live preview: stamp a one-page copy of the first target page
  const token = useRef(0);
  useEffect(() => {
    if (!pdf || !pages || !ready) {
      setPreviewUrl(null);
      return;
    }
    const id = ++token.current;
    const timer = setTimeout(async () => {
      try {
        const bytes = await stampPreviewPdf(pdf.bytes, options());
        const prev = await openPreview(bytes);
        const url = await prev.render(0, 420);
        prev.destroy();
        if (id === token.current) setPreviewUrl(url);
      } catch {
        if (id === token.current) setPreviewUrl(null);
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, kind, text, numbersText, color, size, opacity, rotation, position, at, border, range, image, startAt, ready]);

  const run = async () => {
    if (!pdf || !ready) return;
    setBusy(true);
    setFailed(null);
    setDone(false);
    try {
      downloadBytes(await stampPdf(pdf.bytes, options()), `${baseName(pdf.file.name)}${t('stampSuffix')}.pdf`);
      setDone(true);
    } catch {
      setFailed('errGeneric');
    } finally {
      setBusy(false);
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    const png = file.type === 'image/png' || /\.png$/i.test(file.name);
    const jpg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);
    if (!png && !jpg) {
      setFailed('onlyPngJpeg');
      return;
    }
    setFailed(null);
    setImage({ bytes: new Uint8Array(await file.arrayBuffer()), mime: png ? 'image/png' : 'image/jpeg', name: file.name });
  };

  /** click or drag on the preview: the stamp's centre goes exactly there */
  const pickAt = (e: RPointerEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    setAt({ x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) });
    setPosition('custom');
    setDone(false);
  };

  const choose = (k: Kind) => {
    setKind(k);
    setDone(false);
    if (k === 'text') {
      setSize(64);
      setRotation(30);
      setPosition('center');
    } else if (k === 'image') {
      setSize(40);
      setRotation(0);
      setPosition('bottom-right');
      setOpacity(1);
    } else {
      setSize(11);
      setPosition('bottom-center');
    }
  };

  return (
    <ToolPage title={t('toolStamp')} desc={t('toolStampDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('processing')}</p>}
      {pdf && (
        <div className="split">
          <div className="panel">
            <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setDone(false); }} />
            <div className="tabs" role="tablist">
              {(['text', 'image', 'numbers'] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={kind === k} className={`tab${kind === k ? ' is-active' : ''}`} onClick={() => choose(k)}>
                  {t(k === 'text' ? 'stampText' : k === 'image' ? 'stampImage' : 'stampNumbers')}
                </button>
              ))}
            </div>

            {kind === 'text' && (
              <>
                <div className="chips" aria-label={t('stampPresets')}>
                  {STAMP_PRESETS.map((p) => (
                    <button key={p.id} type="button" className="chip" onClick={() => { setText(lang === 'ar' ? p.ar : p.en); setColor(p.color); }}>
                      {lang === 'ar' ? p.ar : p.en}
                    </button>
                  ))}
                </div>
                <Field label={t('stampTextLabel')}>
                  {(id) => <input id={id} className="input" dir="auto" value={text} onChange={(e) => setText(e.target.value)} />}
                </Field>
                <Checkbox checked={border} onChange={setBorder}>{t('stampBorder')}</Checkbox>
              </>
            )}
            {kind === 'image' && (
              <Field label={t('stampImageLabel')} hint={image ? image.name : t('stampImageHint')}>
                {(id) => <input id={id} className="input" type="file" accept="image/png,image/jpeg" onChange={(e) => pickImage(e.target.files?.[0])} />}
              </Field>
            )}
            {kind === 'numbers' && (
              <div className="grid-2">
                <Field label={t('stampNumbersLabel')} hint={t('stampNumbersHint')}>
                  {(id) => <input id={id} className="input" dir="auto" value={numbersText} placeholder={t('stampNumbersDefault')} onChange={(e) => setNumbersText(e.target.value)} />}
                </Field>
                <Field label={t('stampStartAt')}>
                  {(id) => <input id={id} className="input" type="number" min={0} value={startAt} onChange={(e) => setStartAt(Number(e.target.value) || 1)} />}
                </Field>
              </div>
            )}

            <div className="grid-3">
              {kind !== 'image' && (
                <Field label={t('stampColor')}>
                  {(id) => <input id={id} className="input color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />}
                </Field>
              )}
              <Field label={kind === 'image' ? t('stampWidth') : t('stampSize')}>
                {(id) => <input id={id} className="input" type="range" min={kind === 'numbers' ? 8 : kind === 'image' ? 10 : 12} max={kind === 'numbers' ? 24 : kind === 'image' ? 120 : 160} value={size} onChange={(e) => setSize(Number(e.target.value))} />}
              </Field>
              {kind !== 'numbers' && (
                <>
                  <Field label={t('stampOpacity')}>
                    {(id) => <input id={id} className="input" type="range" min={0.1} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />}
                  </Field>
                  <Field label={t('stampRotation')}>
                    {(id) => <input id={id} className="input" type="range" min={-90} max={90} step={5} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} />}
                  </Field>
                </>
              )}
            </div>

            <fieldset className="choices">
              <legend>{t('stampPosition')}</legend>
              <div className="pos-grid" dir="ltr">
                {POSITIONS.map((p) => (
                  <button key={p} type="button" aria-label={p} aria-pressed={position === p} className={`pos${position === p ? ' is-active' : ''}`} onClick={() => setPosition(p)} />
                ))}
              </div>
              <p className="muted">{t('stampPickHint')}</p>
              {position === 'custom' && (
                <div className="grid-2">
                  <Field label={t('stampPosX')}>
                    {(id) => <input id={id} className="input" type="number" min={0} max={100} value={Math.round(at.x * 100)} onChange={(e) => setAt({ ...at, x: clamp01(Number(e.target.value) / 100) })} />}
                  </Field>
                  <Field label={t('stampPosY')}>
                    {(id) => <input id={id} className="input" type="number" min={0} max={100} value={Math.round(at.y * 100)} onChange={(e) => setAt({ ...at, y: clamp01(Number(e.target.value) / 100) })} />}
                  </Field>
                </div>
              )}
              {kind !== 'numbers' && <Checkbox checked={position === 'tile'} onChange={(v) => setPosition(v ? 'tile' : 'center')}>{t('stampTile')}</Checkbox>}
            </fieldset>

            <PageRangeField value={range} onChange={setRange} total={pdf.numPages} />
            <div className="actions">
              <button type="button" className="btn btn-primary" data-save disabled={!ready || busy} onClick={run}>
                {busy ? t('processing') : t('stampAction')}
              </button>
            </div>
            {done && <Notice kind="success">{t('stampDone')}</Notice>}
            {failed && <Notice kind="error">{t(failed)}</Notice>}
          </div>
          <div className="preview-box" aria-label={t('preview')}>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={t('preview')}
                className="stamp-pick"
                draggable={false}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); pickAt(e); }}
                onPointerMove={(e) => { if (e.buttons) pickAt(e); }}
              />
            ) : (
              <p className="muted">{t('stampPreviewEmpty')}</p>
            )}
          </div>
        </div>
      )}
    </ToolPage>
  );
}
