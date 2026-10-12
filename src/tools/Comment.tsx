import { useEffect, useMemo, useRef, useState } from 'react';
import { BoxSelect, Highlighter, MessageSquarePlus, Strikethrough, Trash2, Underline } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Field, FileBar } from '../components/Fields';
import { PageStage, type StagePointer } from '../components/PageStage';
import { Notice, ToolPage } from '../components/Shell';
import { viewBox, viewRect } from '../components/marks';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, downloadBytes, nextId, type TextItem } from '../lib/pdf';
import { annotatePdf, type Markup } from '../lib/ops/annotate';
import { rectFromPoints, selectTextFlow, type Rect } from '../lib/ops/textselect';
import { useShortcuts } from '../hooks/useShortcuts';
import { useHistory } from '../hooks/useHistory';

type Mode = 'highlight' | 'underline' | 'strikeout' | 'note' | 'area';
type Item = Markup & { id: string };

const COLORS = ['#ffeb3b', '#a5d6a7', '#81d4fa', '#f48fb1', '#ffcc80'];
const LINE_COLORS = ['#d32f2f', '#1976d2', '#2e7d32', '#6a1b9a', '#000000'];

export function CommentTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<Mode>('highlight');
  const [color, setColor] = useState(COLORS[0]);
  const [items, setItems] = useState<Item[]>([]);
  const [author, setAuthor] = useState('');
  const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number]; pa: [number, number]; pb: [number, number] } | null>(null);
  const [runs, setRuns] = useState<TextItem[] | null>(null);
  const [noText, setNoText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<Key | null>(null);
  useHistory({ items }, (s) => { setItems(s.items); setDone(false); }, pdf);
  const startView = useRef<[number, number] | null>(null);
  const startPdf = useRef<[number, number] | null>(null);

  const fillMode = mode === 'highlight' || mode === 'note' || mode === 'area';
  const palette = fillMode ? COLORS : LINE_COLORS;
  const choose = (m: Mode) => {
    setMode(m);
    setNoText(false);
    setColor(m === 'highlight' || m === 'note' || m === 'area' ? COLORS[0] : LINE_COLORS[0]);
  };

  // the text of the current page, so a drag can snap to real lines
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    setRuns(null);
    setNoText(false);
    pdf.preview.textItems(page).then((r) => !cancelled && setRuns(r), () => !cancelled && setRuns([]));
    return () => {
      cancelled = true;
    };
  }, [pdf, page]);

  // Acrobat's tool keys: S note, U highlight, Shift+U cycles highlight, underline, strike-out
  useShortcuts({
    commentNote: () => choose('note'),
    commentHighlight: () => choose('highlight'),
    commentCycle: () => {
      const order: Mode[] = ['highlight', 'underline', 'strikeout'];
      choose(order[(order.indexOf(mode) + 1) % order.length]);
    },
  });

  const textMode = mode === 'highlight' || mode === 'underline' || mode === 'strikeout';
  const live = useMemo(() => (drag && textMode && runs ? selectTextFlow(runs, drag.pa, drag.pb) : []), [drag, textMode, runs]);

  const add = (m: Markup) => {
    setItems((prev) => [...prev, { ...m, id: nextId() }]);
    setDone(false);
  };

  const down = (p: StagePointer) => {
    if (!pdf) return;
    if (mode === 'note') {
      add({ kind: 'note', page, x: p.pdf[0], y: p.pdf[1], text: '', color });
      return;
    }
    startView.current = p.view;
    startPdf.current = p.pdf;
    setNoText(false);
    setDrag({ a: p.view, b: p.view, pa: p.pdf, pb: p.pdf });
  };
  const move = (p: StagePointer) => {
    if (startView.current && startPdf.current) setDrag({ a: startView.current, b: p.view, pa: startPdf.current, pb: p.pdf });
  };
  const up = async (p: StagePointer) => {
    const from = startPdf.current;
    startView.current = null;
    startPdf.current = null;
    setDrag(null);
    if (!from || !pdf || mode === 'note') return;
    const region: Rect = rectFromPoints(from, p.pdf);
    if (region.width < 2 && region.height < 2) return;
    if (mode === 'area') {
      add({ kind: 'highlight', page, rects: [region], color });
      return;
    }
    const rects = selectTextFlow(runs ?? (await pdf.preview.textItems(page)), from, p.pdf);
    if (rects.length === 0) {
      setNoText(true);
      return;
    }
    add({ kind: mode, page, rects, color });
  };

  const save = async () => {
    if (!pdf) return;
    setBusy(true);
    setFailed(null);
    try {
      downloadBytes(await annotatePdf(pdf.bytes, items, author.trim()), `${baseName(pdf.file.name)}${t('commentSuffix')}.pdf`);
      setDone(true);
    } catch {
      setFailed('errGeneric');
    } finally {
      setBusy(false);
    }
  };

  const modes: { id: Mode; label: Key; icon: typeof Highlighter }[] = [
    { id: 'highlight', label: 'commentHighlight', icon: Highlighter },
    { id: 'underline', label: 'commentUnderline', icon: Underline },
    { id: 'strikeout', label: 'commentStrike', icon: Strikethrough },
    { id: 'note', label: 'commentNote', icon: MessageSquarePlus },
    { id: 'area', label: 'commentArea', icon: BoxSelect },
  ];

  return (
    <ToolPage title={t('toolComment')} desc={t('toolCommentDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('loadingPages')}</p>}
      {pdf && (
        <>
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setItems([]); setPage(0); setDone(false); }} />
          <div className="work">
            <PageStage
              preview={pdf.preview}
              page={page}
              onPage={setPage}
              cursor={mode === 'note' ? 'copy' : 'crosshair'}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
            >
              {(vp) => (
                <>
                  {items
                    .filter((i) => i.page === page)
                    .map((i) =>
                      i.kind === 'note' ? (
                        <span key={i.id} className="mark note-pin" style={{ left: vp.toView(i.x, i.y)[0], top: vp.toView(i.x, i.y)[1], background: i.color }} title={i.text} aria-label={t('commentNote')}>
                          <MessageSquarePlus size={14} aria-hidden />
                        </span>
                      ) : (
                        i.rects.map((r, k) => (
                          <span
                            key={`${i.id}-${k}`}
                            className={`mark ${i.kind}`}
                            style={{ ...viewRect(vp, r), ['--c' as string]: i.color }}
                          />
                        ))
                      ),
                    )}
                  {drag && mode === 'area' && <span className="mark rubber" style={viewBox(drag.a, drag.b)} />}
                  {live.map((r, k) => (
                    <span key={`live-${k}`} className={`mark ${mode}`} style={{ ...viewRect(vp, r), ['--c' as string]: color, opacity: 0.8 }} />
                  ))}
                </>
              )}
            </PageStage>

            <aside className="side">
              <div className="panel">
                <div className="mode-bar" role="group" aria-label={t('commentTools')}>
                  {modes.map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" className="mode-btn" aria-pressed={mode === id} onClick={() => choose(id)}>
                      <Icon size={16} aria-hidden />
                      {t(label)}
                    </button>
                  ))}
                </div>
                <div className="swatches" role="group" aria-label={t('stampColor')}>
                  {palette.map((c) => (
                    <button key={c} type="button" className={`swatch${color === c ? ' is-active' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} />
                  ))}
                </div>
                <p className="hint">{t(mode === 'note' ? 'commentHintNote' : mode === 'area' ? 'commentHintArea' : 'commentHintDrag')}</p>
                {runs && runs.length === 0 && textMode && <Notice kind="info">{t('commentPageNoText')}</Notice>}
                {noText && <Notice kind="error">{t('commentNoText')}</Notice>}
                <Field label={t('commentAuthor')}>
                  {(id) => <input id={id} className="input" dir="auto" value={author} onChange={(e) => setAuthor(e.target.value)} />}
                </Field>
              </div>

              <div className="panel">
                <p className="panel-title">
                  {t('commentList')} ({items.length})
                </p>
                {items.length === 0 && <p className="muted">{t('commentEmpty')}</p>}
                <ul className="list">
                  {items.map((i) => (
                    <li key={i.id} className="row">
                      <span className="swatch is-small" style={{ background: i.color }} />
                      <div className="row-main">
                        <div className="row-meta">
                          {t(i.kind === 'note' ? 'commentNote' : i.kind === 'highlight' ? 'commentHighlight' : i.kind === 'underline' ? 'commentUnderline' : 'commentStrike')} · {t('pageLabel')} {i.page + 1}
                        </div>
                        <textarea
                          className="input"
                          rows={2}
                          dir="auto"
                          aria-label={t('commentText')}
                          placeholder={t('commentText')}
                          value={i.kind === 'note' ? i.text : (i.comment ?? '')}
                          onChange={(e) =>
                            setItems((prev) => prev.map((x) => (x.id === i.id ? (x.kind === 'note' ? { ...x, text: e.target.value } : { ...x, comment: e.target.value }) : x)))
                          }
                        />
                      </div>
                      <button type="button" className="icon-btn danger" title={t('remove')} aria-label={t('remove')} onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))}>
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn btn-primary" data-save disabled={busy || items.length === 0} onClick={save}>
                  {busy ? t('processing') : t('commentSave')}
                </button>
                {done && <Notice kind="success">{t('commentDone')}</Notice>}
                {failed && <Notice kind="error">{t(failed)}</Notice>}
              </div>
            </aside>
          </div>
        </>
      )}
    </ToolPage>
  );
}
