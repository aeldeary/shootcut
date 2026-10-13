import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, ChevronDownSquare, Circle, ListChecks, RectangleHorizontal, TextCursorInput, Trash2 } from 'lucide-react';
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
import { listFormFields } from '../lib/ops/fill';
import { analyzeDocument, type DocumentAnalysis, type Suggestion, type SuggestionSource } from '../lib/ops/formsuggest';
import { viewRect } from '../components/marks';
import { addFormFields, type NewField, type NewFieldKind } from '../lib/ops/formbuild';
import { rectFromPoints } from '../lib/ops/textselect';
import { useShortcuts } from '../hooks/useShortcuts';
import { useHistory } from '../hooks/useHistory';
import { FillBox } from '../components/FillBox';
import { FillStyle, type AddedFont } from '../components/FillStyle';
import { DEFAULT_BOX_STYLE, readingOrder, writeBoxes, type BoxStyle } from '../lib/ops/fillboxes';
import { isWinAnsiText } from '../lib/ops/fill';

const SRC_LABEL: Record<SuggestionSource, Key> = { cell: 'formSrcCell', blank: 'formSrcBlank', line: 'formSrcLine', label: 'formSrcLabel' };

type Item = NewField & { id: string; text?: string; style?: BoxStyle };

const KINDS: { id: NewFieldKind; label: Key; icon: typeof TextCursorInput; click?: number }[] = [
  { id: 'text', label: 'formText', icon: TextCursorInput },
  { id: 'multiline', label: 'formMultiline', icon: RectangleHorizontal },
  { id: 'checkbox', label: 'formCheckbox', icon: CheckSquare, click: 16 },
  { id: 'radio', label: 'formRadio', icon: Circle, click: 16 },
  { id: 'dropdown', label: 'formDropdown', icon: ChevronDownSquare },
  { id: 'list', label: 'formList', icon: ListChecks },
];

export function FormTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<NewFieldKind>('text');
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [existing, setExisting] = useState<string[]>([]);
  const [drag, setDrag] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [interDone, setInterDone] = useState(false);
  const [fieldAlign, setFieldAlign] = useState<'right' | 'center'>('right');
  const [failed, setFailed] = useState<string | null>(null);
  useHistory({ items }, (s) => { setItems(s.items); setSelected(null); setDone(false); }, pdf);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [allSugg, setSugg] = useState<(Suggestion & { id: string; page: number })[]>([]);
  // only the cells of a table are proposed at first: blank lines, ruled lines and labels often catch empty space, so they are opt-in
  const [kinds, setKinds] = useState<Record<SuggestionSource, boolean>>({ cell: true, blank: false, line: false, label: false });
  const sugg = useMemo(() => allSugg.filter((g) => kinds[g.source]), [allSugg, kinds]);
  const [dismissed, setDismissed] = useState(false);
  const [mode, setMode] = useState<'prepare' | 'fill'>('prepare');
  const [gs, setGs] = useState<BoxStyle>(DEFAULT_BOX_STYLE);
  const [applyAll, setApplyAll] = useState(true);
  const [addedFonts, setAddedFonts] = useState<AddedFont[]>([]);
  const [fontErr, setFontErr] = useState<string | null>(null);
  const fontFiles = useRef<Record<string, Uint8Array>>({});
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const startView = useRef<[number, number] | null>(null);
  const startPdf = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!pdf) return;
    let alive = true;
    listFormFields(pdf.bytes).then((f) => alive && setExisting(f.map((x) => x.name))).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pdf]);

  // look at the file first and offer to put the fields where they obviously belong
  useEffect(() => {
    if (!pdf) {
      setAnalysis(null);
      setSugg([]);
      setDismissed(false);
      return;
    }
    let alive = true;
    setAnalyzing(true);
    setDismissed(false);
    analyzeDocument(pdf.preview)
      .then((a) => {
        if (!alive) return;
        setAnalysis(a);
        setSugg(a.pages.flatMap((p) => p.suggestions.map((s) => ({ ...s, id: nextId(), page: p.page }))));
      })
      .catch(() => alive && setAnalysis(null))
      .finally(() => alive && setAnalyzing(false));
    return () => {
      alive = false;
    };
  }, [pdf]);

  // Acrobat's keys: F is the text field tool, Shift+F goes through the other field tools
  useShortcuts({
    formText: () => setKind('text'),
    formCycle: () => setKind(KINDS[(KINDS.findIndex((x) => x.id === kind) + 1) % KINDS.length].id),
  });

  const uniqueName = (k: NewFieldKind, taken: Set<string>) => {
    const base = k === 'multiline' ? 'text' : k;
    for (let n = 1; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
  };

  const down = (p: StagePointer) => {
    startView.current = p.view;
    startPdf.current = p.pdf;
    setDrag({ a: p.view, b: p.view });
  };
  const moveDrag = (p: StagePointer) => {
    if (startView.current) setDrag({ a: startView.current, b: p.view });
  };
  const up = (p: StagePointer) => {
    const from = startPdf.current;
    startView.current = null;
    startPdf.current = null;
    setDrag(null);
    if (!from) return;
    const spec = KINDS.find((k) => k.id === kind)!;
    let rect = rectFromPoints(from, p.pdf);
    if (spec.click) {
      rect = { x: p.pdf[0] - spec.click / 2, y: p.pdf[1] - spec.click / 2, width: spec.click, height: spec.click };
    } else if (rect.width < 12 || rect.height < 8) {
      rect = { x: from[0], y: from[1] - 22, width: 160, height: 22 };
    }
    const taken = new Set([...existing, ...items.map((i) => i.name)]);
    const id = nextId();
    // each new radio button joins the last radio group on this page, or starts group_1
    const lastRadio = [...items].reverse().find((i) => i.kind === 'radio');
    const name = kind === 'radio' ? (lastRadio?.name ?? uniqueName('radio', taken)) : uniqueName(kind, taken);
    const radioCount = items.filter((i) => i.kind === 'radio' && i.name === name).length;
    setItems((prev) => [
      ...prev,
      {
        id,
        kind,
        name,
        page,
        rect,
        ...(kind === 'dropdown' || kind === 'list' ? { options: ['1', '2', '3'] } : kind === 'radio' ? { options: [String(radioCount + 1)] } : {}),
      },
    ]);
    setSelected(id);
    setDone(false);
  };

  /** turns suggestions into fields, each with a fresh name; the nearby text becomes its hint */
  const itemsFrom = (list: (Suggestion & { id: string; page: number })[], taken: Set<string>): Item[] =>
    list.map((sg) => {
      const name = uniqueName(sg.kind, taken);
      taken.add(name);
      return { id: nextId(), kind: sg.kind, name, page: sg.page, rect: sg.rect, tooltip: sg.label };
    });
  const accept = (list: (Suggestion & { id: string; page: number })[]) => {
    if (list.length === 0) return;
    const made = itemsFrom(list, new Set([...existing, ...items.map((i) => i.name)]));
    setItems((prev) => [...prev, ...made]);
    const ids = new Set(list.map((x) => x.id));
    setSugg((prev) => prev.filter((x) => !ids.has(x.id)));
    setSelected(made[made.length - 1].id);
    setDone(false);
  };

  useEffect(() => setInterDone(false), [items]);
  const textItems = useMemo(() => items.filter((i) => i.kind === 'text' || i.kind === 'multiline'), [items]);
  const order = useMemo(() => readingOrder(textItems, gs.mode === 'rtl'), [textItems, gs.mode]);
  const styleOf = (i: Item): BoxStyle => i.style ?? gs;
  const filled = textItems.filter((i) => (i.text ?? '').trim()).length;

  // focus the box Tab asked for, once its page is showing
  useEffect(() => {
    if (!pendingFocus || mode !== 'fill') return;
    const el = document.querySelector<HTMLElement>(`[data-fill-id="${pendingFocus}"]`);
    if (el) {
      el.focus();
      setPendingFocus(null);
    }
  });

  const move = (id: string, delta: 1 | -1) => {
    const i = order.findIndex((x) => x.id === id);
    const target = order[(i + delta + order.length) % order.length];
    if (!target) return;
    if (target.page !== page) setPage(target.page);
    setPendingFocus(target.id);
  };

  const styleSel = items.find((i) => i.id === selected && (i.kind === 'text' || i.kind === 'multiline'));
  const shownStyle = applyAll || !styleSel ? gs : styleOf(styleSel);
  const changeStyle = (patch: Partial<BoxStyle>) => {
    if (applyAll || !styleSel) {
      setGs((g) => ({ ...g, ...patch }));
      setItems((prev) => prev.map((x) => (x.style ? { ...x, style: undefined } : x)));
    } else {
      update(styleSel.id, { style: { ...styleOf(styleSel), ...patch } } as Partial<Item>);
    }
  };

  const addFont = async (file: File) => {
    setFontErr(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const id = `file-${addedFonts.length + 1}`;
      const family = `sc-fill-${id}`;
      const face = new FontFace(family, bytes);
      await face.load();
      document.fonts.add(face);
      fontFiles.current[id] = bytes;
      setAddedFonts((f) => [...f, { id, name: file.name.replace(/\.[^.]+$/, '') }]);
      changeStyle({ font: id });
    } catch {
      setFontErr(t('fillFontFail'));
    }
  };

  /** one click: every box (the detected ones too, if none were added yet) becomes a fillable field; what was typed is kept */
  const makeInteractive = async () => {
    if (!pdf) return;
    setBusy(true);
    setFailed(null);
    try {
      const all = items.length > 0 ? items : itemsFrom(dismissed ? [] : sugg, new Set(existing));
      const fields: NewField[] = [];
      const flat: { page: number; rect: NewField['rect']; text: string; multiline: boolean; style: BoxStyle }[] = [];
      for (const i of all) {
        const typed = (i.text ?? '').trim();
        const isText = i.kind === 'text' || i.kind === 'multiline';
        if (isText && typed && !isWinAnsiText(typed)) {
          // the form's own font cannot show Arabic: that text goes onto the page, and the box has no field
          flat.push({ page: i.page, rect: i.rect, text: i.text ?? '', multiline: i.kind === 'multiline', style: styleOf(i) });
          continue;
        }
        const { id: _id, text: _t, style: _s, ...f } = i;
        fields.push({ ...f, options: f.options?.filter((o) => o.trim()), defaultValue: isText && typed ? typed : f.defaultValue, align: isText ? fieldAlign : undefined });
      }
      let out = await addFormFields(pdf.bytes, fields);
      if (flat.length) out = await writeBoxes(out, flat, fontFiles.current);
      downloadBytes(out, `${baseName(pdf.file.name)}${t('formInteractiveSuffix')}.pdf`);
      setInterDone(true);
    } catch (err) {
      setFailed((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const canInteractive = items.length > 0 || (!dismissed && sugg.length > 0);

  const saveFilled = async () => {
    if (!pdf) return;
    setBusy(true);
    setFailed(null);
    try {
      const boxes = textItems.map((i) => ({ page: i.page, rect: i.rect, text: i.text ?? '', multiline: i.kind === 'multiline', style: styleOf(i) }));
      downloadBytes(await writeBoxes(pdf.bytes, boxes, fontFiles.current), `${baseName(pdf.file.name)}${t('formFillSuffix')}.pdf`);
      setDone(true);
    } catch (err) {
      setFailed((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sel = items.find((i) => i.id === selected);
  const update = (id: string, patch: Partial<Item>) => setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  // names must be unique, except radio buttons that deliberately share a group
  const nameClash = (() => {
    const seen = new Map<string, NewFieldKind>();
    const taken = new Set(existing);
    for (const i of items) {
      const n = i.name.trim();
      if (!n) return true;
      if (taken.has(n)) return true;
      const prev = seen.get(n);
      if (prev !== undefined && !(prev === 'radio' && i.kind === 'radio')) return true;
      seen.set(n, i.kind);
    }
    return false;
  })();

  const save = async () => {
    if (!pdf) return;
    setBusy(true);
    setFailed(null);
    try {
      const specs: NewField[] = items.map(({ id: _id, ...f }) => ({ ...f, options: f.options?.filter((o) => o.trim()) }));
      downloadBytes(await addFormFields(pdf.bytes, specs), `${baseName(pdf.file.name)}${t('formSuffix')}.pdf`);
      setDone(true);
    } catch (err) {
      setFailed((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={t('toolForm')} desc={t('toolFormDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('loadingPages')}</p>}
      {pdf && (
        <>
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setItems([]); setSelected(null); setPage(0); setDone(false); }} />
          <div className="work">
            <PageStage preview={pdf.preview} page={page} onPage={setPage} cursor={mode === 'fill' ? 'text' : 'crosshair'} onPointerDown={mode === 'fill' ? undefined : down} onPointerMove={mode === 'fill' ? undefined : moveDrag} onPointerUp={mode === 'fill' ? undefined : up}>
              {(vp) => (
                <>
                  {mode === 'fill' && textItems.filter((i) => i.page === page).map((i) => (
                    <FillBox
                      key={i.id}
                      id={i.id}
                      vp={vp}
                      rect={i.rect}
                      value={i.text ?? ''}
                      multiline={i.kind === 'multiline'}
                      style={styleOf(i)}
                      family={styleOf(i).font !== 'plain' ? `sc-fill-${styleOf(i).font}` : undefined}
                      label={i.tooltip || i.name}
                      selected={selected === i.id}
                      onChange={(text) => { update(i.id, { text } as Partial<Item>); setDone(false); }}
                      onFocus={() => setSelected(i.id)}
                      onMove={(d) => move(i.id, d)}
                    />
                  ))}
                  {mode === 'prepare' && items
                    .filter((i) => i.page === page)
                    .map((i) => (
                      <EditableBox
                        key={i.id}
                        vp={vp}
                        rect={i.rect}
                        selected={selected === i.id}
                        className="form-box"
                        label={i.name}
                        onSelect={() => setSelected(i.id)}
                        onChange={(rect) => update(i.id, { rect })}
                        onDelete={() => { setItems((prev) => prev.filter((x) => x.id !== i.id)); setSelected(null); }}
                      >
                        <span className="box-label">{i.name}</span>
                      </EditableBox>
                    ))}
 {(mode === 'prepare' || items.length === 0) && !dismissed && sugg.filter((g) => g.page === page).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="sugg-box"
                      style={viewRect(vp, g.rect)}
                      aria-label={`${t('formSuggestAdd')}${g.label ? `: ${g.label}` : ''}`}
                      title={`${t('formSuggestAdd')}${g.label ? `: ${g.label}` : ''}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onClick={() => accept([g])}
                    >
                      +
                    </button>
                  ))}
                  {drag && <span className="mark rubber" style={viewBox(drag.a, drag.b)} />}
                </>
              )}
            </PageStage>

            <aside className={`side${mode === 'fill' ? ' is-sticky' : ''}`}>
              <div className="panel">
                <div className="mode-bar" role="group" aria-label={t('toolForm')}>
                  <button type="button" className="mode-btn" aria-pressed={mode === 'prepare'} onClick={() => setMode('prepare')}>{t('formModePrepare')}</button>
                  <button type="button" className="mode-btn" aria-pressed={mode === 'fill'} onClick={() => { setMode('fill'); setDone(false); }}>{t('formModeFill')}</button>
                </div>
              </div>
              <div className="panel">
                <button type="button" className="btn btn-primary" disabled={busy || !canInteractive || nameClash} onClick={makeInteractive}>
                  {busy ? t('processing') : t('formInteractive')}
                </button>
                <p className="hint">{t('formInteractiveHint')}</p>
                <p className="panel-title">{t('formInteractiveAlign')}</p>
                <div className="mode-bar" role="group" aria-label={t('formInteractiveAlign')}>
                  <button type="button" className="mode-btn" aria-pressed={fieldAlign === 'right'} onClick={() => setFieldAlign('right')}>{t('formAlignRight')}</button>
                  <button type="button" className="mode-btn" aria-pressed={fieldAlign === 'center'} onClick={() => setFieldAlign('center')}>{t('formAlignCenter')}</button>
                </div>
                {interDone && <Notice kind="success">{t('formInteractiveDone')}</Notice>}
              </div>
              {mode === 'fill' && (
                <>
                  <div className="panel">
                    <p className="hint">{t('fillHint')}</p>
                    {textItems.length === 0 ? (
                      <p className="muted">{t('fillEmpty')}</p>
                    ) : (
                      <p>{t('fillCount').replace('{n}', String(filled)).replace('{m}', String(textItems.length))}</p>
                    )}
                  </div>
                  <FillStyle style={shownStyle} all={applyAll || !styleSel} fonts={addedFonts} error={fontErr} onAll={setApplyAll} onChange={changeStyle} onAddFont={addFont} />
                  <div className="panel">
                    <button type="button" className="btn btn-primary" disabled={busy || filled === 0} onClick={saveFilled}>
                      {busy ? t('processing') : t('formFillSave')}
                    </button>
                    {done && <Notice kind="success">{t('formFillDone')}</Notice>}
                    {failed && <Notice kind="error">{failed}</Notice>}
                  </div>
                </>
              )}
              <div className="panel suggest-panel" aria-live="polite">
                <p className="panel-title">{t('formSuggestTitle')}</p>
                {analyzing && <p className="muted">{t('formSuggestRunning')}</p>}
                {!analyzing && analysis && analysis.total > 0 && !dismissed && (
                  <>
                    <p>
                      {t(analysis.kind === 'table' ? 'formSuggestTable' : 'formSuggestLines').replace('{n}', String(sugg.length))}
                    </p>
                    {analysis.partial && <p className="muted">{t('formSuggestPartial')}</p>}
                    <div className="actions">
                      <button type="button" className="btn btn-primary" disabled={sugg.length === 0} onClick={() => accept(sugg)}>
                        {t('formSuggestAddAll')} ({sugg.length})
                      </button>
                      <button type="button" className="btn" disabled={!sugg.some((g) => g.page === page)} onClick={() => accept(sugg.filter((g) => g.page === page))}>
                        {t('formSuggestAddPage')}
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setDismissed(true)}>
                        {t('formSuggestDismiss')}
                      </button>
                    </div>
                    <p className="panel-title">{t('formSrcTitle')}</p>
                    {(['cell', 'blank', 'line', 'label'] as SuggestionSource[]).map((k) => (
                      <Checkbox key={k} checked={kinds[k]} onChange={(v) => setKinds((prev) => ({ ...prev, [k]: v }))}>
                        {t(SRC_LABEL[k])} ({allSugg.filter((g) => g.source === k).length})
                      </Checkbox>
                    ))}
                    <p className="hint">{t('formSuggestClick')}</p>
                  </>
                )}
                {!analyzing && analysis && (analysis.total === 0 || dismissed) && (
                  <p className="muted">{analysis.scanned && analysis.total === 0 ? t('formSuggestScanned') : t('formSuggestNone')}</p>
                )}
                <p className="hint"><strong>{t('formDrawTitle')}</strong> {t('formDrawHint')}</p>
              </div>
              {mode === 'prepare' && (
              <>
              <div className="panel">
                <div className="mode-bar" role="group" aria-label={t('formTools')}>
                  {KINDS.map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" className="mode-btn" aria-pressed={kind === id} onClick={() => setKind(id)}>
                      <Icon size={16} aria-hidden />
                      {t(label)}
                    </button>
                  ))}
                </div>
                <p className="hint">{t('formHint')}</p>
                <p className="hint">{t('boxHint')}</p>
                {existing.length > 0 && <p className="muted">{existing.length} {t('formExisting')}</p>}
              </div>

              {sel && (
                <div className="panel">
                  <p className="panel-title">{t('formProps')}</p>
                  <Field label={t('formName')} hint={sel.kind === 'radio' ? t('formRadioHint') : undefined}>
                    {(id) => <input id={id} className="input" dir="ltr" value={sel.name} onChange={(e) => update(sel.id, { name: e.target.value })} />}
                  </Field>
                  {(sel.kind === 'dropdown' || sel.kind === 'list') && (
                    <Field label={t('formOptions')} hint={t('formOptionsHint')}>
                      {(id) => <textarea id={id} className="input" rows={4} dir="auto" value={(sel.options ?? []).join('\n')} onChange={(e) => update(sel.id, { options: e.target.value.split('\n') })} />}
                    </Field>
                  )}
                  {sel.kind === 'radio' && (
                    <Field label={t('formValue')}>
                      {(id) => <input id={id} className="input" dir="auto" value={sel.options?.[0] ?? ''} onChange={(e) => update(sel.id, { options: [e.target.value] })} />}
                    </Field>
                  )}
                  <Field label={t('formTooltip')}>
                    {(id) => <input id={id} className="input" dir="auto" value={sel.tooltip ?? ''} onChange={(e) => update(sel.id, { tooltip: e.target.value })} />}
                  </Field>
                  <RectFields rect={sel.rect} onChange={(rect) => update(sel.id, { rect })} />
                  <Checkbox checked={!!sel.required} onChange={(v) => update(sel.id, { required: v })}>{t('formRequired')}</Checkbox>
                  <button type="button" className="btn" onClick={() => { setItems((prev) => prev.filter((x) => x.id !== sel.id)); setSelected(null); }}>
                    <Trash2 size={16} aria-hidden /> {t('remove')}
                  </button>
                </div>
              )}

              <div className="panel">
                <p className="panel-title">
                  {t('formFields')} ({items.length})
                </p>
                {items.length === 0 && <p className="muted">{t('formEmpty')}</p>}
                <ul className="list">
                  {items.map((i) => (
                    <li key={i.id} className={`row${selected === i.id ? ' is-over' : ''}`}>
                      <div className="row-main">
                        <button type="button" className="link-btn" onClick={() => { setSelected(i.id); setPage(i.page); }}>
                          <bdi>{i.name}</bdi>
                        </button>
                        <div className="row-meta">{t(KINDS.find((k) => k.id === i.kind)!.label)} · {t('pageLabel')} {i.page + 1}</div>
                      </div>
                    </li>
                  ))}
                </ul>
                {nameClash && <Notice kind="error">{t('formNameClash')}</Notice>}
                <button type="button" className="btn btn-primary" data-save disabled={busy || items.length === 0 || nameClash} onClick={save}>
                  {busy ? t('processing') : t('formSave')}
                </button>
                {done && <Notice kind="success">{t('formDone')}</Notice>}
                {failed && <Notice kind="error">{failed}</Notice>}
              </div>
              </>
              )}
            </aside>
          </div>
        </>
      )}
    </ToolPage>
  );
}
