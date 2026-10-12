import { useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Checkbox, Field, FileBar, PageRangeField } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { PageStage, type StagePointer } from '../components/PageStage';
import { viewBox, viewRect } from '../components/marks';
import { rectFromPoints, type Rect } from '../lib/ops/textselect';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, canvasToBytes, decodeImage, downloadBytes, isPdf } from '../lib/pdf';
import { createPdf, type CreateImage } from '../lib/ops/create';
import { addTextLayer, browserOcrPaths, createOcrEngine, recognizePages, type OcrLang } from '../lib/ops/ocr';
import { parsePageRange } from '../lib/range';
import { useHistory } from '../hooks/useHistory';

async function toImage(file: File): Promise<CreateImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)) return { bytes, mime: 'image/jpeg' };
  if (file.type === 'image/png' || /\.png$/i.test(file.name)) return { bytes, mime: 'image/png' };
  return { bytes: await canvasToBytes(await decodeImage(bytes), 'image/png'), mime: 'image/png' };
}

export function OcrTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt, setError } = usePdfFile();
  const [ar, setAr] = useState(true);
  const [en, setEn] = useState(true);
  const [dpi, setDpi] = useState(300);
  const [range, setRange] = useState('');
  const [content, setContent] = useState<'auto' | 'document' | 'poster'>('auto');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'engine' | 'pages' | null>(null);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [result, setResult] = useState<{ pdf: Uint8Array; text: string; words: number; poster: boolean } | null>(null);
  const [failed, setFailed] = useState<Key | null>(null);
  const [copied, setCopied] = useState(false);
  const [areaMode, setAreaMode] = useState(false);
  const [stagePage, setStagePage] = useState(0);
  const [area, setArea] = useState<{ page: number; rect: Rect } | null>(null);
  const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const startView = useRef<[number, number] | null>(null);
  const startPdf = useRef<[number, number] | null>(null);
  useHistory({ ar, en, dpi, content, areaMode, area }, (s) => { setAr(s.ar); setEn(s.en); setDpi(s.dpi); setContent(s.content); setAreaMode(s.areaMode); setArea(s.area); setResult(null); }, pdf);

  const down = (p: StagePointer) => {
    startView.current = p.view;
    startPdf.current = p.pdf;
    setDrag({ a: p.view, b: p.view });
  };
  const move = (p: StagePointer) => {
    if (startView.current) setDrag({ a: startView.current, b: p.view });
  };
  const up = (p: StagePointer) => {
    const from = startPdf.current;
    startView.current = null;
    startPdf.current = null;
    setDrag(null);
    if (!from) return;
    const rect = rectFromPoints(from, p.pdf);
    if (rect.width < 8 || rect.height < 8) return;
    setArea({ page: stagePage, rect });
    setResult(null);
  };

  const pages = pdf ? parsePageRange(range, pdf.numPages) : null;
  const langs: OcrLang[] = [...(ar ? (['ara'] as const) : []), ...(en ? (['eng'] as const) : [])];

  const open = async (files: File[]) => {
    setResult(null);
    const pdfs = files.filter(isPdf);
    if (pdfs.length === 1 && files.length === 1) {
      await load(pdfs[0]);
      return;
    }
    if (pdfs.length > 0) {
      setError('ocrMixed');
      return;
    }
    // photos or scans: put them into one PDF first
    try {
      const images = await Promise.all(files.map(toImage));
      const bytes = await createPdf({ images, pageSize: 'fit' });
      const name = files.length === 1 ? `${baseName(files[0].name)}.pdf` : t('scannedName');
      await load(new File([bytes as unknown as BlobPart], name, { type: 'application/pdf' }));
    } catch {
      setError('errImage');
    }
  };

  const run = async () => {
    if (!pdf || !pages || langs.length === 0) return;
    setBusy(true);
    setFailed(null);
    setResult(null);
    setStage('engine');
    setProgress([0, pages.length]);
    let engine: Awaited<ReturnType<typeof createOcrEngine>> | null = null;
    try {
      engine = await createOcrEngine(langs, browserOcrPaths());
      setStage('pages');
      const results = await recognizePages(pdf.preview, engine, { pages: areaMode && area ? [area.page] : pages, dpi, content, region: areaMode && area ? area : undefined, onPage: (d, n) => setProgress([d, n]) });
      const text = results.map((r) => `--- ${t('pageLabel')} ${r.page + 1} ---\n${r.text}`).join('\n\n');
      setResult({ pdf: await addTextLayer(pdf.bytes, results), text, words: results.reduce((n, r) => n + r.words.length, 0), poster: results.some((r) => r.poster) });
    } catch {
      setFailed('ocrFailed');
    } finally {
      await engine?.terminate().catch(() => undefined);
      setBusy(false);
      setStage(null);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <ToolPage title={t('toolOcr')} desc={t('toolOcrDesc')}>
      {!pdf && <Dropzone kind="scan" multiple onFiles={open} onRejected={() => setError('ocrOnlyScan')} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('loadingPages')}</p>}
      {pdf && (
        <div className="panel">
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setResult(null); setArea(null); setStagePage(0); }} />
          <fieldset className="choices">
            <legend>{t('ocrLangs')}</legend>
            <Checkbox checked={ar} onChange={setAr}>{t('ocrArabic')}</Checkbox>
            <Checkbox checked={en} onChange={setEn}>{t('ocrEnglish')}</Checkbox>
          </fieldset>
          <div className="grid-2">
            <Field label={t('exportQuality')} hint={t('ocrDpiHint')}>
              {(id) => (
                <select id={id} className="input" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                  <option value={200}>200 dpi ({t('ocrFaster')})</option>
                  <option value={300}>300 dpi ({t('ocrAccurate')})</option>
                </select>
              )}
            </Field>
            <PageRangeField value={range} onChange={setRange} total={pdf.numPages} />
          </div>
          <Field label={t('ocrContent')} hint={t('ocrContentHint')}>
            {(id) => (
              <select id={id} className="input" value={content} onChange={(e) => setContent(e.target.value as typeof content)}>
                <option value="auto">{t('ocrContentAuto')}</option>
                <option value="document">{t('ocrContentDoc')}</option>
                <option value="poster">{t('ocrContentPoster')}</option>
              </select>
            )}
          </Field>
          <Checkbox checked={areaMode} onChange={(v) => { setAreaMode(v); setResult(null); }}>{t('ocrArea')}</Checkbox>
          {areaMode && (
            <div>
              <p className="hint">{area ? t('ocrAreaSet') : t('ocrAreaHint')}</p>
              <PageStage preview={pdf.preview} page={stagePage} onPage={setStagePage} cursor="crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
                {(vp) => (
                  <>
                    {area && area.page === stagePage && <span className="mark redact-box" style={viewRect(vp, area.rect)} />}
                    {drag && <span className="mark rubber" style={viewBox(drag.a, drag.b)} />}
                  </>
                )}
              </PageStage>
              {area && (
                <button type="button" className="btn btn-small" onClick={() => setArea(null)}>
                  {t('ocrAreaClear')}
                </button>
              )}
            </div>
          )}
          <Notice kind="info">{t('ocrFirstRun')}</Notice>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={busy || !pages || langs.length === 0 || (areaMode && !area)} onClick={run}>
              {busy ? t('processing') : t('ocrAction')}
            </button>
            {busy && (
              <span className="muted">
                {stage === 'engine' ? t('ocrLoadingEngine') : `${t('ocrReading')} ${progress[0]} / ${progress[1]}`}
              </span>
            )}
          </div>
          {langs.length === 0 && <p className="muted">{t('ocrPickLang')}</p>}
          {failed && <Notice kind="error">{t(failed)}</Notice>}
          {result && (
            <div className="result">
              <Notice kind="success">
                {result.words} {t('ocrWords')}. {t('ocrReview')}
              </Notice>
              {result.poster && <Notice kind="info">{t('ocrPosterWarn')}</Notice>}
              <div className="actions">
                <button type="button" className="btn btn-primary" data-save onClick={() => downloadBytes(result.pdf, `${baseName(pdf.file.name)}${t('ocrSuffix')}.pdf`)}>
                  {t('ocrDownloadPdf')}
                </button>
                <button type="button" className="btn" onClick={() => downloadBytes(new TextEncoder().encode(`﻿${result.text}`), `${baseName(pdf.file.name)}.txt`, 'text/plain;charset=utf-8')}>
                  {t('ocrDownloadTxt')}
                </button>
                <button type="button" className="btn" onClick={copy}>
                  <Copy size={16} aria-hidden /> {copied ? t('copied') : t('copy')}
                </button>
              </div>
              <textarea className="input ocr-text" readOnly dir="auto" rows={12} value={result.text} aria-label={t('ocrText')} />
            </div>
          )}
        </div>
      )}
    </ToolPage>
  );
}
