import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { useI18n } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Field, FileBar, PageRangeField } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { commonOrientation, renderPrintPage, renderPrintPages, type PrintColor, type PrintPage } from '../lib/ops/print';
import { parsePageRange } from '../lib/range';
import { useHistory } from '../hooks/useHistory';
import { useShortcuts } from '../hooks/useShortcuts';

const MODES: { id: PrintColor; label: 'printColor' | 'printGray' | 'printBw'; hint: 'printColorHint' | 'printGrayHint' | 'printBwHint' }[] = [
  { id: 'color', label: 'printColor', hint: 'printColorHint' },
  { id: 'gray', label: 'printGray', hint: 'printGrayHint' },
  { id: 'bw', label: 'printBw', hint: 'printBwHint' },
];

export function PrintTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [color, setColor] = useState<PrintColor>('color');
  const [threshold, setThreshold] = useState(170);
  const [dpi, setDpi] = useState(200);
  const [range, setRange] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [sheets, setSheets] = useState<PrintPage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  useHistory({ color, threshold, dpi }, (s) => { setColor(s.color); setThreshold(s.threshold); setDpi(s.dpi); }, pdf);

  const pages = pdf ? parsePageRange(range, pdf.numPages) : null;

  // small live preview of the first selected page, so the effect of the colour mode is visible before printing
  useEffect(() => {
    if (!pdf || !pages || pages.length === 0) return;
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      renderPrintPage(pdf.preview, pages[0], { color, threshold, dpi: 60 }).then(
        (p) => mine === seq.current && setPreview(p.url),
        () => undefined,
      );
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, color, threshold, range]);

  // clear the printable copy once the print dialog is closed
  useEffect(() => {
    const done = () => setSheets(null);
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, []);

  const print = async () => {
    if (!pdf || !pages) return;
    setBusy(true);
    setFailed(false);
    try {
      const rendered = await renderPrintPages(pdf.preview, pages, { color, threshold, dpi }, (d, n) => setProgress([d, n]));
      setSheets(rendered);
      // wait for the sheets to be in the document before opening the dialog
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      window.print();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const orientation = sheets ? commonOrientation(sheets) : 'auto';

  // Ctrl+P prints here instead of opening the browser's own print dialog
  useShortcuts({ print: () => (pdf && !busy && pages && pages.length > 0 ? void print() : false) });

  return (
    <ToolPage title={t('toolPrint')} desc={t('toolPrintDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('loadingPages')}</p>}
      {pdf && (
        <div className="work">
          <div className="panel">
            <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setPreview(null); }} />
            <fieldset className="choices">
              <legend>{t('printColorMode')}</legend>
              {MODES.map((m) => (
                <label key={m.id} className="radio-row">
                  <input type="radio" name="print-color" checked={color === m.id} onChange={() => setColor(m.id)} />
                  <span>
                    <strong>{t(m.label)}</strong>
                    <span className="muted"> — {t(m.hint)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {color === 'bw' && (
              <Field label={`${t('printThreshold')}: ${threshold}`} hint={t('printThresholdHint')}>
                {(id) => <input id={id} type="range" min={60} max={230} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />}
              </Field>
            )}
            <div className="grid-2">
              <PageRangeField value={range} onChange={setRange} total={pdf.numPages} />
              <Field label={t('exportQuality')} hint={t('printQualityHint')}>
                {(id) => (
                  <select id={id} className="input" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                    <option value={150}>150 dpi</option>
                    <option value={200}>200 dpi</option>
                    <option value={300}>300 dpi</option>
                  </select>
                )}
              </Field>
            </div>
            <Notice kind="info">{t('printNote')}</Notice>
            <div className="actions">
              <button type="button" className="btn btn-primary" disabled={busy || !pages || pages.length === 0} onClick={print}>
                <Printer size={16} aria-hidden /> {busy ? `${t('processing')} ${progress ? `${progress[0]} / ${progress[1]}` : ''}` : t('printAction')}
              </button>
            </div>
            {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
          </div>
          <aside className="side">
            <div className="panel">
              <p className="panel-title">{t('printPreview')}</p>
              {preview ? <img className="print-preview" src={preview} alt={t('printPreview')} /> : <p className="muted">{t('loadingPages')}</p>}
            </div>
          </aside>
        </div>
      )}
      {sheets &&
        createPortal(
          <div id="print-root" data-orientation={orientation}>
            {orientation !== 'auto' && <style>{`@page { size: ${orientation}; margin: 6mm; }`}</style>}
            {sheets.map((s, i) => (
              <img key={i} src={s.url} alt="" className="print-sheet" />
            ))}
          </div>,
          document.body,
        )}
    </ToolPage>
  );
}
