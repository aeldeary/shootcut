import { useState } from 'react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Field, FileBar, PageRangeField } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { downloadBytes } from '../lib/pdf';
import { convertPdf, type ConvertFormat } from '../lib/ops/convert';
import { parsePageRange } from '../lib/range';
import { useHistory } from '../hooks/useHistory';

const FORMATS: { id: ConvertFormat; label: Key; hint: Key }[] = [
  { id: 'docx', label: 'convertDocx', hint: 'convertDocxHint' },
  { id: 'xlsx', label: 'convertXlsx', hint: 'convertXlsxHint' },
  { id: 'pptx', label: 'convertPptx', hint: 'convertPptxHint' },
  { id: 'txt', label: 'convertTxt', hint: 'convertTxtHint' },
  { id: 'rtf', label: 'convertRtf', hint: 'convertRtfHint' },
  { id: 'html', label: 'convertHtml', hint: 'convertHtmlHint' },
  { id: 'xml', label: 'convertXml', hint: 'convertXmlHint' },
];

export function ConvertTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [format, setFormat] = useState<ConvertFormat>('docx');
  const [range, setRange] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ chars: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useHistory({ format }, (s) => { setFormat(s.format); setDone(null); }, pdf);

  const pages = pdf ? parsePageRange(range, pdf.numPages) : null;
  const current = FORMATS.find((f) => f.id === format)!;

  const run = async () => {
    if (!pdf || !pages) return;
    setBusy(true);
    setFailed(false);
    setDone(null);
    try {
      const r = await convertPdf(pdf.preview, pdf.file.name, format, pages);
      downloadBytes(r.bytes, r.name, r.mime);
      setDone({ chars: r.chars });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={t('toolConvert')} desc={t('toolConvertDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('loadingPages')}</p>}
      {pdf && (
        <div className="panel">
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setDone(null); }} />
          <Field label={t('convertFormat')} hint={t(current.hint)}>
            {(id) => (
              <select id={id} className="input" value={format} onChange={(e) => setFormat(e.target.value as ConvertFormat)}>
                {FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {t(f.label)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <PageRangeField value={range} onChange={setRange} total={pdf.numPages} />
          <Notice kind="info">{t('convertNote')}</Notice>
          <div className="actions">
            <button type="button" className="btn btn-primary" data-save disabled={busy || !pages} onClick={run}>
              {busy ? t('processing') : t('convertAction')}
            </button>
          </div>
          {done && done.chars > 0 && <Notice kind="success">{t('convertDone')}</Notice>}
          {done && done.chars === 0 && format !== 'pptx' && (
            <Notice kind="error">
              {t('convertNoText')} <a href="#/ocr">{t('toolOcr')}</a>
            </Notice>
          )}
          {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
          <p className="muted">
            {t('convertMore')} <a href="#/export">{t('toolExport')}</a> · <a href="#/optimize">{t('toolOptimize')}</a> · <a href="#/protect">{t('toolProtect')}</a> · <a href="#/print">{t('toolPrint')}</a>
          </p>
        </div>
      )}
    </ToolPage>
  );
}
