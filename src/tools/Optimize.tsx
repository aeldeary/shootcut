import { useState } from 'react';
import { useI18n } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Checkbox, FileBar } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, downloadBytes, formatBytes } from '../lib/pdf';
import { optimizePdf, type OptimizeLevel, type OptimizeResult } from '../lib/ops/optimize';
import type { Key } from '../i18n';
import { useHistory } from '../hooks/useHistory';

const LEVELS: { id: OptimizeLevel; title: Key; desc: Key }[] = [
  { id: 'light', title: 'optLight', desc: 'optLightDesc' },
  { id: 'balanced', title: 'optBalanced', desc: 'optBalancedDesc' },
  { id: 'strong', title: 'optStrong', desc: 'optStrongDesc' },
  { id: 'flatten', title: 'optFlatten', desc: 'optFlattenDesc' },
];

export function OptimizeTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile({ preview: false });
  const [level, setLevel] = useState<OptimizeLevel>('balanced');
  const [strip, setStrip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [failed, setFailed] = useState(false);
  useHistory({ level, strip }, (s) => { setLevel(s.level); setStrip(s.strip); }, pdf);

  const run = async () => {
    if (!pdf) return;
    setBusy(true);
    setFailed(false);
    setResult(null);
    try {
      setResult(await optimizePdf(pdf.bytes, { level, stripMetadata: strip }));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const saved = result && !result.keptOriginal ? Math.round((1 - result.after / result.before) * 100) : 0;

  return (
    <ToolPage title={t('toolOptimize')} desc={t('toolOptimizeDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('processing')}</p>}
      {pdf && (
        <div className="panel">
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setResult(null); }} />
          <fieldset className="choices">
            <legend>{t('optLevel')}</legend>
            {LEVELS.map((l) => (
              <label key={l.id} className={`choice${level === l.id ? ' is-selected' : ''}`}>
                <input type="radio" name="level" checked={level === l.id} onChange={() => { setLevel(l.id); setResult(null); }} />
                <span>
                  <strong>{t(l.title)}</strong>
                  <span className="muted">{t(l.desc)}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {level !== 'flatten' && <Checkbox checked={strip} onChange={(v) => { setStrip(v); setResult(null); }}>{t('optStrip')}</Checkbox>}
          <div className="actions">
            <button type="button" className="btn btn-primary" data-save disabled={busy} onClick={run}>
              {busy ? t('processing') : t('optAction')}
            </button>
          </div>
          {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
          {result && (
            <div className="result">
              {result.keptOriginal ? (
                <Notice kind="info">{t('optNoGain')}</Notice>
              ) : (
                <Notice kind="success">
                  <bdi>{formatBytes(result.before)}</bdi> → <bdi>{formatBytes(result.after)}</bdi> ({saved}% {t('optSmaller')})
                  {result.imagesRecompressed > 0 && ` · ${result.imagesRecompressed} ${t('optImages')}`}
                </Notice>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => downloadBytes(result.bytes, `${baseName(pdf.file.name)}${t('optSuffix')}.pdf`)}
              >
                {t('download')}
              </button>
            </div>
          )}
        </div>
      )}
    </ToolPage>
  );
}
