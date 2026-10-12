import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, PenLine, Trash2, Type } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Checkbox, Field, FileBar } from '../components/Fields';
import { EditableBox } from '../components/EditableBox';
import { PageStage, type StagePointer } from '../components/PageStage';
import { SignaturePad, type SignatureImage } from '../components/SignaturePad';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, downloadBytes, nextId, toBase64 } from '../lib/pdf';
import { fillPdf, listFormFields, type FillMark, type FormFieldInfo } from '../lib/ops/fill';
import { useHistory } from '../hooks/useHistory';

type Tool = 'text' | 'date' | 'check' | 'signature';
type Item = FillMark & { id: string; preview?: string };

const COLORS = ['#000000', '#1d4ed8', '#b91c1c', '#15803d'];

/** yyyy-mm-dd with Western digits, in the person's own time zone. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function FillSignTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile();
  const [page, setPage] = useState(0);
  const [tool, setTool] = useState<Tool>('text');
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [fields, setFields] = useState<FormFieldInfo[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [signature, setSignature] = useState<SignatureImage | null>(null);
  const [making, setMaking] = useState(false);
  const [flatten, setFlatten] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<Key | null>(null);
  useHistory({ items, values, signature, flatten }, (s) => { setItems(s.items); setValues(s.values); setSignature(s.signature); setFlatten(s.flatten); setSelected(null); setDone(false); }, fields);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!pdf) return;
    let alive = true;
    listFormFields(pdf.bytes)
      .then((f) => {
        if (!alive) return;
        setFields(f);
        setValues(Object.fromEntries(f.filter((x) => x.kind !== 'button' && x.kind !== 'signature').map((x) => [x.name, x.value])));
      })
      .catch(() => alive && setFields([]));
    return () => {
      alive = false;
    };
  }, [pdf]);

  const place = (p: StagePointer) => {
    if (!pdf) return;
    const [x, y] = p.pdf;
    const id = nextId();
    setDone(false);
    if (tool === 'text' || tool === 'date') {
      setItems((prev) => [...prev, { kind: 'text', page, x, y, text: tool === 'date' ? today() : t('fillDefaultText'), size: 14, color, id }]);
    } else if (tool === 'check') {
      setItems((prev) => [...prev, { kind: 'check', page, x: x - 8, y: y - 8, size: 16, color, id }]);
    } else if (signature) {
      const width = 140;
      const height = width / signature.aspect;
      setItems((prev) => [
        ...prev,
        { kind: 'image', page, x: x - width / 2, y: y - height / 2, width, height, image: { bytes: signature.bytes, mime: signature.mime }, id, preview: `data:image/png;base64,${toBase64(signature.bytes)}` },
      ]);
    } else {
      setMaking(true);
      return;
    }
    setSelected(id);
  };

  const grab = (id: string, at: [number, number], it: Item) => {
    setSelected(id);
    dragging.current = { id, dx: at[0] - it.x, dy: at[1] - it.y };
  };
  const move = (p: StagePointer) => {
    const d = dragging.current;
    if (!d) return;
    setItems((prev) => prev.map((x) => (x.id === d.id ? { ...x, x: p.pdf[0] - d.dx, y: p.pdf[1] - d.dy } : x)));
  };
  const release = () => {
    dragging.current = null;
  };

  const save = async () => {
    if (!pdf) return;
    setBusy(true);
    setFailed(null);
    try {
      const changed: Record<string, string | boolean> = {};
      for (const f of fields) if (f.name in values && values[f.name] !== f.value) changed[f.name] = values[f.name];
      const marks: FillMark[] = items.map(({ id: _id, preview: _p, ...m }) => m as FillMark);
      downloadBytes(await fillPdf(pdf.bytes, { values: changed, marks, flatten }), `${baseName(pdf.file.name)}${t('fillSuffix')}.pdf`);
      setDone(true);
    } catch {
      setFailed('errGeneric');
    } finally {
      setBusy(false);
    }
  };

  const sel = items.find((i) => i.id === selected);
  const update = (id: string, patch: Partial<FillMark>) => setItems((prev) => prev.map((x) => (x.id === id ? ({ ...x, ...patch } as Item) : x)));

  const tools: { id: Tool; label: Key; icon: typeof Type }[] = [
    { id: 'text', label: 'fillText', icon: Type },
    { id: 'date', label: 'fillDate', icon: CalendarDays },
    { id: 'check', label: 'fillCheck', icon: Check },
    { id: 'signature', label: 'fillSignature', icon: PenLine },
  ];
  const editable = fields.filter((f) => f.kind !== 'button' && f.kind !== 'signature' && !f.readOnly);

  return (
    <ToolPage title={t('toolFillSign')} desc={t('toolFillSignDesc')}>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('loadingPages')}</p>}
      {pdf && (
        <>
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setItems([]); setSelected(null); setPage(0); setDone(false); }} />
          <div className="work">
            <PageStage preview={pdf.preview} page={page} onPage={setPage} cursor="crosshair" onPointerDown={place} onPointerMove={move} onPointerUp={release}>
              {(vp) => (
                <>
                  {items
                    .filter((i) => i.page === page)
                    .map((i) => {
                      const [vx, vy] = vp.toView(i.x, i.y);
                      const cls = `mark${selected === i.id ? ' is-selected' : ''}`;
                      const stop = (e: React.PointerEvent) => {
                        e.stopPropagation();
                      };
                      const start = (e: React.PointerEvent<Element>) => {
                        stop(e);
                        const layer = e.currentTarget.parentElement?.getBoundingClientRect();
                        if (!layer) return;
                        grab(i.id, vp.toPdf(e.clientX - layer.left, e.clientY - layer.top), i);
                      };
                      if (i.kind === 'text') {
                        return (
                          <span key={i.id} className={`${cls} fill-text`} style={{ left: vx, top: vy - i.size * vp.scale * 0.85, fontSize: i.size * vp.scale, ['--c' as string]: i.color }} dir="auto" onPointerDown={start} onPointerUp={release}>
                            {i.text}
                          </span>
                        );
                      }
                      if (i.kind === 'check') {
                        const s = i.size * vp.scale;
                        return (
                          <svg key={i.id} className={`${cls} fill-check`} style={{ left: vx, top: vy - s, width: s, height: s }} viewBox="0 0 10 10" onPointerDown={start} onPointerUp={release}>
                            <path d="M1.2 5.5 L4 8.8 L9 1.2" fill="none" stroke={i.color} strokeWidth={1.2} />
                          </svg>
                        );
                      }
                      return (
                        <EditableBox
                          key={i.id}
                          vp={vp}
                          rect={{ x: i.x, y: i.y, width: i.width, height: i.height }}
                          selected={selected === i.id}
                          className="fill-image"
                          label={t('fillSignature')}
                          onSelect={() => setSelected(i.id)}
                          onChange={(r) => setItems((prev) => prev.map((x) => (x.id === i.id && x.kind === 'image' ? { ...x, ...r } : x)))}
                          onDelete={() => { setItems((prev) => prev.filter((x) => x.id !== i.id)); setSelected(null); }}
                        >
                          <img src={i.preview} alt={t('fillSignature')} draggable={false} />
                        </EditableBox>
                      );
                    })}
                </>
              )}
            </PageStage>

            <aside className="side">
              <div className="panel">
                <div className="mode-bar" role="group" aria-label={t('fillTools')}>
                  {tools.map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" className="mode-btn" aria-pressed={tool === id} onClick={() => { setTool(id); if (id === 'signature' && !signature) setMaking(true); }}>
                      <Icon size={16} aria-hidden />
                      {t(label)}
                    </button>
                  ))}
                </div>
                <p className="hint">{t(tool === 'signature' ? 'fillHintSign' : 'fillHintPlace')}</p>
                {tool !== 'signature' && (
                  <div className="swatches" role="group" aria-label={t('stampColor')}>
                    {COLORS.map((c) => (
                      <button key={c} type="button" className={`swatch${color === c ? ' is-active' : ''}`} style={{ background: c }} aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} />
                    ))}
                  </div>
                )}
                {tool === 'signature' && signature && !making && (
                  <button type="button" className="btn" onClick={() => setMaking(true)}>
                    {t('signNew')}
                  </button>
                )}
              </div>

              {making && (
                <SignaturePad
                  onUse={(s) => { setSignature(s); setMaking(false); setTool('signature'); }}
                  onCancel={() => setMaking(false)}
                />
              )}

              {sel && (
                <div className="panel">
                  <p className="panel-title">{t('fillSelected')}</p>
                  {sel.kind === 'text' && (
                    <>
                      <Field label={t('fillTextLabel')}>
                        {(id) => <input id={id} className="input" dir="auto" value={sel.text} onChange={(e) => update(sel.id, { text: e.target.value })} />}
                      </Field>
                      <Field label={t('stampSize')}>
                        {(id) => <input id={id} className="input" type="range" min={8} max={48} value={sel.size} onChange={(e) => update(sel.id, { size: Number(e.target.value) })} />}
                      </Field>
                    </>
                  )}
                  {sel.kind === 'check' && (
                    <Field label={t('stampSize')}>
                      {(id) => <input id={id} className="input" type="range" min={8} max={48} value={sel.size} onChange={(e) => update(sel.id, { size: Number(e.target.value) })} />}
                    </Field>
                  )}
                  {sel.kind === 'image' && (
                    <Field label={t('stampWidth')}>
                      {(id) => (
                        <input
                          id={id}
                          className="input"
                          type="range"
                          min={40}
                          max={400}
                          value={sel.width}
                          onChange={(e) => {
                            const w = Number(e.target.value);
                            update(sel.id, { width: w, height: (w / sel.width) * sel.height });
                          }}
                        />
                      )}
                    </Field>
                  )}
                  <button type="button" className="btn" onClick={() => { setItems((prev) => prev.filter((x) => x.id !== sel.id)); setSelected(null); }}>
                    <Trash2 size={16} aria-hidden /> {t('remove')}
                  </button>
                </div>
              )}

              {editable.length > 0 && (
                <div className="panel">
                  <p className="panel-title">
                    {t('fillFields')} ({editable.length})
                  </p>
                  {editable.map((f) => (
                    <Field key={f.name} label={`${f.name}${f.page >= 0 ? ` · ${t('pageLabel')} ${f.page + 1}` : ''}`}>
                      {(id) =>
                        f.kind === 'checkbox' ? (
                          <input id={id} type="checkbox" checked={values[f.name] === true} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))} />
                        ) : f.kind === 'text' ? (
                          f.multiline ? (
                            <textarea id={id} className="input" dir="auto" rows={3} value={String(values[f.name] ?? '')} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
                          ) : (
                            <input id={id} className="input" dir="auto" value={String(values[f.name] ?? '')} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
                          )
                        ) : (
                          <select id={id} className="input" value={String(values[f.name] ?? '')} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
                            <option value="" />
                            {f.options?.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        )
                      }
                    </Field>
                  ))}
                </div>
              )}

              <div className="panel">
                <Checkbox checked={flatten} onChange={setFlatten}>
                  {t('fillFlatten')}
                </Checkbox>
                <p className="hint">{t('fillFlattenHint')}</p>
                <button type="button" className="btn btn-primary" data-save disabled={busy} onClick={save}>
                  {busy ? t('processing') : t('fillSave')}
                </button>
                {done && <Notice kind="success">{t('fillDone')}</Notice>}
                {failed && <Notice kind="error">{t(failed)}</Notice>}
              </div>
            </aside>
          </div>
        </>
      )}
    </ToolPage>
  );
}
