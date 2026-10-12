import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FileText, Maximize, Minimize2, RotateCw, Search, Square, Volume2, ZoomIn, ZoomOut } from 'lucide-react';
import { useI18n } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Field, FileBar } from '../components/Fields';
import { viewRect } from '../components/marks';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, createCanvas, downloadBytes, type CanvasLike, type PageViewportInfo, type PdfPreview } from '../lib/pdf';
import { findTextBoxes, itemsToText, normalizeSearch, type Rect } from '../lib/ops/textselect';
import { readProperties, writeProperties, type PdfProperties } from '../lib/ops/properties';
import { speak, speechSupported } from '../lib/speech';
import { useHistory } from '../hooks/useHistory';
import { useShortcuts } from '../hooks/useShortcuts';

type Fit = 'width' | 'page' | number;
const STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

interface Hit {
  page: number;
  rect: Rect;
}

type Display = 'single' | 'two' | 'scroll';

interface PageProps {
  preview: PdfPreview;
  page: number;
  scale: number;
  rotation: number;
  hits: { rect: Rect; i: number }[];
  current: number;
  /** only draw the page once it is near the screen (continuous scrolling) */
  lazy?: boolean;
  /** continuous scrolling: told when this page is mostly on screen */
  onVisible?: (page: number) => void;
}

/** One page: a canvas with the search highlights on top. */
function ViewerPage({ preview, page, scale, rotation, hits, current, lazy, onVisible }: PageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<PageViewportInfo | null>(null);
  const [near, setNear] = useState(!lazy);

  useEffect(() => {
    let cancelled = false;
    preview.viewport(page, scale, rotation).then((v) => !cancelled && setVp(v), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [preview, page, scale, rotation]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const near = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: '600px 0px' });
    if (lazy) near.observe(el);
    const seen = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && onVisible?.(page), { threshold: 0.5 });
    if (onVisible) seen.observe(el);
    return () => {
      near.disconnect();
      seen.disconnect();
    };
  }, [lazy, onVisible, page]);

  useEffect(() => {
    if (!near || !vp) return;
    let cancelled = false;
    (async () => {
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const off: CanvasLike = createCanvas(1, 1);
      await preview.renderToCanvas(page, off, scale * dpr, rotation);
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
  }, [preview, page, scale, rotation, near, vp]);

  return (
    <div className="stage-page-box" id={`viewer-page-${page}`} ref={boxRef} style={vp ? { width: vp.width, height: vp.height } : undefined}>
      <canvas ref={canvasRef} className="stage-canvas" style={vp ? { width: vp.width, height: vp.height } : undefined} data-testid="viewer-canvas" />
      <div className="stage-layer" style={{ pointerEvents: 'none' }}>
        {vp && hits.map((h) => <span key={h.i} className={`mark find-hit${h.i === current ? ' is-current' : ''}`} style={viewRect(vp, h.rect)} />)}
      </div>
    </div>
  );
}

const fmtDate = (d: Date | null) => (d ? d.toLocaleString() : '—');

export function ViewerTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [page, setPage] = useState(0);
  const [fit, setFit] = useState<Fit>('width');
  const [rotation, setRotation] = useState(0);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [searching, setSearching] = useState(false);
  const [readMode, setReadMode] = useState(false);
  const [full, setFull] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);
  const [display, setDisplay] = useState<Display>('single');
  const [speaking, setSpeaking] = useState(false);
  const [speakMsg, setSpeakMsg] = useState<'viewerSpeakUnavailable' | 'viewerSpeakNoText' | null>(null);
  const [showProps, setShowProps] = useState(false);
  const [props, setProps] = useState<PdfProperties | null>(null);
  const [draft, setDraft] = useState({ title: '', author: '', subject: '', keywords: '' });
  const [propsBusy, setPropsBusy] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useHistory({ fit, rotation, display }, (s) => { setFit(s.fit); setRotation(s.rotation); setDisplay(s.display); }, pdf);

  const stopSpeech = useRef<(() => void) | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  // size of the area the page has to fit in
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => setBoxWidth(el.clientWidth);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdf]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    pdf.preview.pageSize(page).then((s) => !cancelled && setSize(s), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [pdf, page]);

  const swap = rotation % 180 !== 0;
  const scale = useMemo(() => {
    if (typeof fit === 'number') return fit;
    if (!size) return 1;
    const w = swap ? size.height : size.width;
    const h = swap ? size.width : size.height;
    const cols = display === 'two' ? 2 : 1;
    const availW = Math.max(240, ((boxWidth || 800) - 24 - (cols - 1) * 12) / cols);
    const byWidth = availW / w;
    if (fit === 'width') return Math.min(byWidth, 2);
    const availH = (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.78;
    return Math.min(byWidth, availH / h);
  }, [fit, size, swap, boxWidth, display]);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === viewerRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const go = useCallback(
    (p: number) => {
      if (!pdf) return;
      const target = Math.min(Math.max(p, 0), pdf.numPages - 1);
      setPage(target);
      if (display === 'scroll') document.getElementById(`viewer-page-${target}`)?.scrollIntoView({ block: 'start' });
    },
    [pdf, display],
  );
  const stepSize = display === 'two' ? 2 : 1;
  const onSeen = useCallback((p: number) => setPage(p), []);

  const search = async () => {
    if (!pdf || !query.trim()) {
      setHits(null);
      return;
    }
    setSearching(true);
    const found: Hit[] = [];
    for (let i = 0; i < pdf.numPages; i++) {
      const items = await pdf.preview.textItems(i).catch(() => []);
      for (const rect of findTextBoxes(items, query, normalizeSearch)) found.push({ page: i, rect });
    }
    setHits(found);
    setCurrent(0);
    setSearching(false);
    if (found.length > 0) go(found[0].page);
  };

  const step = (d: 1 | -1) => {
    if (!hits || hits.length === 0) return;
    const next = (current + d + hits.length) % hits.length;
    setCurrent(next);
    go(hits[next].page);
  };

  const zoom = (d: 1 | -1) => {
    const base = scale;
    const next = d > 0 ? STEPS.find((s) => s > base + 0.01) : [...STEPS].reverse().find((s) => s < base - 0.01);
    if (next) setFit(next);
  };

  const toggleFull = () => {
    const el = viewerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  useEffect(() => () => {
    stopSpeech.current?.();
  }, []);

  const readFrom = async (from: number) => {
    if (!pdf) return;
    for (let p = from; p < pdf.numPages; p++) {
      const text = itemsToText(await pdf.preview.textItems(p).catch(() => []));
      if (!text) continue;
      setPage(p);
      stopSpeech.current = speak(text, (finished) => {
        if (finished && p + 1 < pdf.numPages) void readFrom(p + 1);
        else {
          stopSpeech.current = null;
          setSpeaking(false);
        }
      });
      return;
    }
    setSpeakMsg('viewerSpeakNoText');
    setSpeaking(false);
  };

  const toggleSpeech = () => {
    setSpeakMsg(null);
    if (speaking) {
      stopSpeech.current?.();
      return;
    }
    if (!speechSupported()) {
      setSpeakMsg('viewerSpeakUnavailable');
      return;
    }
    setSpeaking(true);
    void readFrom(page);
  };

  const toggleProps = async () => {
    if (!pdf) return;
    if (showProps) {
      setShowProps(false);
      return;
    }
    const p = await readProperties(pdf.bytes).catch(() => null);
    if (!p) return;
    setProps(p);
    setDraft({ title: p.title, author: p.author, subject: p.subject, keywords: p.keywords });
    setShowProps(true);
  };

  const saveProps = async () => {
    if (!pdf) return;
    setPropsBusy(true);
    try {
      downloadBytes(await writeProperties(pdf.bytes, draft), `${baseName(pdf.file.name)}${t('propsSuffix')}.pdf`);
    } finally {
      setPropsBusy(false);
    }
  };


  // Acrobat's keys: moving between pages, zoom, rotate, full screen, find, read aloud, properties
  useShortcuts({
    nextPage: () => (pdf ? go(page + stepSize) : false),
    prevPage: () => (pdf ? go(page - stepSize) : false),
    firstPage: () => (pdf ? go(0) : false),
    lastPage: () => (pdf ? go(pdf.numPages - 1) : false),
    // in continuous scrolling the browser's own page scrolling is what "next screen" should do
    nextScreen: () => (pdf && display !== 'scroll' ? go(page + stepSize) : false),
    prevScreen: () => (pdf && display !== 'scroll' ? go(page - stepSize) : false),
    goToPage: () => {
      const el = document.querySelector<HTMLInputElement>('.viewer-page-input');
      if (!pdf || !el) return false;
      el.focus();
      el.select();
    },
    zoomIn: () => (pdf ? zoom(1) : false),
    zoomOut: () => (pdf ? zoom(-1) : false),
    fitPage: () => (pdf ? setFit('page') : false),
    fitWidth: () => (pdf ? setFit('width') : false),
    actualSize: () => (pdf ? setFit(1) : false),
    rotateCw: () => (pdf ? setRotation((r) => (r + 90) % 360) : false),
    rotateCcw: () => (pdf ? setRotation((r) => (r + 270) % 360) : false),
    fullScreen: () => (pdf ? toggleFull() : false),
    readingMode: () => (pdf ? setReadMode((v) => !v) : false),
    find: () => {
      const el = document.querySelector<HTMLInputElement>('.viewer-search input');
      if (!pdf || !el) return false;
      el.focus();
      el.select();
    },
    findNext: () => (hits && hits.length > 0 ? step(1) : false),
    findPrev: () => (hits && hits.length > 0 ? step(-1) : false),
    readAloud: () => (pdf ? toggleSpeech() : false),
    readStop: () => (pdf && speaking ? stopSpeech.current?.() : false),
    properties: () => (pdf ? void toggleProps() : false),
  });

  const pageHits = hits?.map((h, i) => ({ ...h, i })) ?? [];
  const perPage = useMemo(() => {
    const m = new Map<number, number>();
    for (const h of hits ?? []) m.set(h.page, (m.get(h.page) ?? 0) + 1);
    return [...m.entries()];
  }, [hits]);

  return (
    <ToolPage title={t('toolViewer')} desc={t('toolViewerDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('loadingPages')}</p>}
      {pdf && (
        <div className={`viewer${readMode ? ' is-read' : ''}${full ? ' is-full' : ''}`} ref={viewerRef} tabIndex={0}>
          {!readMode && (
            <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { stopSpeech.current?.(); reset(); setHits(null); setPage(0); setRotation(0); setShowProps(false); setSpeakMsg(null); }} />
          )}
          <div className="viewer-tools" dir="ltr">
            <button type="button" className="icon-btn" aria-label={t('prevPage')} title={t('prevPage')} disabled={page <= 0} onClick={() => go(page - stepSize)}>
              <ChevronLeft size={18} aria-hidden />
            </button>
            <label className="viewer-page">
              <span className="sr-only">{t('viewerGoTo')}</span>
              <input
                className="input viewer-page-input"
                inputMode="numeric"
                aria-label={t('viewerGoTo')}
                value={page + 1}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                  if (!Number.isNaN(n)) go(n - 1);
                }}
              />
              <span> / {pdf.numPages}</span>
            </label>
            <button type="button" className="icon-btn" aria-label={t('nextPage')} title={t('nextPage')} disabled={page >= pdf.numPages - 1} onClick={() => go(page + stepSize)}>
              <ChevronRight size={18} aria-hidden />
            </button>
            <span className="stage-sep" />
            <button type="button" className="icon-btn" aria-label={t('zoomOut')} title={t('zoomOut')} onClick={() => zoom(-1)}>
              <ZoomOut size={18} aria-hidden />
            </button>
            <span className="stage-page">{Math.round(scale * 100)}%</span>
            <button type="button" className="icon-btn" aria-label={t('zoomIn')} title={t('zoomIn')} onClick={() => zoom(1)}>
              <ZoomIn size={18} aria-hidden />
            </button>
            <button type="button" className="btn btn-small" aria-pressed={fit === 'width'} onClick={() => setFit('width')}>
              {t('viewerFitWidth')}
            </button>
            <button type="button" className="btn btn-small" aria-pressed={fit === 'page'} onClick={() => setFit('page')}>
              {t('viewerFitPage')}
            </button>
            <button type="button" className="icon-btn" aria-label={t('viewerRotate')} title={t('viewerRotate')} onClick={() => setRotation((r) => (r + 90) % 360)}>
              <RotateCw size={18} aria-hidden />
            </button>
            <span className="stage-sep" />
            <button type="button" className="icon-btn" aria-label={t('viewerRead')} title={t('viewerRead')} aria-pressed={readMode} onClick={() => setReadMode((v) => !v)}>
              {readMode ? <Minimize2 size={18} aria-hidden /> : <BookOpen size={18} aria-hidden />}
            </button>
            <button type="button" className="icon-btn" aria-label={t('viewerFull')} title={t('viewerFull')} aria-pressed={full} onClick={toggleFull}>
              <Maximize size={18} aria-hidden />
            </button>
            <span className="stage-sep" />
            <select className="input viewer-display" aria-label={t('viewerDisplay')} title={t('viewerDisplay')} value={display} onChange={(e) => { setDisplay(e.target.value as Display); setFit((f) => (f === 'page' && e.target.value === 'scroll' ? 'width' : f)); }}>
              <option value="single">{t('viewerDisplaySingle')}</option>
              <option value="two">{t('viewerDisplayTwo')}</option>
              <option value="scroll">{t('viewerDisplayScroll')}</option>
            </select>
            <button type="button" className="icon-btn" aria-label={speaking ? t('viewerSpeakStop') : t('viewerSpeak')} title={speaking ? t('viewerSpeakStop') : t('viewerSpeak')} aria-pressed={speaking} onClick={toggleSpeech}>
              {speaking ? <Square size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
            </button>
            <button type="button" className="icon-btn" aria-label={t('viewerProps')} title={t('viewerProps')} aria-pressed={showProps} onClick={() => void toggleProps()}>
              <FileText size={18} aria-hidden />
            </button>
          </div>
          {speakMsg && <Notice kind="info">{t(speakMsg)}</Notice>}
          {showProps && props && !readMode && (
            <div className="panel viewer-props">
              <h2>{t('viewerProps')}</h2>
              <div className="grid-2">
                <Field label={t('propTitle')}>{(id) => <input id={id} className="input" dir="auto" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />}</Field>
                <Field label={t('propAuthor')}>{(id) => <input id={id} className="input" dir="auto" value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} />}</Field>
                <Field label={t('propSubject')}>{(id) => <input id={id} className="input" dir="auto" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />}</Field>
                <Field label={t('propKeywords')} hint={t('propKeywordsHint')}>{(id) => <input id={id} className="input" dir="auto" value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} />}</Field>
              </div>
              <dl className="viewer-facts" dir="auto">
                <dt>{t('propPages')}</dt><dd>{pdf.numPages}</dd>
                <dt>{t('propCreator')}</dt><dd dir="auto">{props.creator || '—'}</dd>
                <dt>{t('propProducer')}</dt><dd dir="auto">{props.producer || '—'}</dd>
                <dt>{t('propCreated')}</dt><dd>{fmtDate(props.created)}</dd>
                <dt>{t('propModified')}</dt><dd>{fmtDate(props.modified)}</dd>
              </dl>
              <button type="button" className="btn btn-primary" data-save disabled={propsBusy} onClick={() => void saveProps()}>
                {propsBusy ? t('processing') : t('propSave')}
              </button>
            </div>
          )}

          {!readMode && (
            <form
              className="viewer-search"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                void search();
              }}
            >
              <input className="input" dir="auto" type="search" aria-label={t('viewerFind')} placeholder={t('viewerFind')} value={query} onChange={(e) => setQuery(e.target.value)} />
              <button type="submit" className="btn" disabled={searching || !query.trim()}>
                <Search size={16} aria-hidden /> {searching ? t('processing') : t('viewerSearch')}
              </button>
              {hits && (
                <>
                  <span className="muted" role="status">
                    {hits.length === 0 ? t('viewerNoMatch') : `${current + 1} / ${hits.length}`}
                  </span>
                  <button type="button" className="icon-btn" aria-label={t('viewerPrevMatch')} title={t('viewerPrevMatch')} disabled={hits.length === 0} onClick={() => step(-1)}>
                    <ChevronUp size={18} aria-hidden />
                  </button>
                  <button type="button" className="icon-btn" aria-label={t('viewerNextMatch')} title={t('viewerNextMatch')} disabled={hits.length === 0} onClick={() => step(1)}>
                    <ChevronDown size={18} aria-hidden />
                  </button>
                </>
              )}
            </form>
          )}
          {!readMode && perPage.length > 0 && (
            <p className="viewer-results">
              {perPage.slice(0, 40).map(([p, n]) => (
                <button key={p} type="button" className="chip" onClick={() => { setCurrent(hits!.findIndex((h) => h.page === p)); go(p); }}>
                  {t('pageLabel')} {p + 1} ({n})
                </button>
              ))}
            </p>
          )}

          <div className="viewer-scroll" dir="ltr" ref={boxRef}>
            <div className={`viewer-pages is-${display}`}>
              {(display === 'scroll'
                ? Array.from({ length: pdf.numPages }, (_, i) => i)
                : display === 'two'
                  ? [page, ...(page + 1 < pdf.numPages ? [page + 1] : [])]
                  : [page]
              ).map((n) => (
                <ViewerPage
                  key={n}
                  preview={pdf.preview}
                  page={n}
                  scale={scale}
                  rotation={rotation}
                  hits={pageHits.filter((h) => h.page === n)}
                  current={current}
                  lazy={display === 'scroll'}
                  onVisible={display === 'scroll' ? onSeen : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </ToolPage>
  );
}
