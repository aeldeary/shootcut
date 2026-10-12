import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronLeft, ChevronRight, ScanSearch } from 'lucide-react';
import { TOOLS } from '../lib/tools';
import { holdFile } from '../lib/handoff';
import { useShortcuts } from '../hooks/useShortcuts';
import { useI18n } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { FileBar } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { createCanvas, type CanvasLike, type PdfPreview } from '../lib/pdf';
import { inspectPdf, type Inspection } from '../lib/ops/inspect';

interface PageProps {
  preview: PdfPreview;
  index: number;
  /** width in CSS px the page is drawn at */
  width: number;
  /** told when this page enters or leaves the reading band near the top of the screen */
  onSeen: (index: number, inMiddle: boolean) => void;
}

/**
 * One page of the continuous preview. It reserves its final height up front so the scrollbar is right,
 * draws only while it is near the screen, and frees the bitmap when it is far away (long files on phones).
 */
function InspectPage({ preview, index, width, onSeen }: PageProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    let cancelled = false;
    preview.pageSize(index).then((s) => !cancelled && setSize(s), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [preview, index]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const nearObs = new IntersectionObserver((e) => e.forEach((x) => setNear(x.isIntersecting)), { rootMargin: '1200px 0px' });
    // a band just under the header: the page there is the one being read, whatever its height
    const seenObs = new IntersectionObserver((e) => e.forEach((x) => onSeen(index, x.isIntersecting)), { rootMargin: '-120px 0px -65% 0px' });
    nearObs.observe(el);
    seenObs.observe(el);
    return () => {
      nearObs.disconnect();
      seenObs.disconnect();
      onSeen(index, false);
    };
  }, [index, onSeen]);

  useEffect(() => {
    const target = canvasRef.current;
    if (!target) return;
    if (!near || !size || width <= 0) {
      target.width = 0;
      target.height = 0;
      return;
    }
    let cancelled = false;
    (async () => {
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
      const scale = width / size.width;
      const off: CanvasLike = createCanvas(1, 1);
      await preview.renderToCanvas(index, off, scale * dpr);
      if (cancelled) return;
      const ctx = target.getContext('2d');
      if (!ctx) return;
      target.width = off.width;
      target.height = off.height;
      ctx.drawImage(off as unknown as CanvasImageSource, 0, 0);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [preview, index, near, size, width]);

  return (
    <div
      className="inspect-page"
      id={`inspect-page-${index}`}
      ref={boxRef}
      style={size ? { aspectRatio: `${size.width} / ${size.height}` } : { aspectRatio: '1 / 1.414' }}
    >
      <canvas ref={canvasRef} data-testid="inspect-canvas" />
      <span className="inspect-num" aria-hidden>
        {index + 1}
      </span>
    </div>
  );
}

/** tools that take one PDF and load it by themselves when it is handed over */
const OPEN_IN = ['viewer', 'organize', 'merge', 'share', 'print', 'ocr', 'export', 'convert', 'fill-sign', 'form', 'comment', 'stamp', 'measure', 'protect', 'redact', 'optimize'];

const CONTENT_KEY = { text: 'inspectText', scanned: 'inspectScanned', mixed: 'inspectMixed', unknown: 'inspectUnknown' } as const;

export function InspectTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [info, setInfo] = useState<Inspection | null>(null);
  const [page, setPage] = useState(0);
  const [width, setWidth] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInfo(null);
    setPage(0);
    if (!pdf) return;
    let cancelled = false;
    inspectPdf(pdf.bytes, pdf.preview).then((r) => !cancelled && setInfo(r), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdf]);

  const middle = useRef(new Set<number>());
  const lastPage = useRef(0);
  lastPage.current = pdf ? pdf.numPages - 1 : 0;
  const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  const onSeen = useCallback((i: number, inMiddle: boolean) => {
    if (inMiddle) middle.current.add(i);
    else middle.current.delete(i);
    if (atBottom()) setPage(lastPage.current);
    else if (middle.current.size > 0) setPage(Math.min(...middle.current));
  }, []);
  // at the very bottom the last pages can never reach the top of the screen, so call it the last page
  useEffect(() => {
    if (!pdf) return;
    const last = pdf.numPages - 1;
    const onScroll = () => {
      if (atBottom()) setPage(last);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pdf]);

  const go = (i: number) => {
    if (!pdf) return;
    const n = Math.min(Math.max(i, 0), pdf.numPages - 1);
    setPage(n);
    document.getElementById(`inspect-page-${n}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // the numbers sit in their own left-to-right run so the Arabic text around them cannot scramble them
  // Ctrl+Page Down / Page Up move a page at a time; plain Home, End and arrows keep scrolling the page
  useShortcuts({
    nextPage: (e) => (pdf && (e.ctrlKey || e.metaKey) ? go(page + 1) : false),
    prevPage: (e) => (pdf && (e.ctrlKey || e.metaKey) ? go(page - 1) : false),
    firstPage: (e) => (pdf && (e.ctrlKey || e.metaKey) ? go(0) : false),
    lastPage: (e) => (pdf && (e.ctrlKey || e.metaKey) ? go(pdf.numPages - 1) : false),
  });

  const sizeText = (s: Inspection['sizes'][number]) => (
    <>
      {s.size.name ?? t('inspectCustomSize')} · <bdi dir="ltr">{s.size.widthMm}×{s.size.heightMm} mm</bdi>
      {s.size.landscape ? ` · ${t('inspectLandscape')}` : ''}
    </>
  );

  return (
    <ToolPage title={t('toolInspect')} desc={t('toolInspectDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('loadingPages')}</p>}
      {pdf && (
        <div className="inspect">
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={reset} />

          <section className="panel" aria-label={t('inspectFacts')}>
            <h2 className="panel-title">
              <ScanSearch size={18} aria-hidden />
              {t('inspectFacts')}
            </h2>
            {!info && <p className="muted">{t('loadingPages')}</p>}
            {info && (
              <dl className="viewer-facts">
                <dt>{t('inspectPages')}</dt>
                <dd>{info.pages}</dd>
                <dt>{t('inspectPaper')}</dt>
                <dd>
                  {info.sizes.length === 0 && '—'}
                  {info.sizes.map((s) => (
                    <div key={`${s.size.name}-${s.size.widthMm}-${s.size.heightMm}`}>
                      {sizeText(s)}
                      {info.sizes.length > 1 && <> (<bdi dir="ltr">{s.count}</bdi>)</>}
                    </div>
                  ))}
                </dd>
                <dt>{t('inspectContent')}</dt>
                <dd>{t(CONTENT_KEY[info.content])}</dd>
                <dt>{t('inspectForm')}</dt>
                <dd>{info.formFields > 0 ? `${info.formFields}` : t('inspectNoForm')}</dd>
                <dt>{t('inspectProtected')}</dt>
                <dd>{pdf.wasEncrypted ? t('inspectYes') : t('inspectNo')}</dd>
                {info.props?.title && (
                  <>
                    <dt>{t('propTitle')}</dt>
                    <dd>{info.props.title}</dd>
                  </>
                )}
                {info.props?.author && (
                  <>
                    <dt>{t('propAuthor')}</dt>
                    <dd>{info.props.author}</dd>
                  </>
                )}
                {info.props?.producer && (
                  <>
                    <dt>{t('propProducer')}</dt>
                    <dd>{info.props.producer}</dd>
                  </>
                )}
                {info.props?.created && (
                  <>
                    <dt>{t('propCreated')}</dt>
                    <dd>{info.props.created.toLocaleDateString()}</dd>
                  </>
                )}
              </dl>
            )}
          </section>

          <section className="panel" aria-label={t('inspectOpenIn')}>
            <h2 className="panel-title">{t('inspectOpenIn')}</h2>
            <div className="inspect-open">
              {TOOLS.filter((x) => OPEN_IN.includes(x.id)).map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className="btn btn-small"
                    onClick={() => {
                      holdFile(new File([pdf.bytes as BlobPart], pdf.file.name, { type: 'application/pdf' }));
                      window.location.hash = `#/${tool.id}`;
                    }}
                  >
                    <Icon size={16} aria-hidden />
                    {t(tool.name)}
                  </button>
                );
              })}
            </div>
          </section>

          <h2 className="inspect-heading">{t('inspectPreview')}</h2>
          <div className="inspect-pages" ref={listRef} dir="ltr">
            {Array.from({ length: pdf.numPages }, (_, i) => (
              <InspectPage key={`${pdf.file.name}-${i}`} preview={pdf.preview} index={i} width={width} onSeen={onSeen} />
            ))}
          </div>

          <div className="inspect-bar" dir="ltr" role="group" aria-label={t('inspectNav')}>
            <button type="button" className="icon-btn" aria-label={t('prevPage')} disabled={page <= 0} onClick={() => go(page - 1)}>
              <ChevronLeft size={18} aria-hidden />
            </button>
            <span className="stage-page" data-testid="inspect-current">
              {page + 1} / {pdf.numPages}
            </span>
            <button type="button" className="icon-btn" aria-label={t('nextPage')} disabled={page >= pdf.numPages - 1} onClick={() => go(page + 1)}>
              <ChevronRight size={18} aria-hidden />
            </button>
            <button type="button" className="icon-btn" aria-label={t('inspectTop')} title={t('inspectTop')} onClick={() => go(0)}>
              <ArrowUp size={18} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </ToolPage>
  );
}
