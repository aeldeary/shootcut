import { useState } from 'react';
import { useI18n } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Checkbox, Field, FileBar, PageRangeField } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, downloadBytes } from '../lib/pdf';
import { exportImages, zipFiles } from '../lib/ops/export';
import { parsePageRange } from '../lib/range';
import { useHistory } from '../hooks/useHistory';

export function ExportTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [dpi, setDpi] = useState(150);
  const [range, setRange] = useState('');
  const [zip, setZip] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  useHistory({ format, dpi, zip }, (s) => { setFormat(s.format); setDpi(s.dpi); setZip(s.zip); setDone(false); }, pdf);

  const pages = pdf ? parsePageRange(range, pdf.numPages) : null;

  const run = async () => {
    if (!pdf || !pages) return;
    setBusy(true);
    setDone(false);
    setFailed(false);
    try {
      const files = await exportImages(pdf.preview, { format, dpi, pages, fileName: pdf.file.name }, (d, n) => setProgress([d, n]));
      const stem = baseName(pdf.file.name);
      if (files.length === 1) {
        downloadBytes(files[0].bytes, files[0].name, format === 'png' ? 'image/png' : 'image/jpeg');
      } else if (zip) {
        downloadBytes(zipFiles(files), `${stem}-images.zip`, 'application/zip');
      } else {
        // some browsers ask permission for several downloads in a row
        for (const f of files) downloadBytes(f.bytes, f.name, format === 'png' ? 'image/png' : 'image/jpeg');
      }
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <ToolPage title={t('toolExport')} desc={t('toolExportDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} onRejected={() => undefined} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('loadingPages')}</p>}
      {pdf && (
        <div className="panel">
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setDone(false); }} />
          <div className="grid-2">
            <Field label={t('exportFormat')}>
              {(id) => (
                <select id={id} className="input" value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'jpeg')}>
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                </select>
              )}
            </Field>
            <Field label={t('exportQuality')} hint={t('exportQualityHint')}>
              {(id) => (
                <select id={id} className="input" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                  <option value={72}>72 dpi</option>
                  <option value={150}>150 dpi</option>
                  <option value={200}>200 dpi</option>
                  <option value={300}>300 dpi</option>
                </select>
              )}
            </Field>
          </div>
          <PageRangeField value={range} onChange={setRange} total={pdf.numPages} />
          {(pages?.length ?? 0) > 1 && <Checkbox checked={zip} onChange={setZip}>{t('exportZip')}</Checkbox>}
          <div className="actions">
            <button type="button" className="btn btn-primary" data-save disabled={busy || !pages} onClick={run}>
              {busy ? `${t('processing')} ${progress ? `${progress[0]} / ${progress[1]}` : ''}` : t('exportAction')}
            </button>
          </div>
          {done && <Notice kind="success">{t('exportDone')}</Notice>}
          {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
        </div>
      )}
    </ToolPage>
  );
}
