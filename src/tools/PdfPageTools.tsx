import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Field, FileBar, PageRangeField } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, canvasToBytes, createCanvas, downloadBytes, formatBytes, openPreview, readBytes } from '../lib/pdf';
import { zipFiles } from '../lib/ops/export';
import { createPdf } from '../lib/ops/create';
import { complement, cropPdf, extractPdfPages, repairPdf, splitGroups, splitPdf, type Margins, type RepairResult, type SplitMode } from '../lib/ops/pdftools';
import { parsePageRange } from '../lib/range';

const MM = 72 / 25.4;
const num = (v: string) => (v.trim() === '' ? 0 : Math.max(0, Number(v.replace(/،/g, '.').replace(/,/g, '.')) || 0));

function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={`tab${value === o.id ? ' is-active' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PdfSplitTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile({ preview: false });
  const [kind, setKind] = useState<SplitMode['kind']>('ranges');
  const [text, setText] = useState('');
  const [every, setEvery] = useState('2');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  const mode: SplitMode = kind === 'ranges' ? { kind, text } : kind === 'every' ? { kind, n: num(every) } : { kind };
  const groups = pdf ? splitGroups(pdf.numPages, mode) : null;

  const run = async () => {
    if (!pdf || !groups) return;
    setBusy(true);
    setFailed(false);
    setMade(null);
    try {
      const files = await splitPdf(pdf.bytes, pdf.file.name, mode);
      if (files.length === 1) downloadBytes(files[0].bytes, files[0].name);
      else downloadBytes(zipFiles(files), `${baseName(pdf.file.name)}-split.zip`, 'application/zip');
      setMade(files.length);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={t('toolPdfSplit')} desc={t('toolPdfSplitDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('processing')}</p>}
      {pdf && (
        <div className="panel">
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setMade(null); }} />
          <Tabs
            value={kind}
            onChange={(k) => { setKind(k); setMade(null); }}
            options={[
              { id: 'ranges', label: t('splitRanges') },
              { id: 'every', label: t('splitEvery') },
              { id: 'each', label: t('splitEach') },
            ]}
          />
          {kind === 'ranges' && (
            <Field label={t('splitRangesLabel')} hint={`${t('splitRangesHint')} (1–${pdf.numPages})`}>
              {(id) => <input id={id} className={`input${text.trim() && !groups ? ' is-invalid' : ''}`} dir="ltr" value={text} placeholder="1-3, 4-6, 7" onChange={(e) => { setText(e.target.value); setMade(null); }} />}
            </Field>
          )}
          {kind === 'every' && (
            <Field label={t('splitEveryLabel')}>
              {(id) => <input id={id} className="input" type="number" min={1} max={pdf.numPages} inputMode="numeric" value={every} onChange={(e) => { setEvery(e.target.value); setMade(null); }} />}
            </Field>
          )}
          {groups && <p className="muted">{t('splitWillMake')} <bdi>{groups.length}</bdi> {t(groups.length === 1 ? 'file' : 'files')}</p>}
          {kind === 'ranges' && text.trim() && !groups && <Notice kind="error">{t('pagesRangeInvalid')}</Notice>}
          <div className="actions">
            <button type="button" className="btn btn-primary" data-save disabled={busy || !groups} onClick={run}>
              {busy ? t('processing') : t('splitAction')}
            </button>
          </div>
          {made !== null && <Notice kind="success">{t('splitDone')} <bdi>{made}</bdi></Notice>}
          {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
        </div>
      )}
    </ToolPage>
  );
}

export function PdfExtractTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile({ preview: false });
  const [mode, setMode] = useState<'extract' | 'remove'>('extract');
  const [range, setRange] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const picked = pdf ? parsePageRange(range, pdf.numPages) : null;
  const keep = pdf && picked && range.trim() ? (mode === 'extract' ? picked : complement(pdf.numPages, picked)) : null;
  const removesAll = keep !== null && keep.length === 0;

  const run = async () => {
    if (!pdf || !keep || removesAll) return;
    setBusy(true);
    setFailed(false);
    setDone(false);
    try {
      downloadBytes(await extractPdfPages(pdf.bytes, keep), `${baseName(pdf.file.name)}${t(mode === 'extract' ? 'extractSuffix' : 'removeSuffix')}.pdf`);
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={t('toolPdfExtract')} desc={t('toolPdfExtractDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('processing')}</p>}
      {pdf && (
        <div className="panel">
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setDone(false); }} />
          <Tabs value={mode} onChange={(m) => { setMode(m); setDone(false); }} options={[{ id: 'extract', label: t('extractMode') }, { id: 'remove', label: t('removeMode') }]} />
          <PageRangeField value={range} onChange={(v) => { setRange(v); setDone(false); }} total={pdf.numPages} label={t(mode === 'extract' ? 'extractWhich' : 'removeWhich')} />
          {keep && !removesAll && <p className="muted">{t('extractResult')} <bdi>{keep.length}</bdi> {t(keep.length === 1 ? 'pageSingular' : 'pagePlural')}</p>}
          {removesAll && <Notice kind="error">{t('removeAll')}</Notice>}
          {!range.trim() && <p className="muted">{t('extractNeed')}</p>}
          <div className="actions">
            <button type="button" className="btn btn-primary" data-save disabled={busy || !keep || removesAll} onClick={run}>
              {busy ? t('processing') : t(mode === 'extract' ? 'extractAction' : 'removeAction')}
            </button>
          </div>
          {done && <Notice kind="success">{t('extractDone')}</Notice>}
          {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
        </div>
      )}
    </ToolPage>
  );
}

export function PdfCropTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [m, setM] = useState({ top: '10', right: '10', bottom: '10', left: '10' });
  const [range, setRange] = useState('');
  const [page, setPage] = useState<{ url: string; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!pdf) return setPage(null);
    let live = true;
    (async () => {
      const [url, size] = await Promise.all([pdf.preview.render(0, 520), pdf.preview.pageSize(0)]);
      if (live) setPage({ url, ...size });
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [pdf]);

  const margins: Margins = { top: num(m.top) * MM, right: num(m.right) * MM, bottom: num(m.bottom) * MM, left: num(m.left) * MM };
  const pages = pdf ? parsePageRange(range, pdf.numPages) : null;
  const tooBig = page !== null && (margins.left + margins.right >= page.width - 10 || margins.top + margins.bottom >= page.height - 10);

  const run = async () => {
    if (!pdf || !pages || tooBig) return;
    setBusy(true);
    setFailed(false);
    setDone(false);
    try {
      downloadBytes(await cropPdf(pdf.bytes, margins, range.trim() ? pages : null), `${baseName(pdf.file.name)}-cropped.pdf`);
      setDone(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const side = (k: keyof typeof m, label: string) => (
    <Field label={label}>
      {(id) => <input id={id} className="input" type="number" min={0} step={1} inputMode="decimal" value={m[k]} onChange={(e) => { setM({ ...m, [k]: e.target.value }); setDone(false); }} />}
    </Field>
  );

  return (
    <ToolPage title={t('toolPdfCrop')} desc={t('toolPdfCropDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('processing')}</p>}
      {pdf && (
        <div className="split">
          <div className="panel">
            <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setDone(false); }} />
            <p className="hint">{t('cropUnit')}</p>
            <div className="vid-grid">
              {side('top', t('cropTop'))}
              {side('bottom', t('cropBottom'))}
              {side('left', t('cropLeft'))}
              {side('right', t('cropRight'))}
            </div>
            <PageRangeField value={range} onChange={(v) => { setRange(v); setDone(false); }} total={pdf.numPages} />
            {tooBig && <Notice kind="error">{t('cropTooBig')}</Notice>}
            <div className="actions">
              <button type="button" className="btn btn-primary" data-save disabled={busy || !pages || tooBig} onClick={run}>
                {busy ? t('processing') : t('cropAction')}
              </button>
            </div>
            {done && <Notice kind="success">{t('cropDone')}</Notice>}
            {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
          </div>
          <div className="preview-box">
            {page && (
              <div className="vid-stage crop-page">
                <img src={page.url} alt={t('imgPreview')} style={{ width: '100%', display: 'block' }} />
                <div
                  className="vid-crop"
                  aria-hidden
                  style={{
                    left: `${(margins.left / page.width) * 100}%`,
                    top: `${(margins.top / page.height) * 100}%`,
                    right: `${(margins.right / page.width) * 100}%`,
                    bottom: `${(margins.bottom / page.height) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </ToolPage>
  );
}

/** Page pictures from a tolerant reader (pdf.js), for files whose structure cannot be copied. */
async function picturesFallback(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const preview = await openPreview(bytes);
    try {
      const images: { bytes: Uint8Array; mime: 'image/jpeg' }[] = [];
      for (let i = 0; i < preview.numPages; i++) {
        const canvas = createCanvas(10, 10);
        await preview.renderToCanvas(i, canvas, 2);
        images.push({ bytes: await canvasToBytes(canvas, 'image/jpeg', 0.9), mime: 'image/jpeg' });
      }
      return images.length ? await createPdf({ images, pageSize: 'fit' }) : null;
    } finally {
      preview.destroy();
    }
  } catch {
    return null;
  }
}

export function PdfRepairTool() {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RepairResult | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async (f: File) => {
    setFile(f);
    setBusy(true);
    setFailed(false);
    setResult(null);
    try {
      const bytes = await readBytes(f);
      setResult(await repairPdf(bytes, () => picturesFallback(bytes)));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={t('toolPdfRepair')} desc={t('toolPdfRepairDesc')}>
      <Dropzone compact={!!file} onFiles={(f) => run(f[0])} />
      {file && (
        <div className="panel">
          <FileBar name={file.name} size={file.size} keepable={false} onReset={() => { setFile(null); setResult(null); setFailed(false); }} />
          {busy && <p className="muted">{t('processing')}</p>}
          {failed && <Notice kind="error">{t('repairFailed')}</Notice>}
          {result && (
            <>
              <Notice kind={result.how === 'copy' ? 'success' : 'info'}>
                {t(result.how === 'copy' ? 'repairedCopy' : 'repairedPictures')} <bdi>{result.pages}</bdi> {t(result.pages === 1 ? 'pageSingular' : 'pagePlural')} · <bdi>{formatBytes(result.bytes.length)}</bdi>
              </Notice>
              {result.skipped > 0 && <Notice kind="error">{t('repairSkipped')} <bdi>{result.skipped}</bdi></Notice>}
              <div className="actions">
                <button type="button" className="btn btn-primary" onClick={() => downloadBytes(result.bytes, `${baseName(file.name)}-repaired.pdf`)}>
                  {t('imgDownload')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </ToolPage>
  );
}
