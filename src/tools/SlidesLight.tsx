import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, FilePlus2, ImageDown, Play, Plus, Presentation, Trash2, X } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { zipSync } from 'fflate';
import { useI18n, type Key } from '../i18n';
import { ToolPage, Notice } from '../components/Shell';
import { Field } from '../components/Fields';
import { useHistory } from '../hooks/useHistory';
import { H, LAYOUTS, THEMES, W, blankSlide, newId, type Layout, type Slide } from '../lib/slides/model';
import { drawSlide } from '../lib/slides/draw';
import { toPptx } from '../lib/slides/pptx';
import { downloadBytes } from '../lib/pdf';

const STORAGE = 'shootcut:slides';
const LAYOUT_NAME: Record<Layout, Key> = { title: 'slideLayoutTitle', bullets: 'slideLayoutBullets', text: 'slideLayoutText', image: 'slideLayoutImage' };
const THEME_NAME: Record<string, Key> = { clean: 'slideThemeClean', night: 'slideThemeNight', sand: 'slideThemeSand', ink: 'slideThemeInk', rose: 'slideThemeRose' };

interface Saved {
  slides: Slide[];
  theme: string;
}
const starter = (): Saved => ({ theme: 'clean', slides: [{ ...blankSlide('title') }, { ...blankSlide('bullets') }] });
function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE);
    const s = raw ? (JSON.parse(raw) as Saved) : null;
    if (s && Array.isArray(s.slides) && s.slides.length > 0) return s;
  } catch {
    /* nothing saved, or storage blocked */
  }
  return starter();
}

const decode = (url: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = url;
  });

/** Small pictures keep the saved deck light: photos are shrunk to at most 1600 px on the long side. */
async function shrinkPicture(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await decode(url);
    if (!img) return null;
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function useImages(slides: Slide[]) {
  const [map, setMap] = useState<Map<string, HTMLImageElement>>(new Map());
  const wanted = slides.filter((s) => s.image).map((s) => `${s.id}|${s.image}`).join('\n');
  useEffect(() => {
    let live = true;
    void (async () => {
      const next = new Map<string, HTMLImageElement>();
      for (const s of slides) {
        if (!s.image) continue;
        const img = await decode(s.image);
        if (img) next.set(s.id, img);
      }
      if (live) setMap(next);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `wanted` stands for the slides' pictures
  }, [wanted]);
  return map;
}

function SlideCanvas({ slide, themeId, img, scale = 1, className, label }: { slide: Slide; themeId: string; img?: HTMLImageElement | null; scale?: number; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    void document.fonts?.ready.then(() => setFontsReady((n) => n + 1));
  }, []);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawSlide(ctx, slide, THEMES.find((x) => x.id === themeId) ?? THEMES[0], img);
  }, [slide, themeId, img, scale, fontsReady]);
  return <canvas ref={ref} className={className} width={Math.round(W * scale)} height={Math.round(H * scale)} role="img" aria-label={label} />;
}

export default function SlidesLight() {
  const { t } = useI18n();
  const [saved] = useState(load);
  const [slides, setSlides] = useState<Slide[]>(saved.slides);
  const [themeId, setThemeId] = useState(saved.theme);
  const [cur, setCur] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const images = useImages(slides);
  const theme = THEMES.find((x) => x.id === themeId) ?? THEMES[0];
  const slide = slides[Math.min(cur, slides.length - 1)];

  useHistory({ slides, themeId }, (s) => { setSlides(s.slides); setThemeId(s.themeId); setCur((c) => Math.min(c, s.slides.length - 1)); });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ slides, theme: themeId } satisfies Saved));
    } catch {
      /* too big or blocked: the deck lives on this page only */
    }
  }, [slides, themeId]);

  const patch = (p: Partial<Slide>) => setSlides((all) => all.map((s, i) => (i === cur ? { ...s, ...p } : s)));
  const add = () => {
    setSlides((all) => [...all.slice(0, cur + 1), blankSlide('bullets'), ...all.slice(cur + 1)]);
    setCur(cur + 1);
  };
  const duplicate = () => {
    setSlides((all) => [...all.slice(0, cur + 1), { ...all[cur], id: newId() }, ...all.slice(cur + 1)]);
    setCur(cur + 1);
  };
  const remove = () => {
    if (slides.length === 1) {
      setSlides([blankSlide('title')]);
      return;
    }
    setSlides((all) => all.filter((_, i) => i !== cur));
    setCur(Math.max(0, cur - 1));
  };
  const swap = (d: number) => {
    const k = cur + d;
    if (k < 0 || k >= slides.length) return;
    setSlides((all) => {
      const next = [...all];
      [next[cur], next[k]] = [next[k], next[cur]];
      return next;
    });
    setCur(k);
  };
  const reset = () => {
    if (window.confirm(t('slideNewConfirm'))) {
      const s = starter();
      setSlides(s.slides);
      setThemeId(s.theme);
      setCur(0);
    }
  };

  const renderPng = (s: Slide, scale: number) =>
    new Promise<Uint8Array>((resolve, reject) => {
      const c = document.createElement('canvas');
      c.width = Math.round(W * scale);
      c.height = Math.round(H * scale);
      const ctx = c.getContext('2d')!;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawSlide(ctx, s, theme, images.get(s.id));
      c.toBlob((b) => (b ? b.arrayBuffer().then((x) => resolve(new Uint8Array(x))) : reject(new Error('png'))), 'image/png');
    });

  const run = async (what: string, job: () => Promise<void>) => {
    setBusy(what);
    setError(false);
    try {
      await document.fonts?.ready;
      await job();
    } catch (e) {
      console.error('[shootcut] slides export failed', e);
      setError(true);
    } finally {
      setBusy(null);
    }
  };
  const name = (slides[0]?.title || 'slides').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'slides';

  const exportPptx = () => run('pptx', async () => downloadBytes(toPptx(slides, theme), `${name}.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'));
  const exportPdf = () =>
    run('pdf', async () => {
      const pdf = await PDFDocument.create();
      pdf.setTitle(name);
      for (const s of slides) {
        const png = await pdf.embedPng(await renderPng(s, 1.5));
        const page = pdf.addPage([960, 540]);
        page.drawImage(png, { x: 0, y: 0, width: 960, height: 540 });
      }
      downloadBytes(await pdf.save(), `${name}.pdf`, 'application/pdf');
    });
  const exportPng = () =>
    run('png', async () => {
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < slides.length; i++) files[`${name}-${String(i + 1).padStart(2, '0')}.png`] = await renderPng(slides[i], 1.5);
      downloadBytes(slides.length === 1 ? Object.values(files)[0] : zipSync(files, { level: 0 }), slides.length === 1 ? Object.keys(files)[0] : `${name}.zip`, slides.length === 1 ? 'image/png' : 'application/zip');
    });

  const thumbs = useMemo(() => slides.map((s) => s.id).join(','), [slides]);

  return (
    <ToolPage title={t('toolSlides')} desc={t('toolSlidesDesc')}>
      <div className="sheet-toolbar">
        <button type="button" className="btn" onClick={reset}>
          <FilePlus2 size={16} aria-hidden /> {t('slideNew')}
        </button>
        <button type="button" className="btn" onClick={() => setPresenting(true)}>
          <Play size={16} aria-hidden /> {t('slidePresent')}
        </button>
        <button type="button" className="btn btn-primary" data-save disabled={busy !== null} onClick={exportPptx}>
          <Presentation size={16} aria-hidden /> {t('slideExportPptx')}
        </button>
        <button type="button" className="btn" disabled={busy !== null} onClick={exportPdf}>
          {t('slideExportPdf')}
        </button>
        <button type="button" className="btn" disabled={busy !== null} onClick={exportPng}>
          <ImageDown size={16} aria-hidden /> {t('slideExportPng')}
        </button>
      </div>
      {busy && <p className="hint" role="status">{t('processing')}</p>}
      {error && <Notice kind="error">{t('slideExportFailed')}</Notice>}

      <div className="slides-layout">
        <ol className="slide-list" aria-label={t('slideList')} data-thumbs={thumbs}>
          {slides.map((s, i) => (
            <li key={s.id}>
              <button type="button" className={`slide-thumb${i === cur ? ' is-sel' : ''}`} aria-current={i === cur} aria-label={`${t('slideNumber')} ${i + 1}`} onClick={() => setCur(i)}>
                <SlideCanvas slide={s} themeId={themeId} img={images.get(s.id)} scale={0.25} className="thumb-canvas" />
                <span className="thumb-num" dir="ltr">{i + 1}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="slide-main">
          <SlideCanvas slide={slide} themeId={themeId} img={images.get(slide.id)} className="slide-canvas" label={t('slidePreview')} />
          <div className="slide-actions">
            <button type="button" className="btn" onClick={add}><Plus size={16} aria-hidden /> {t('slideAdd')}</button>
            <button type="button" className="btn" onClick={duplicate}><Copy size={16} aria-hidden /> {t('slideDuplicate')}</button>
            <button type="button" className="icon-btn" aria-label={t('moveUp')} disabled={cur === 0} onClick={() => swap(-1)}><ArrowUp size={18} aria-hidden /></button>
            <button type="button" className="icon-btn" aria-label={t('moveDown')} disabled={cur === slides.length - 1} onClick={() => swap(1)}><ArrowDown size={18} aria-hidden /></button>
            <button type="button" className="btn btn-ghost" onClick={remove}><Trash2 size={16} aria-hidden /> {t('slideDelete')}</button>
          </div>

          <div className="panel">
            <div className="chips" role="group" aria-label={t('slideLayout')}>
              {LAYOUTS.map((l) => (
                <button key={l} type="button" className={`chip${slide.layout === l ? ' is-active' : ''}`} aria-pressed={slide.layout === l} onClick={() => patch({ layout: l })}>
                  {t(LAYOUT_NAME[l])}
                </button>
              ))}
            </div>
            <Field label={t('slideTitleField')}>
              {(id) => <input id={id} className="input" dir="auto" value={slide.title} onChange={(e) => patch({ title: e.target.value })} />}
            </Field>
            <Field label={t(slide.layout === 'bullets' ? 'slideBodyBullets' : slide.layout === 'title' ? 'slideBodySubtitle' : 'slideBodyText')}>
              {(id) => <textarea id={id} className="input" dir="auto" rows={6} value={slide.body} onChange={(e) => patch({ body: e.target.value })} />}
            </Field>
            {slide.layout === 'image' && (
              <div className="field">
                <label className="btn">
                  {t('slidePicture')}
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const url = await shrinkPicture(f);
                      if (url) patch({ image: url });
                    }}
                  />
                </label>{' '}
                {slide.image && (
                  <button type="button" className="btn btn-ghost" onClick={() => patch({ image: null })}>
                    <X size={14} aria-hidden /> {t('remove')}
                  </button>
                )}
              </div>
            )}
            <div className="field">
              <span className="label">{t('slideTheme')}</span>
              <div className="chips" role="group" aria-label={t('slideTheme')}>
                {THEMES.map((th) => (
                  <button key={th.id} type="button" className={`chip${themeId === th.id ? ' is-active' : ''}`} aria-pressed={themeId === th.id} onClick={() => setThemeId(th.id)}>
                    <span className="theme-dot" style={{ background: th.bg, borderColor: th.accent }} aria-hidden /> {t(THEME_NAME[th.id])}
                  </button>
                ))}
              </div>
            </div>
            <p className="hint">{t('slideHint')}</p>
          </div>
        </div>
      </div>

      {presenting && <Presenter slides={slides} themeId={themeId} images={images} start={cur} onClose={() => setPresenting(false)} />}
    </ToolPage>
  );
}

function Presenter({ slides, themeId, images, start, onClose }: { slides: Slide[]; themeId: string; images: Map<string, HTMLImageElement>; start: number; onClose: () => void }) {
  const { t } = useI18n();
  const [i, setI] = useState(start);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.focus();
    void root.current?.requestFullscreen?.().catch(() => undefined);
    const onFs = () => {
      if (!document.fullscreenElement) onClose();
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when it opens
  }, []);
  const go = (d: number) => setI((n) => Math.min(slides.length - 1, Math.max(0, n + d)));
  return (
    <div
      ref={root}
      className="presenter"
      tabIndex={-1}
      role="dialog"
      aria-label={t('slidePresent')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        else if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) go(1);
        else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) go(-1);
        else return;
        e.preventDefault();
      }}
      onClick={() => go(1)}
    >
      <SlideCanvas slide={slides[i]} themeId={themeId} img={images.get(slides[i].id)} scale={1.5} className="presenter-canvas" />
      <button type="button" className="btn presenter-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        <X size={16} aria-hidden /> {t('slideClose')}
      </button>
      <span className="presenter-count" dir="ltr">{i + 1} / {slides.length}</span>
    </div>
  );
}
