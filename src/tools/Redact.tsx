import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Checkbox, Field, FileBar } from '../components/Fields';
import { EditableBox } from '../components/EditableBox';
import { PageStage, type StagePointer } from '../components/PageStage';
import { RectFields } from '../components/RectFields';
import { Notice, ToolPage } from '../components/Shell';
import { viewBox } from '../components/marks';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, downloadBytes, nextId } from '../lib/pdf';
import { redactPdf, type RedactBox } from '../lib/ops/redact';
import { findTextBoxes, rectFromPoints } from '../lib/ops/textselect';
import { useHistory } from '../hooks/useHistory';

type Box = RedactBox & { id: string };

export function RedactTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [page, setPage] = useState(0);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [strip, setStrip] = useState(true);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<Key | null>(null);
  useHistory({ boxes, strip }, (s) => { setBoxes(s.boxes); setStrip(s.strip); setSelected(null); setDone(false); }, pdf);
  const startView = useRef<[number, number] | null>(null);
  const startPdf = useRef<[number, number] | null>(null);

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
    const r = rectFromPoints(from, p.pdf);
    if (r.width < 3 || r.height < 3) return;
    const id = nextId();
    setBoxes((prev) => [...prev, { ...r, page, id }]);
    setSelected(id);
    setDone(false);
  };

  const search = async () => {
    if (!pdf || !query.trim()) return;
    setSearching(true);
    const added: Box[] = [];
    for (let i = 0; i < pdf.numPages; i++) {
      for (const r of findTextBoxes(await pdf.preview.textItems(i), query)) added.push({ ...r, page: i, id: nextId() });
    }
    setBoxes((prev) => [...prev, ...added]);
    setFound(added.length);
    setSearching(false);
    setDone(false);
  };

  const apply = async () => {
    if (!pdf) return;
    setBusy(true);
    setFailed(null);
    try {
      downloadBytes(await redactPdf(pdf.bytes, boxes, { stripMetadata: strip }), `${baseName(pdf.file.name)}${t('redactSuffix')}.pdf`);
      setDone(true);
    } catch {
      setFailed('errGeneric');
    } finally {
      setBusy(false);
    }
  };

  const pagesAffected = new Set(boxes.map((b) => b.page)).size;

  return (
    <ToolPage title={t('toolRedact')} desc={t('toolRedactDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('loadingPages')}</p>}
      {pdf && (
        <>
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setBoxes([]); setPage(0); setDone(false); setSure(false); }} />
          <div className="work">
            <PageStage preview={pdf.preview} page={page} onPage={setPage} cursor="crosshair" onPointerDown={down} onPointerMove={move} onPointerUp={up}>
              {(vp) => (
                <>
                  {boxes
                    .filter((b) => b.page === page)
                    .map((b) => (
                      <EditableBox
                        key={b.id}
                        vp={vp}
                        rect={b}
                        selected={selected === b.id}
                        className="redact-box"
                        label={`${t('redactBoxes')} ${boxes.indexOf(b) + 1}`}
                        onSelect={() => setSelected(b.id)}
                        onChange={(r) => { setBoxes((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...r } : x))); setDone(false); }}
                        onDelete={() => { setBoxes((prev) => prev.filter((x) => x.id !== b.id)); setSelected(null); }}
                      />
                    ))}
                  {drag && <span className="mark rubber" style={viewBox(drag.a, drag.b)} />}
                </>
              )}
            </PageStage>
            <aside className="side">
              <div className="panel">
                <p className="hint">{t('redactHintDraw')}</p>
                <p className="hint">{t('boxHint')}</p>
                <Field label={t('redactSearch')} hint={t('redactSearchHint')}>
                  {(id) => (
                    <div className="inline">
                      <input id={id} className="input" dir="auto" value={query} onChange={(e) => { setQuery(e.target.value); setFound(null); }} onKeyDown={(e) => e.key === 'Enter' && search()} />
                      <button type="button" className="btn" disabled={!query.trim() || searching} onClick={search}>
                        {t('redactFind')}
                      </button>
                    </div>
                  )}
                </Field>
                {found !== null && <p className="muted">{found === 0 ? t('redactNoMatch') : `${found} ${t('redactMatches')}`}</p>}
              </div>
              <div className="panel">
                <p className="panel-title">
                  {t('redactBoxes')} ({boxes.length})
                </p>
                {boxes.length === 0 ? (
                  <p className="muted">{t('redactEmpty')}</p>
                ) : (
                  <ul className="list">
                    {boxes.map((b, i) => (
                      <li key={b.id} className={`row${selected === b.id ? ' is-over' : ''}`}>
                        <span className="row-index">{i + 1}</span>
                        <div className="row-main">
                          <button type="button" className="link-btn" onClick={() => { setPage(b.page); setSelected(b.id); }}>
                            {t('pageLabel')} {b.page + 1}
                          </button>
                        </div>
                        <button type="button" className="icon-btn danger" title={t('remove')} aria-label={t('remove')} onClick={() => { setBoxes((prev) => prev.filter((x) => x.id !== b.id)); if (selected === b.id) setSelected(null); }}>
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {boxes.find((b) => b.id === selected) && (
                  <RectFields rect={boxes.find((b) => b.id === selected)!} onChange={(r) => setBoxes((prev) => prev.map((x) => (x.id === selected ? { ...x, ...r } : x)))} />
                )}
                <Notice kind="info">{t('redactWarn')}</Notice>
                <Checkbox checked={strip} onChange={setStrip}>{t('redactStrip')}</Checkbox>
                <Checkbox checked={sure} onChange={setSure}>
                  {t('redactSure')}
                  {pagesAffected > 0 && ` (${pagesAffected} ${pagesAffected === 1 ? t('pageSingular') : t('pagePlural')})`}
                </Checkbox>
                <button type="button" className="btn btn-primary" data-save disabled={busy || boxes.length === 0 || !sure} onClick={apply}>
                  {busy ? t('processing') : t('redactApply')}
                </button>
                {done && <Notice kind="success">{t('redactDone')}</Notice>}
                {failed && <Notice kind="error">{t(failed)}</Notice>}
              </div>
            </aside>
          </div>
        </>
      )}
    </ToolPage>
  );
}
