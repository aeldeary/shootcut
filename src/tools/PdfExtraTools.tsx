import { useEffect, useState } from 'react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Checkbox, Field, FileBar } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, downloadBytes, formatBytes } from '../lib/pdf';
import { auditPdf, cleanPdf, CLEAN_ALL, type Audit, type CleanOptions } from '../lib/ops/clean';
import { bookletPdf, nUpPdf, type SheetSize } from '../lib/ops/layout';
import { checkAccessibility, fixAccessibility, type Check } from '../lib/ops/a11y';

/* ---------- clean hidden information ---------- */

const CLEAN_KEYS: { key: keyof CleanOptions; label: Key; count: (a: Audit) => number | boolean }[] = [
  { key: 'info', label: 'cleanInfo', count: (a) => a.info.length > 0 || a.xmp },
  { key: 'javascript', label: 'cleanJs', count: (a) => a.javascript },
  { key: 'attachments', label: 'cleanFiles', count: (a) => a.attachments },
  { key: 'comments', label: 'cleanComments', count: (a) => a.comments },
  { key: 'links', label: 'cleanLinks', count: (a) => a.links },
  { key: 'bookmarks', label: 'cleanBookmarks', count: (a) => a.bookmarks },
  { key: 'thumbnails', label: 'cleanThumbs', count: (a) => a.thumbnails },
  { key: 'privateData', label: 'cleanPrivate', count: (a) => a.privateData },
];

export function PdfCleanTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile({ preview: false });
  const [audit, setAudit] = useState<Audit | null>(null);
  const [opts, setOpts] = useState<CleanOptions>(CLEAN_ALL);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ before: number; after: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAudit(null);
    setResult(null);
    if (!pdf) return;
    let live = true;
    auditPdf(pdf.bytes).then((a) => live && setAudit(a)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [pdf]);

  const run = async () => {
    if (!pdf) return;
    setBusy(true);
    setFailed(false);
    try {
      const out = await cleanPdf(pdf.bytes, opts);
      downloadBytes(out, `${baseName(pdf.file.name)}-clean.pdf`);
      setResult({ before: pdf.bytes.length, after: out.length });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={t('toolPdfClean')} desc={t('toolPdfCleanDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('processing')}</p>}
      {pdf && (
        <div className="panel">
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setResult(null); }} />
          {!audit && !failed && <p className="muted">{t('processing')}</p>}
          {audit && (
            <>
              <p className="hint">{t('cleanHint')}</p>
              <fieldset className="choices">
                <legend>{t('cleanWhat')}</legend>
                {CLEAN_KEYS.map(({ key, label, count }) => {
                  const c = count(audit);
                  const found = typeof c === 'number' ? c > 0 : c;
                  return (
                    <Checkbox key={key} checked={opts[key]} onChange={(v) => { setOpts({ ...opts, [key]: v }); setResult(null); }}>
                      {t(label)} <span className="muted">— {found ? (typeof c === 'number' ? `${c}` : t('cleanFound')) : t('cleanNone')}</span>
                    </Checkbox>
                  );
                })}
              </fieldset>
              <Notice kind="info">{t('cleanNote')}</Notice>
              <div className="actions">
                <button type="button" className="btn btn-primary" data-save disabled={busy || !Object.values(opts).some(Boolean)} onClick={run}>
                  {busy ? t('processing') : t('cleanAction')}
                </button>
              </div>
            </>
          )}
          {result && <Notice kind="success">{t('cleanDone')} <bdi>{formatBytes(result.before)}</bdi> → <bdi>{formatBytes(result.after)}</bdi></Notice>}
          {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
        </div>
      )}
    </ToolPage>
  );
}

/* ---------- pages per sheet and booklet ---------- */

type LayoutMode = 'nup' | 'booklet';

export function PdfLayoutTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile({ preview: false });
  const [mode, setMode] = useState<LayoutMode>('nup');
  const [grid, setGrid] = useState('2x2');
  const [sheet, setSheet] = useState<SheetSize>('a4');
  const [landscape, setLandscape] = useState(false);
  const [border, setBorder] = useState(true);
  const [rtl, setRtl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    if (!pdf) return;
    setBusy(true);
    setFailed(false);
    setDone(false);
    try {
      const [cols, rows] = grid.split('x').map(Number);
      const out = mode === 'nup' ? await nUpPdf(pdf.bytes, { cols, rows, sheet, landscape, margin: 14, border, rtl }) : await bookletPdf(pdf.bytes, sheet, rtl);
      downloadBytes(out, `${baseName(pdf.file.name)}-${mode === 'nup' ? grid : 'booklet'}.pdf`);
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={t('toolPdfLayout')} desc={t('toolPdfLayoutDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('processing')}</p>}
      {pdf && (
        <div className="panel">
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setDone(false); }} />
          <div className="tabs" role="tablist">
            {(['nup', 'booklet'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} className={`tab${mode === m ? ' is-active' : ''}`} onClick={() => { setMode(m); setDone(false); }}>
                {t(m === 'nup' ? 'layoutNup' : 'layoutBooklet')}
              </button>
            ))}
          </div>
          <p className="hint">{t(mode === 'nup' ? 'layoutNupHint' : 'layoutBookletHint')}</p>
          <div className="grid-2">
            {mode === 'nup' && (
              <Field label={t('layoutGrid')}>
                {(id) => (
                  <select id={id} className="input" value={grid} onChange={(e) => { setGrid(e.target.value); setDone(false); }}>
                    {['2x1', '2x2', '3x2', '3x3', '4x3', '4x4'].map((g) => (
                      <option key={g} value={g}>{g.replace('x', ' × ')}</option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Field label={t('layoutSheet')}>
              {(id) => (
                <select id={id} className="input" value={sheet} onChange={(e) => { setSheet(e.target.value as SheetSize); setDone(false); }}>
                  <option value="a4">A4</option>
                  <option value="a3">A3</option>
                  <option value="letter">Letter</option>
                </select>
              )}
            </Field>
          </div>
          {mode === 'nup' && <Checkbox checked={landscape} onChange={(v) => { setLandscape(v); setDone(false); }}>{t('layoutLandscape')}</Checkbox>}
          {mode === 'nup' && <Checkbox checked={border} onChange={(v) => { setBorder(v); setDone(false); }}>{t('layoutBorder')}</Checkbox>}
          <Checkbox checked={rtl} onChange={(v) => { setRtl(v); setDone(false); }}>{t('layoutRtl')}</Checkbox>
          <div className="actions">
            <button type="button" className="btn btn-primary" data-save disabled={busy} onClick={run}>
              {busy ? t('processing') : t('layoutAction')}
            </button>
          </div>
          {done && <Notice kind="success">{t('layoutDone')}</Notice>}
          {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
        </div>
      )}
    </ToolPage>
  );
}

/* ---------- accessibility check ---------- */

export function PdfA11yTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState('ar');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fixed, setFixed] = useState(false);

  const examine = async (data: Uint8Array, preview: NonNullable<typeof pdf>['preview'] | null, pages: number) => {
    let hasText: boolean | null = null;
    if (preview) {
      hasText = false;
      for (let i = 0; i < Math.min(pages, 5) && !hasText; i++) hasText = (await preview.textItems(i)).some((x) => x.str.trim() !== '');
    }
    setChecks(await checkAccessibility(data, hasText));
  };

  useEffect(() => {
    setChecks(null);
    setBytes(null);
    setFixed(false);
    if (!pdf) return;
    setBytes(pdf.bytes);
    setTitle((pdf.file.name || '').replace(/\.pdf$/i, ''));
    let live = true;
    examine(pdf.bytes, pdf.preview, pdf.numPages).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [pdf]);

  const fix = async () => {
    if (!pdf || !bytes) return;
    setBusy(true);
    setFailed(false);
    try {
      const out = await fixAccessibility(bytes, { title, lang });
      downloadBytes(out, `${baseName(pdf.file.name)}-accessible.pdf`);
      setBytes(out);
      await examine(out, pdf.preview, pdf.numPages);
      setFixed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const icon = (c: Check) => (c.state === 'pass' ? '✔' : c.state === 'fail' ? '✖' : '?');
  const canFix = checks?.some((c) => c.fixable && c.state === 'fail');

  return (
    <ToolPage title={t('toolPdfA11y')} desc={t('toolPdfA11yDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('processing')}</p>}
      {pdf && (
        <div className="panel">
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setFixed(false); }} />
          {!checks && !failed && <p className="muted">{t('processing')}</p>}
          {checks && (
            <>
              <ul className="list a11y-list">
                {checks.map((c) => (
                  <li key={c.id} className={`row a11y-${c.state}`}>
                    <span className="row-index" aria-hidden>{icon(c)}</span>
                    <div className="row-main">
                      <div className="row-name">{t(`a11y_${c.id}` as Key)}</div>
                      <div className="row-meta">
                        {t(`a11yState_${c.state}` as Key)}
                        {c.count ? <> · <bdi>{c.count}</bdi></> : null}
                        {c.state === 'fail' && ` — ${t(`a11yHow_${c.id}` as Key)}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <Notice kind="info">{t('a11yManual')}</Notice>
              {canFix && (
                <>
                  <Field label={t('a11yTitle')}>{(id) => <input id={id} className="input" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
                  <Field label={t('a11yLang')}>
                    {(id) => (
                      <select id={id} className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
                        <option value="ar">العربية (ar)</option>
                        <option value="en">English (en)</option>
                        <option value="tr">Türkçe (tr)</option>
                        <option value="fr">Français (fr)</option>
                      </select>
                    )}
                  </Field>
                  <div className="actions">
                    <button type="button" className="btn btn-primary" data-save disabled={busy} onClick={fix}>
                      {busy ? t('processing') : t('a11yFix')}
                    </button>
                  </div>
                </>
              )}
              {fixed && <Notice kind="success">{t('a11yFixed')}</Notice>}
            </>
          )}
          {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
        </div>
      )}
    </ToolPage>
  );
}
