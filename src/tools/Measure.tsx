import { useEffect, useRef, useState } from 'react';
import { Ruler, Square, Target, Trash2 } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Field, FileBar } from '../components/Fields';
import { PageStage, type StagePointer } from '../components/PageStage';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, downloadBytes, nextId } from '../lib/pdf';
import { burnMeasurements, calibrate, defaultScale, distance, measurementLabel, type Measurement, type Pt, type Scale, type Unit } from '../lib/ops/measure';
import { useHistory } from '../hooks/useHistory';

type Mode = 'distance' | 'area' | 'calibrate';
type Item = Measurement & { id: string };
const UNITS: Unit[] = ['mm', 'cm', 'm', 'in', 'ft', 'pt'];

export function MeasureTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<Mode>('distance');
  const [unit, setUnit] = useState<Unit>('cm');
  const [scale, setScale] = useState<Scale>(defaultScale('cm'));
  const [calibrated, setCalibrated] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [points, setPoints] = useState<Pt[]>([]); // area polygon in progress
  const [line, setLine] = useState<{ a: Pt; b: Pt } | null>(null); // distance/calibration drag
  const [hover, setHover] = useState<Pt | null>(null);
  const [pending, setPending] = useState<{ a: Pt; b: Pt } | null>(null); // calibration waiting for a length
  const [known, setKnown] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<Key | null>(null);
  useHistory({ items, points, unit, scale, calibrated }, (s) => { setItems(s.items); setPoints(s.points); setUnit(s.unit); setScale(s.scale); setCalibrated(s.calibrated); setDone(false); }, pdf);
  const dragFrom = useRef<Pt | null>(null);

  useEffect(() => {
    if (!calibrated) setScale(defaultScale(unit));
  }, [unit, calibrated]);

  const finishArea = () => {
    if (points.length >= 3) setItems((prev) => [...prev, { kind: 'area', page, points, id: nextId() }]);
    setPoints([]);
    setHover(null);
  };

  const down = (p: StagePointer) => {
    setDone(false);
    if (mode === 'area') {
      setPoints((prev) => [...prev, p.pdf]);
      return;
    }
    dragFrom.current = p.pdf;
    setLine({ a: p.pdf, b: p.pdf });
  };
  const move = (p: StagePointer) => {
    if (mode === 'area') {
      if (points.length) setHover(p.pdf);
      return;
    }
    if (dragFrom.current) setLine({ a: dragFrom.current, b: p.pdf });
  };
  const up = (p: StagePointer) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setLine(null);
    if (!from || mode === 'area') return;
    if (distance(from, p.pdf) < 3) return;
    if (mode === 'calibrate') setPending({ a: from, b: p.pdf });
    else setItems((prev) => [...prev, { kind: 'distance', page, a: from, b: p.pdf, id: nextId() }]);
  };

  const applyCalibration = () => {
    const value = Number(known.replace(',', '.'));
    if (!pending) return;
    try {
      setScale(calibrate(distance(pending.a, pending.b), value, unit));
      setCalibrated(true);
      setPending(null);
      setKnown('');
      setMode('distance');
    } catch {
      setFailed('measureBadLength');
    }
  };

  const save = async () => {
    if (!pdf) return;
    setBusy(true);
    setFailed(null);
    try {
      downloadBytes(await burnMeasurements(pdf.bytes, items, scale), `${baseName(pdf.file.name)}${t('measureSuffix')}.pdf`);
      setDone(true);
    } catch {
      setFailed('errGeneric');
    } finally {
      setBusy(false);
    }
  };

  const modes: { id: Mode; label: Key; icon: typeof Ruler }[] = [
    { id: 'distance', label: 'measureDistance', icon: Ruler },
    { id: 'area', label: 'measureArea', icon: Square },
    { id: 'calibrate', label: 'measureCalibrate', icon: Target },
  ];

  return (
    <ToolPage title={t('toolMeasure')} desc={t('toolMeasureDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('loadingPages')}</p>}
      {pdf && (
        <>
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setItems([]); setPoints([]); setPage(0); setCalibrated(false); setDone(false); }} />
          <div className="work">
            <PageStage preview={pdf.preview} page={page} onPage={(n) => { setPage(n); setPoints([]); }} cursor="crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
              {(vp) => {
                const v = (p: Pt) => vp.toView(p[0], p[1]);
                const drawn = items.filter((i) => i.page === page);
                const live = mode === 'area' && points.length ? [...points, ...(hover ? [hover] : [])] : null;
                return (
                  <svg className="measure-svg" width={vp.width} height={vp.height} aria-hidden>
                    {drawn.map((i) => {
                      const pts = i.kind === 'distance' ? [i.a, i.b] : i.points;
                      const vs = pts.map(v);
                      const mid = vs.reduce((s, c) => [s[0] + c[0] / vs.length, s[1] + c[1] / vs.length], [0, 0]);
                      return (
                        <g key={i.id}>
                          {i.kind === 'area' ? <polygon points={vs.map((q) => q.join(',')).join(' ')} className="m-area" /> : <polyline points={vs.map((q) => q.join(',')).join(' ')} className="m-line" />}
                          {vs.map((q, k) => <circle key={k} cx={q[0]} cy={q[1]} r={3} className="m-dot" />)}
                          <text x={mid[0]} y={mid[1] - 6} textAnchor="middle" className="m-label">{measurementLabel(i, scale)}</text>
                        </g>
                      );
                    })}
                    {live && <polyline points={live.map(v).map((q) => q.join(',')).join(' ')} className="m-line is-live" />}
                    {line && <line x1={v(line.a)[0]} y1={v(line.a)[1]} x2={v(line.b)[0]} y2={v(line.b)[1]} className="m-line is-live" />}
                    {line && mode === 'distance' && <text x={(v(line.a)[0] + v(line.b)[0]) / 2} y={(v(line.a)[1] + v(line.b)[1]) / 2 - 6} textAnchor="middle" className="m-label">{measurementLabel({ kind: 'distance', page, a: line.a, b: line.b }, scale)}</text>}
                    {pending && <line x1={v(pending.a)[0]} y1={v(pending.a)[1]} x2={v(pending.b)[0]} y2={v(pending.b)[1]} className="m-line is-calibrate" />}
                  </svg>
                );
              }}
            </PageStage>

            <aside className="side">
              <div className="panel">
                <div className="mode-bar" role="group" aria-label={t('measureTools')}>
                  {modes.map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" className="mode-btn" aria-pressed={mode === id} onClick={() => { setMode(id); setPoints([]); setPending(null); }}>
                      <Icon size={16} aria-hidden />
                      {t(label)}
                    </button>
                  ))}
                </div>
                <p className="hint">{t(mode === 'distance' ? 'measureHintDistance' : mode === 'area' ? 'measureHintArea' : 'measureHintCalibrate')}</p>
                {mode === 'area' && points.length > 0 && (
                  <div className="actions">
                    <button type="button" className="btn btn-primary" disabled={points.length < 3} onClick={finishArea}>
                      {t('measureFinish')}
                    </button>
                    <button type="button" className="btn" onClick={() => { setPoints([]); setHover(null); }}>
                      {t('cancel')}
                    </button>
                  </div>
                )}
                <Field label={t('measureUnit')}>
                  {(id) => (
                    <select id={id} className="input" value={unit} disabled={calibrated} onChange={(e) => setUnit(e.target.value as Unit)}>
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  )}
                </Field>
                {pending && (
                  <div className="panel">
                    <Field label={`${t('measureKnown')} (${unit})`}>
                      {(id) => (
                        <div className="inline">
                          <input id={id} className="input" dir="ltr" inputMode="decimal" value={known} onChange={(e) => setKnown(e.target.value)} />
                          <button type="button" className="btn btn-primary" disabled={!(Number(known.replace(',', '.')) > 0)} onClick={applyCalibration}>
                            {t('measureSetScale')}
                          </button>
                        </div>
                      )}
                    </Field>
                  </div>
                )}
                <p className="muted">
                  {calibrated ? t('measureScaleCustom') : t('measureScaleDefault')}
                  {calibrated && (
                    <>
                      {' '}
                      <button type="button" className="link-btn" onClick={() => { setCalibrated(false); setItems([]); }}>
                        {t('measureReset')}
                      </button>
                    </>
                  )}
                </p>
              </div>

              <div className="panel">
                <p className="panel-title">
                  {t('measureList')} ({items.length})
                </p>
                {items.length === 0 && <p className="muted">{t('measureEmpty')}</p>}
                <ul className="list">
                  {items.map((i) => (
                    <li key={i.id} className="row">
                      <div className="row-main">
                        <div className="row-name" dir="ltr">{measurementLabel(i, scale)}</div>
                        <div className="row-meta">{t(i.kind === 'area' ? 'measureArea' : 'measureDistance')} · {t('pageLabel')} {i.page + 1}</div>
                      </div>
                      <button type="button" className="icon-btn danger" title={t('remove')} aria-label={t('remove')} onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))}>
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-primary" data-save disabled={busy || items.length === 0} onClick={save}>
                  {busy ? t('processing') : t('measureSave')}
                </button>
                {done && <Notice kind="success">{t('measureDone')}</Notice>}
                {failed && <Notice kind="error">{t(failed)}</Notice>}
              </div>
            </aside>
          </div>
        </>
      )}
    </ToolPage>
  );
}
