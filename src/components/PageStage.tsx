import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Hand, ZoomIn, ZoomOut } from 'lucide-react';
import { useI18n } from '../i18n';
import { useShortcuts } from '../hooks/useShortcuts';
import { createCanvas, type CanvasLike, type PageViewportInfo, type PdfPreview } from '../lib/pdf';

export interface StagePointer {
  /** position in PDF points (origin bottom-left) */
  pdf: [number, number];
  /** position in CSS px relative to the page's top-left corner */
  view: [number, number];
  event: RPointerEvent<HTMLDivElement>;
}

interface Props {
  preview: PdfPreview;
  page: number;
  onPage: (page: number) => void;
  cursor?: string;
  onPointerDown?: (p: StagePointer) => void;
  onPointerMove?: (p: StagePointer) => void;
  onPointerUp?: (p: StagePointer) => void;
  /** overlay content, positioned in CSS px relative to the page; viewport maps PDF <-> px */
  children?: (vp: PageViewportInfo) => ReactNode;
}

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2];

/** One PDF page with zoom and page navigation, plus a pointer layer that reports PDF coordinates. */
export function PageStage({ preview, page, onPage, cursor, onPointerDown, onPointerMove, onPointerUp, children }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1.25);
  const [vp, setVp] = useState<PageViewportInfo | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // on a touch screen the page layer swallows every gesture, so "move" mode hands them back to scrolling
  const [pan, setPan] = useState(false);

  // first open on a narrow screen: start with the page fitting the width instead of showing one corner
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !box.clientWidth) return;
    let cancelled = false;
    preview
      .viewport(0, 1)
      .then((v) => {
        if (cancelled || !v.width) return;
        const avail = box.clientWidth - 32;
        if (avail < v.width * 1.25) setZoom(Math.max(0.1, Math.round((avail / v.width) * 100) / 100));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [preview]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const info = await preview.viewport(page, zoom);
      if (cancelled) return;
      setVp(info);
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      // draw off-screen first: pdf.js refuses two renders on one canvas, and zooming can overlap
      const off: CanvasLike = createCanvas(1, 1);
      await preview.renderToCanvas(page, off, zoom * dpr);
      if (cancelled) return;
      const target = canvasRef.current;
      const ctx = target?.getContext('2d');
      if (!target || !ctx) return;
      target.width = off.width;
      target.height = off.height;
      ctx.drawImage(off as unknown as CanvasImageSource, 0, 0);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [preview, page, zoom]);

  const toPointer = (e: RPointerEvent<HTMLDivElement>): StagePointer | null => {
    const layer = layerRef.current;
    if (!layer || !vp) return null;
    const r = layer.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - r.left, 0), vp.width);
    const y = Math.min(Math.max(e.clientY - r.top, 0), vp.height);
    return { pdf: vp.toPdf(x, y), view: [x, y], event: e };
  };
  const handler = (fn?: (p: StagePointer) => void) => (e: RPointerEvent<HTMLDivElement>) => {
    if (pan) return;
    const p = toPointer(e);
    if (p && fn) fn(p);
  };

  /** zoom that makes the page fit the width (or the whole page) of the scroll area */
  const fitTo = async (whole: boolean) => {
    const box = scrollRef.current;
    if (!box) return;
    const v = await preview.viewport(page, 1);
    if (!v.width) return;
    const byWidth = (box.clientWidth - 32) / v.width;
    const byHeight = ((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.7) / v.height;
    setZoom(Math.max(0.1, Math.round(Math.min(whole ? Math.min(byWidth, byHeight) : byWidth, 3) * 100) / 100));
  };
  const keyZoom = (dir: 1 | -1) => {
    const next = dir > 0 ? ZOOMS.find((z) => z > zoom + 0.001) : [...ZOOMS].reverse().find((z) => z < zoom - 0.001);
    if (next === undefined) return false;
    setZoom(next);
  };
  // Acrobat's keys. Plain arrow keys, Home and End are left to scrolling here; the Ctrl forms move between pages
  useShortcuts({
    nextPage: (e) => (e.ctrlKey || e.metaKey) && page < preview.numPages - 1 ? onPage(page + 1) : false,
    prevPage: (e) => (e.ctrlKey || e.metaKey) && page > 0 ? onPage(page - 1) : false,
    firstPage: (e) => (e.ctrlKey || e.metaKey ? onPage(0) : false),
    lastPage: (e) => (e.ctrlKey || e.metaKey ? onPage(preview.numPages - 1) : false),
    zoomIn: () => keyZoom(1),
    zoomOut: () => keyZoom(-1),
    fitPage: () => void fitTo(true),
    fitWidth: () => void fitTo(false),
    actualSize: () => setZoom(1),
  });

  const smaller = [...ZOOMS].reverse().find((z) => z < zoom - 0.001);
  const larger = ZOOMS.find((z) => z > zoom + 0.001);
  return (
    <div className="stage">
      <div className="stage-bar" dir="ltr">
        <button type="button" className="icon-btn" aria-label={t('prevPage')} title={t('prevPage')} disabled={page <= 0} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <span className="stage-page">
          {page + 1} / {preview.numPages}
        </span>
        <button type="button" className="icon-btn" aria-label={t('nextPage')} title={t('nextPage')} disabled={page >= preview.numPages - 1} onClick={() => onPage(page + 1)}>
          <ChevronRight size={18} aria-hidden />
        </button>
        <span className="stage-sep" />
        <button type="button" className="icon-btn" aria-label={t('zoomOut')} title={t('zoomOut')} disabled={smaller === undefined} onClick={() => smaller !== undefined && setZoom(smaller)}>
          <ZoomOut size={18} aria-hidden />
        </button>
        <span className="stage-page">{Math.round(zoom * 100)}%</span>
        <button type="button" className="icon-btn" aria-label={t('zoomIn')} title={t('zoomIn')} disabled={larger === undefined} onClick={() => larger !== undefined && setZoom(larger)}>
          <ZoomIn size={18} aria-hidden />
        </button>
        <button type="button" className="icon-btn stage-pan" aria-pressed={pan} aria-label={t('panMode')} title={t('panMode')} onClick={() => setPan((v) => !v)}>
          <Hand size={18} aria-hidden />
        </button>
      </div>
      <div className="stage-scroll" dir="ltr" ref={scrollRef}>
        <div className="stage-page-box" style={vp ? { width: vp.width, height: vp.height } : undefined}>
          <canvas ref={canvasRef} className="stage-canvas" style={vp ? { width: vp.width, height: vp.height } : undefined} />
          <div
            ref={layerRef}
            className={`stage-layer${pan ? ' is-pan' : ''}`}
            data-testid="stage-layer"
            style={{ cursor: cursor ?? 'default' }}
            onPointerDown={(e) => {
              if (pan) return;
              try {
                e.currentTarget.setPointerCapture?.(e.pointerId);
              } catch {
                /* pointer capture is a convenience only */
              }
              handler(onPointerDown)(e);
            }}
            onPointerMove={handler(onPointerMove)}
            onPointerUp={handler(onPointerUp)}
          >
            {vp && children?.(vp)}
          </div>
        </div>
      </div>
    </div>
  );
}
