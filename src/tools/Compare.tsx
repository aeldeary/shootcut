import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Checkbox, FileBar } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { comparePageVisually, compareText, type PageTextDiff } from '../lib/ops/compare';
import { useHistory } from '../hooks/useHistory';

type Tab = 'text' | 'visual';

export function CompareTool() {
  const { t } = useI18n();
  const a = usePdfFile({ persist: false });
  const b = usePdfFile({ persist: false });
  const [tab, setTab] = useState<Tab>('text');
  const [diffs, setDiffs] = useState<PageTextDiff[] | null>(null);
  const [showSame, setShowSame] = useState(false);
  const [pair, setPair] = useState(0);
  const [visual, setVisual] = useState<{ url: string; ratio: number; oldUrl: string; newUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useHistory({ tab, showSame, pair }, (s) => { setTab(s.tab); setShowSame(s.showSame); setPair(s.pair); }, a.pdf);

  const both = a.pdf && b.pdf;

  useEffect(() => {
    setDiffs(null);
    setVisual(null);
    setFailed(false);
    if (!a.pdf || !b.pdf) return;
    let alive = true;
    setBusy(true);
    compareText(a.pdf.preview, b.pdf.preview)
      .then((d) => alive && setDiffs(d))
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [a.pdf, b.pdf]);

  const pairs = useMemo(() => (diffs ?? []).filter((d) => d.oldPage >= 0 && d.newPage >= 0), [diffs]);

  useEffect(() => {
    if (tab !== 'visual' || !a.pdf || !b.pdf || !pairs[pair]) return;
    let alive = true;
    const { oldPage, newPage } = pairs[pair];
    (async () => {
      const d = await comparePageVisually(a.pdf!.preview, oldPage, b.pdf!.preview, newPage, 900);
      const [oldUrl, newUrl] = await Promise.all([a.pdf!.preview.render(oldPage, 360), b.pdf!.preview.render(newPage, 360)]);
      if (alive) setVisual({ url: (d.canvas as unknown as HTMLCanvasElement).toDataURL('image/png'), ratio: d.ratio, oldUrl, newUrl });
    })().catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [tab, pair, pairs, a.pdf, b.pdf]);

  const changed = (diffs ?? []).filter((d) => d.added + d.removed > 0);
  const added = changed.reduce((n, d) => n + d.added, 0);
  const removed = changed.reduce((n, d) => n + d.removed, 0);
  const shown = showSame ? (diffs ?? []) : changed;

  const slot = (which: 'a' | 'b') => {
    const h = which === 'a' ? a : b;
    const label = t(which === 'a' ? 'compareOld' : 'compareNew');
    return (
      <div className="panel">
        <p className="panel-title">{label}</p>
        {!h.pdf && <Dropzone compact onFiles={(f) => h.load(f[0])} />}
        {h.passwordPrompt}
        {h.error && <Notice kind="error">{t(h.error)}</Notice>}
        {h.loading && <p className="muted">{t('loadingPages')}</p>}
        {h.pdf && <FileBar name={h.pdf.file.name} pages={h.pdf.numPages} size={h.pdf.file.size} onReset={h.reset} keepable={false} />}
      </div>
    );
  };

  return (
    <ToolPage title={t('toolCompare')} desc={t('toolCompareDesc')}>
      <div className="grid-2">
        {slot('a')}
        {slot('b')}
      </div>
      {!both && <p className="muted">{t('compareNeedTwo')}</p>}
      {both && busy && <p className="muted">{t('processing')}</p>}
      {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
      {both && diffs && (
        <div className="panel">
          <div className="tabs" role="tablist">
            {(['text', 'visual'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' is-active' : ''}`} onClick={() => setTab(k)}>
                {t(k === 'text' ? 'compareText' : 'compareVisual')}
              </button>
            ))}
          </div>

          {tab === 'text' && (
            <>
              {changed.length === 0 ? (
                <Notice kind="success">{t('compareSame')}</Notice>
              ) : (
                <Notice kind="info">
                  <bdi>{changed.length}</bdi> {t('compareChangedPages')} · +{added} / −{removed} {t('compareWords')}
                </Notice>
              )}
              <Checkbox checked={showSame} onChange={setShowSame}>{t('compareShowSame')}</Checkbox>
              {shown.map((d, i) => (
                <section key={i}>
                  <h3 className="diff-title">
                    {d.oldPage >= 0 ? `${t('compareOld')} ${t('pageLabel')} ${d.oldPage + 1}` : t('compareNoPage')} → {d.newPage >= 0 ? `${t('compareNew')} ${t('pageLabel')} ${d.newPage + 1}` : t('compareNoPage')}
                  </h3>
                  <div className="diff" dir="auto">
                    {d.segments.map((s, k) => (s.type === 'added' ? <ins key={k}>{s.text}</ins> : s.type === 'removed' ? <del key={k}>{s.text}</del> : <span key={k}>{s.text}</span>))}
                  </div>
                </section>
              ))}
              <p className="hint">{t('compareLegend')}</p>
            </>
          )}

          {tab === 'visual' && (
            <>
              {pairs.length === 0 ? (
                <p className="muted">{t('compareNoPairs')}</p>
              ) : (
                <>
                  <div className="inline">
                    <label htmlFor="pair">{t('comparePage')}</label>
                    <select id="pair" className="input" value={pair} onChange={(e) => { setPair(Number(e.target.value)); setVisual(null); }}>
                      {pairs.map((p, i) => (
                        <option key={i} value={i}>
                          {p.oldPage + 1} → {p.newPage + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!visual ? (
                    <p className="muted">{t('processing')}</p>
                  ) : (
                    <>
                      <Notice kind={visual.ratio === 0 ? 'success' : 'info'}>
                        {visual.ratio === 0 ? t('compareVisualSame') : `${(visual.ratio * 100).toFixed(visual.ratio < 0.01 ? 2 : 1)}% ${t('compareVisualChanged')}`}
                      </Notice>
                      <div className="compare-grid" dir="ltr">
                        <figure>
                          <img src={visual.oldUrl} alt={t('compareOld')} />
                          <figcaption>{t('compareOld')}</figcaption>
                        </figure>
                        <figure>
                          <img src={visual.newUrl} alt={t('compareNew')} />
                          <figcaption>{t('compareNew')}</figcaption>
                        </figure>
                        <figure>
                          <img src={visual.url} alt={t('compareDiffImage')} />
                          <figcaption>{t('compareDiffImage')}</figcaption>
                        </figure>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </ToolPage>
  );
}

