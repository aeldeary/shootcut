import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useI18n } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Checkbox, Field, MediaKeepBar } from '../components/Fields';
import { useKeptMedia } from '../hooks/useKeptMedia';
import { Notice, ToolPage } from '../components/Shell';
import { decodeFile, encodeCanvas, formatOf, outName, MIME, type OutFormat } from '../lib/img';
import { blackoutRegion, blurRegion, cloneCanvas, cropCanvas, makeTransparent, memeCanvas, pixelAt, pixelateRegion } from '../lib/ops/imgops';
import { downloadBytes, type CanvasLike } from '../lib/pdf';

interface Loaded {
  file: File;
  canvas: CanvasLike;
  url: string;
}

/** One picture at a time: pick it, work on it, pick another. */
function useOnePicture() {
  const [pic, setPic] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const url = useRef<string | null>(null);
  const keep = useKeptMedia('image', (files) => void open(files[0], false));
  const load = (file: File | undefined) => open(file, true);
  async function open(file: File | undefined, fromPerson: boolean) {
    if (!file) return;
    setError(false);
    try {
      const canvas = await decodeFile(file);
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(file);
      // a file restored from the device does not replace what is kept; one the person just added does
      setPic((old) => (old && !fromPerson ? old : { file, canvas, url: url.current! }));
      if (fromPerson) keep([file]);
    } catch {
      setError(true);
    }
  }
  const reset = () => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setPic(null);
  };
  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current); }, []);
  const keepBar = <MediaKeepBar kind="image" onDeleted={reset} />;
  return { pic, error, load, reset, keepBar };
}

/** A picture on the page where the person can drag; positions come back as fractions (0-1) of the picture. */
function PickStage({
  src,
  onDrag,
  onEnd,
  onPick,
  children,
  cursor = 'crosshair',
}: {
  src: string;
  onDrag?: (a: [number, number], b: [number, number]) => void;
  onEnd?: (a: [number, number], b: [number, number]) => void;
  onPick?: (p: [number, number]) => void;
  children?: React.ReactNode;
  cursor?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<[number, number] | null>(null);
  const frac = (e: RPointerEvent): [number, number] => {
    const r = box.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  return (
    <div
      ref={box}
      className="img-stage"
      style={{ cursor }}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        start.current = frac(e);
        onPick?.(start.current);
      }}
      onPointerMove={(e) => {
        if (start.current && onDrag) onDrag(start.current, frac(e));
      }}
      onPointerUp={(e) => {
        if (start.current && onEnd) onEnd(start.current, frac(e));
        start.current = null;
      }}
    >
      <img src={src} alt="" draggable={false} />
      {children}
    </div>
  );
}

const rectStyle = (a: [number, number], b: [number, number]) => ({
  left: `${Math.min(a[0], b[0]) * 100}%`,
  top: `${Math.min(a[1], b[1]) * 100}%`,
  width: `${Math.abs(a[0] - b[0]) * 100}%`,
  height: `${Math.abs(a[1] - b[1]) * 100}%`,
});

function saveAs(canvas: CanvasLike, file: File, suffix: string, format?: OutFormat) {
  const fmt = format ?? formatOf(file);
  return encodeCanvas(canvas, fmt, 0.92).then((bytes) => downloadBytes(bytes, outName(file, suffix, fmt), MIME[fmt]));
}

export function ImgCropTool() {
  const { t } = useI18n();
  const { pic, error, load, reset, keepBar } = useOnePicture();
  const [rect, setRect] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const ratios: { label: string; v: number | null }[] = [
    { label: t('imgCropFree'), v: null },
    { label: '1:1', v: 1 },
    { label: '4:3', v: 4 / 3 },
    { label: '3:4', v: 3 / 4 },
    { label: '16:9', v: 16 / 9 },
    { label: '9:16', v: 9 / 16 },
  ];

  // with a fixed shape, the second corner follows the pointer but is bent to the shape
  const constrain = (a: [number, number], b: [number, number]): [number, number] => {
    if (!ratio || !pic) return b;
    const k = pic.canvas.width / pic.canvas.height; // fractions are of width and of height, so a square in pixels is not square in fractions
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const sx = dx < 0 ? -1 : 1;
    const sy = dy < 0 ? -1 : 1;
    let w = Math.abs(dx);
    let h = (w * k) / ratio;
    if (h > Math.abs(dy)) {
      h = Math.abs(dy);
      w = (h * ratio) / k;
    }
    return [a[0] + sx * w, a[1] + sy * h];
  };

  const px = (() => {
    if (!pic || !rect) return null;
    const x = Math.min(rect.a[0], rect.b[0]) * pic.canvas.width;
    const y = Math.min(rect.a[1], rect.b[1]) * pic.canvas.height;
    return { x, y, width: Math.abs(rect.a[0] - rect.b[0]) * pic.canvas.width, height: Math.abs(rect.a[1] - rect.b[1]) * pic.canvas.height };
  })();

  const crop = async () => {
    if (!pic) return;
    setBusy(true);
    try {
      await saveAs(px && px.width > 2 && px.height > 2 ? cropCanvas(pic.canvas, px) : pic.canvas, pic.file, '-cropped');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={t('toolImgCrop')} desc={t('toolImgCropDesc')}>
      {!pic && <Dropzone kind="image" onFiles={(f) => load(f[0])} />}
      {pic && keepBar}
      {error && <Notice kind="error">{t('imgUnreadable')}</Notice>}
      {pic && (
        <div className="split">
          <div className="panel">
            <p className="hint">{t('imgCropHint')}</p>
            <div className="chips" aria-label={t('imgCropShape')}>
              {ratios.map((r) => (
                <button key={r.label} type="button" className="chip" aria-pressed={ratio === r.v} onClick={() => { setRatio(r.v); setRect(null); }}>
                  {r.label}
                </button>
              ))}
            </div>
            {px && (
              <p className="muted">
                <bdi>{Math.round(px.width)}×{Math.round(px.height)}</bdi> px
              </p>
            )}
            <div className="actions">
              <button type="button" className="btn btn-primary" data-save disabled={busy} onClick={crop}>
                {px && px.width > 2 ? t('imgCropApply') : t('imgCropFull')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { reset(); setRect(null); }}>
                {t('imgChangePicture')}
              </button>
            </div>
          </div>
          <div className="preview-box">
            <PickStage
              src={pic.url}
              onPick={(p) => setRect({ a: p, b: p })}
              onDrag={(a, b) => setRect({ a, b: constrain(a, b) })}
              onEnd={(a, b) => setRect({ a, b: constrain(a, b) })}
            >
              {rect && <span className="img-sel" style={rectStyle(rect.a, rect.b)} />}
            </PickStage>
          </div>
        </div>
      )}
    </ToolPage>
  );
}

type HideMode = 'blur' | 'pixel' | 'black';

export function ImgBlurTool() {
  const { t } = useI18n();
  const { pic, error, load, reset, keepBar } = useOnePicture();
  const [areas, setAreas] = useState<{ a: [number, number]; b: [number, number] }[]>([]);
  const [live, setLive] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const [mode, setMode] = useState<HideMode>('pixel');
  const [strength, setStrength] = useState(50);
  const [busy, setBusy] = useState(false);

  const render = (): CanvasLike => {
    const out = cloneCanvas(pic!.canvas);
    for (const r of areas) {
      const box = {
        x: Math.min(r.a[0], r.b[0]) * out.width,
        y: Math.min(r.a[1], r.b[1]) * out.height,
        width: Math.abs(r.a[0] - r.b[0]) * out.width,
        height: Math.abs(r.a[1] - r.b[1]) * out.height,
      };
      if (mode === 'black') blackoutRegion(out, box);
      else if (mode === 'blur') blurRegion(out, box, Math.max(3, (strength / 100) * Math.min(box.width, box.height) * 0.4));
      else pixelateRegion(out, box, Math.max(4, (strength / 100) * Math.min(box.width, box.height) * 0.35));
    }
    return out;
  };

  const run = async () => {
    if (!pic) return;
    setBusy(true);
    try {
      await saveAs(render(), pic.file, '-hidden');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={t('toolImgBlur')} desc={t('toolImgBlurDesc')}>
      {!pic && <Dropzone kind="image" onFiles={(f) => load(f[0])} />}
      {pic && keepBar}
      {error && <Notice kind="error">{t('imgUnreadable')}</Notice>}
      {pic && (
        <div className="split">
          <div className="panel">
            <p className="hint">{t('imgBlurHint')}</p>
            <Field label={t('imgBlurMode')}>
              {(id) => (
                <select id={id} className="input" value={mode} onChange={(e) => setMode(e.target.value as HideMode)}>
                  <option value="pixel">{t('imgModePixel')}</option>
                  <option value="blur">{t('imgModeBlur')}</option>
                  <option value="black">{t('imgModeBlack')}</option>
                </select>
              )}
            </Field>
            {mode !== 'black' && <Field label={`${t('imgStrength')}: ${strength}`}>{(id) => <input id={id} className="input" type="range" min={10} max={100} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />}</Field>}
            <p className="hint">{t('imgBlurNote')}</p>
            <p className="muted">{t('imgAreas')}: {areas.length}</p>
            <div className="actions">
              <button type="button" className="btn btn-primary" data-save disabled={busy || areas.length === 0} onClick={run}>
                {t('imgBlurApply')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { reset(); setAreas([]); }}>
                {t('imgChangePicture')}
              </button>
            </div>
          </div>
          <div className="preview-box">
            <PickStage
              src={pic.url}
              onDrag={(a, b) => setLive({ a, b })}
              onEnd={(a, b) => {
                setLive(null);
                if (Math.abs(a[0] - b[0]) > 0.01 && Math.abs(a[1] - b[1]) > 0.01) setAreas((p) => [...p, { a, b }]);
              }}
            >
              {areas.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  className="img-sel is-mark"
                  style={rectStyle(r.a, r.b)}
                  aria-label={t('remove')}
                  title={t('remove')}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setAreas((p) => p.filter((_, j) => j !== i))}
                />
              ))}
              {live && <span className="img-sel" style={rectStyle(live.a, live.b)} />}
            </PickStage>
          </div>
        </div>
      )}
    </ToolPage>
  );
}

export function ImgMemeTool() {
  const { t } = useI18n();
  const { pic, error, load, reset, keepBar } = useOnePicture();
  const [top, setTop] = useState('');
  const [bottom, setBottom] = useState('');
  const [size, setSize] = useState(9);
  const [color, setColor] = useState('#ffffff');
  const [mine, setMine] = useState(false);
  const [which, setWhich] = useState<'top' | 'bottom'>('top');
  const [topAt, setTopAt] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.03 });
  const [bottomAt, setBottomAt] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.85 });
  const view = useRef<HTMLCanvasElement>(null);
  const spec = { top, bottom, size, color, topAt: mine ? topAt : undefined, bottomAt: mine ? bottomAt : undefined };

  useEffect(() => {
    if (!pic || !view.current) return;
    let alive = true;
    const draw = async () => {
      await document.fonts?.load?.('800 40px "IBM Plex Sans Arabic"').catch(() => undefined);
      if (!alive || !view.current) return;
      const out = memeCanvas(pic.canvas, spec) as unknown as HTMLCanvasElement;
      view.current.width = out.width;
      view.current.height = out.height;
      view.current.getContext('2d')!.drawImage(out, 0, 0);
    };
    void draw();
    return () => {
      alive = false;
    };
  }, [pic, top, bottom, size, color, mine, topAt, bottomAt]); // eslint-disable-line react-hooks/exhaustive-deps -- `spec` is built from these

  const aim = (e: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) => {
    if (!mine) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p = { x: Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))), y: Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1))) };
    (which === 'top' ? setTopAt : setBottomAt)(p);
  };
  const dragging = useRef(false);

  return (
    <ToolPage title={t('toolImgMeme')} desc={t('toolImgMemeDesc')}>
      {!pic && <Dropzone kind="image" onFiles={(f) => load(f[0])} />}
      {pic && keepBar}
      {error && <Notice kind="error">{t('imgUnreadable')}</Notice>}
      {pic && (
        <div className="split">
          <div className="panel">
            <Field label={t('imgMemeTop')}>{(id) => <input id={id} className="input" dir="auto" value={top} onChange={(e) => setTop(e.target.value)} />}</Field>
            <Field label={t('imgMemeBottom')}>{(id) => <input id={id} className="input" dir="auto" value={bottom} onChange={(e) => setBottom(e.target.value)} />}</Field>
            <div className="grid-2">
              <Field label={`${t('imgMemeSize')}: ${size}`}>{(id) => <input id={id} className="input" type="range" min={4} max={18} value={size} onChange={(e) => setSize(Number(e.target.value))} />}</Field>
              <Field label={t('imgMemeColor')}>{(id) => <input id={id} className="input color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />}</Field>
            </div>
            <Checkbox checked={mine} onChange={setMine}>{t('placeMyself')}</Checkbox>
            {mine && (
              <>
                <p className="hint">{t('memePlaceHint')}</p>
                <div className="chips">
                  {(['top', 'bottom'] as const).map((k) => (
                    <button key={k} type="button" className={`chip${which === k ? ' is-active' : ''}`} aria-pressed={which === k} onClick={() => setWhich(k)}>
                      {t(k === 'top' ? 'imgMemeTop' : 'imgMemeBottom')}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                data-save
                disabled={!top.trim() && !bottom.trim()}
                onClick={() => saveAs(memeCanvas(pic.canvas, spec), pic.file, '-meme', 'jpeg')}
              >
                {t('imgMemeDownload')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset}>
                {t('imgChangePicture')}
              </button>
            </div>
          </div>
          <div className="preview-box">
            <canvas
              ref={view}
              className="img-canvas"
              style={mine ? { cursor: 'crosshair', touchAction: 'none' } : undefined}
              onPointerDown={(e) => {
                if (!mine) return;
                dragging.current = true;
                e.currentTarget.setPointerCapture?.(e.pointerId);
                aim(e);
              }}
              onPointerMove={(e) => dragging.current && aim(e)}
              onPointerUp={() => (dragging.current = false)}
              onPointerCancel={() => (dragging.current = false)}
            />
          </div>
        </div>
      )}
    </ToolPage>
  );
}

export function ImgTransparentTool() {
  const { t } = useI18n();
  const { pic, error, load, reset, keepBar } = useOnePicture();
  const [color, setColor] = useState<[number, number, number] | null>(null);
  const [tol, setTol] = useState(12);
  const [soft, setSoft] = useState(6);
  const view = useRef<HTMLCanvasElement>(null);

  // start from the colour of the top-left corner: that is usually the background
  useEffect(() => {
    if (pic) {
      const [r, g, b] = pixelAt(pic.canvas, 0, 0);
      setColor([r, g, b]);
    } else setColor(null);
  }, [pic]);

  useEffect(() => {
    if (!pic || !color || !view.current) return;
    const out = makeTransparent(pic.canvas, color, tol, soft) as unknown as HTMLCanvasElement;
    view.current.width = out.width;
    view.current.height = out.height;
    const c = view.current.getContext('2d')!;
    c.clearRect(0, 0, out.width, out.height);
    c.drawImage(out, 0, 0);
  }, [pic, color, tol, soft]);

  const hex = color ? `#${color.map((v) => v.toString(16).padStart(2, '0')).join('')}` : '#ffffff';

  return (
    <ToolPage title={t('toolImgTransparent')} desc={t('toolImgTransparentDesc')}>
      {!pic && <Dropzone kind="image" onFiles={(f) => load(f[0])} />}
      {pic && keepBar}
      {error && <Notice kind="error">{t('imgUnreadable')}</Notice>}
      {pic && color && (
        <div className="split">
          <div className="panel">
            <p className="hint">{t('imgTransHint')}</p>
            <Field label={t('imgTransColor')}>
              {(id) => (
                <input
                  id={id}
                  className="input color"
                  type="color"
                  value={hex}
                  onChange={(e) => {
                    const v = parseInt(e.target.value.slice(1), 16);
                    setColor([(v >> 16) & 255, (v >> 8) & 255, v & 255]);
                  }}
                />
              )}
            </Field>
            <Field label={`${t('imgTransTolerance')}: ${tol}`}>{(id) => <input id={id} className="input" type="range" min={0} max={60} value={tol} onChange={(e) => setTol(Number(e.target.value))} />}</Field>
            <Field label={`${t('imgTransSoft')}: ${soft}`}>{(id) => <input id={id} className="input" type="range" min={0} max={30} value={soft} onChange={(e) => setSoft(Number(e.target.value))} />}</Field>
            <p className="hint">{t('imgTransNote')}</p>
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                data-save
                onClick={() => encodeCanvas(makeTransparent(pic.canvas, color, tol, soft), 'png', 1).then((b) => downloadBytes(b, `${outName(pic.file, '-transparent', 'png')}`, MIME.png))}
              >
                {t('imgTransDownload')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset}>
                {t('imgChangePicture')}
              </button>
            </div>
          </div>
          <div className="preview-box is-checker">
            <PickStage
              src={pic.url}
              cursor="crosshair"
              onPick={(p) => {
                const [r, g, b] = pixelAt(pic.canvas, p[0] * pic.canvas.width, p[1] * pic.canvas.height);
                setColor([r, g, b]);
              }}
            >
              {/* the picture under the pointer is the original; the result is shown below */}
            </PickStage>
            <canvas ref={view} className="img-canvas" />
          </div>
        </div>
      )}
    </ToolPage>
  );
}

