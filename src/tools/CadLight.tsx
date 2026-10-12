import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, FileDown, FilePlus2, Hand, Maximize, Minus, MousePointer2, Ruler, Spline, Square, Trash2, Type, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { ToolPage, Notice } from '../components/Shell';
import { useHistory } from '../hooks/useHistory';
import { bounds, dist, fmt, fromDxf, hit, measure, move, newId, ortho, outline, snap, snapToShapes, textWidth, toDxf, toSvg, type Entity, type Pt } from '../lib/cad/model';
import { downloadBytes } from '../lib/pdf';

type Tool = 'select' | 'pan' | 'line' | 'rect' | 'circle' | 'poly' | 'text' | 'measure';
const TOOLS: { id: Tool; icon: typeof Minus; key: Key; code: string }[] = [
  { id: 'select', icon: MousePointer2, key: 'cadSelect', code: 'KeyV' },
  { id: 'pan', icon: Hand, key: 'cadPan', code: 'KeyH' },
  { id: 'line', icon: Minus, key: 'cadLine', code: 'KeyL' },
  { id: 'rect', icon: Square, key: 'cadRect', code: 'KeyR' },
  { id: 'circle', icon: Circle, key: 'cadCircle', code: 'KeyC' },
  { id: 'poly', icon: Spline, key: 'cadPoly', code: 'KeyP' },
  { id: 'text', icon: Type, key: 'cadText', code: 'KeyT' },
  { id: 'measure', icon: Ruler, key: 'cadMeasure', code: 'KeyM' },
];

const STORAGE = 'shootcut:cad';
interface Saved {
  list: Entity[];
  grid: number;
}
function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE);
    const s = raw ? (JSON.parse(raw) as Saved) : null;
    if (s && Array.isArray(s.list)) return { list: s.list, grid: s.grid > 0 ? s.grid : 10 };
  } catch {
    /* nothing saved, or storage blocked */
  }
  return { list: [], grid: 10 };
}

interface View {
  x: number; // world point at the middle of the canvas
  y: number;
  k: number; // pixels per millimetre
}
const INK = '#14161a';
const SEL = '#d71920';

/** world → screen and back (the world's y axis points up) */
const toScreen = (v: View, w: number, h: number, p: Pt): Pt => ({ x: w / 2 + (p.x - v.x) * v.k, y: h / 2 - (p.y - v.y) * v.k });
const toWorld = (v: View, w: number, h: number, s: Pt): Pt => ({ x: v.x + (s.x - w / 2) / v.k, y: v.y - (s.y - h / 2) / v.k });

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, v: View, list: Entity[], sel: string | null, grid: number, draft: Entity | null, marker: Pt | null, ruler: [Pt, Pt] | null, white: boolean) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  if (!white) {
    // grid: dots at every step, hidden when they would be too close together
    let step = grid;
    while (step * v.k < 9) step *= 5;
    const a = toWorld(v, w, h, { x: 0, y: h });
    const b = toWorld(v, w, h, { x: w, y: 0 });
    ctx.fillStyle = '#b9bdc4';
    for (let gx = Math.ceil(a.x / step) * step; gx <= b.x; gx += step)
      for (let gy = Math.ceil(a.y / step) * step; gy <= b.y; gy += step) {
        const s = toScreen(v, w, h, { x: gx, y: gy });
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1.5, 1.5);
      }
    ctx.strokeStyle = '#8a8f98';
    ctx.lineWidth = 1;
    const o = toScreen(v, w, h, { x: 0, y: 0 });
    ctx.beginPath();
    ctx.moveTo(o.x - 8, o.y);
    ctx.lineTo(o.x + 8, o.y);
    ctx.moveTo(o.x, o.y - 8);
    ctx.lineTo(o.x, o.y + 8);
    ctx.stroke();
  }
  const draw = (e: Entity, colour: string, dash = false) => {
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = colour === SEL ? 2.2 : 1.4;
    ctx.setLineDash(dash ? [6, 4] : []);
    if (e.type === 'text') {
      const s = toScreen(v, w, h, e.p);
      ctx.font = `${Math.max(6, e.h * v.k)}px "The Year of Handicrafts", system-ui, sans-serif`;
      ctx.textBaseline = 'alphabetic';
      ctx.direction = 'inherit';
      ctx.fillText(e.s, s.x, s.y);
      if (colour === SEL) ctx.strokeRect(s.x - 2, s.y - e.h * v.k - 2, textWidth(e) * v.k + 4, e.h * v.k + 6);
      return;
    }
    ctx.beginPath();
    if (e.type === 'circle') {
      const c = toScreen(v, w, h, e.c);
      ctx.arc(c.x, c.y, Math.max(0.5, e.r * v.k), 0, Math.PI * 2);
    } else {
      const { pts, closed } = outline(e);
      pts.forEach((p, i) => {
        const s = toScreen(v, w, h, p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      if (closed) ctx.closePath();
    }
    ctx.stroke();
  };
  for (const e of list) draw(e, e.id === sel ? SEL : INK);
  if (draft) draw(draft, SEL, true);
  ctx.setLineDash([]);
  if (ruler) {
    const a = toScreen(v, w, h, ruler[0]);
    const b = toScreen(v, w, h, ruler[1]);
    ctx.strokeStyle = '#0b6bcb';
    ctx.fillStyle = '#0b6bcb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${fmt(dist(ruler[0], ruler[1]))} mm`, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6);
  }
  if (marker) {
    const s = toScreen(v, w, h, marker);
    ctx.strokeStyle = SEL;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(s.x - 5, s.y - 5, 10, 10);
  }
}

export default function CadLight() {
  const { t } = useI18n();
  const [saved] = useState(load);
  const [list, setList] = useState<Entity[]>(saved.list);
  const [grid, setGrid] = useState(saved.grid);
  const [tool, setTool] = useState<Tool>('line');
  const [sel, setSel] = useState<string | null>(null);
  const [snapGrid, setSnapGrid] = useState(true);
  const [snapShape, setSnapShape] = useState(true);
  const [orthoOn, setOrthoOn] = useState(false);
  const [draftPts, setDraftPts] = useState<Pt[]>([]);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [ruler, setRuler] = useState<[Pt, Pt] | null>(null);
  const [view, setView] = useState<View>({ x: 100, y: 60, k: 3 });
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [textValue, setTextValue] = useState('');
  const [textH, setTextH] = useState(8);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'pan' | 'move'; last: Pt; moved: boolean } | null>(null);
  const space = useRef(false);

  useHistory({ list }, (s) => {
    setList(s.list);
    setSel(null);
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ list, grid } satisfies Saved));
    } catch {
      /* too big or blocked: the drawing lives on this page only */
    }
  }, [list, grid]);

  // keep the canvas as big as its box, sharp on dense screens
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setSize({ w: Math.max(240, Math.round(el.clientWidth)), h: Math.max(280, Math.round(el.clientHeight)) });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tol = 8 / view.k;

  /** the point under the pointer after the snapping the person asked for */
  const place = useCallback(
    (raw: Pt, shift = false): Pt => {
      let p = raw;
      const from = draftPts.length > 0 ? draftPts[draftPts.length - 1] : null;
      if (from && (orthoOn || shift) && tool !== 'circle' && tool !== 'rect') p = ortho(from, p);
      if (snapShape) {
        const q = snapToShapes(p, list, 10 / view.k);
        if (q) return q;
      }
      return snapGrid ? snap(p, grid) : p;
    },
    [draftPts, orthoOn, tool, snapShape, snapGrid, grid, list, view.k],
  );

  // what is being drawn right now
  const draft: Entity | null = (() => {
    if (!cursor || draftPts.length === 0) return null;
    const a = draftPts[0];
    if (tool === 'line') return { id: 'draft', type: 'line', a, b: cursor };
    if (tool === 'rect') return { id: 'draft', type: 'rect', a, b: cursor };
    if (tool === 'circle') return { id: 'draft', type: 'circle', c: a, r: dist(a, cursor) };
    if (tool === 'poly') return { id: 'draft', type: 'poly', pts: [...draftPts, cursor], closed: false };
    return null;
  })();

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    ctx.scale(dpr, dpr);
    paint(ctx, size.w, size.h, view, list, sel, grid, draft, tool === 'select' || tool === 'pan' ? null : cursor, ruler, false);
  });

  const commit = (e: Entity | null) => {
    if (!e) return;
    setList((l) => [...l, e]);
    setSel(e.id);
  };

  const finishPoly = (closed: boolean) => {
    if (draftPts.length >= 2) commit({ id: newId(), type: 'poly', pts: draftPts, closed: closed && draftPts.length >= 3 });
    setDraftPts([]);
  };

  const cancel = () => {
    setDraftPts([]);
    setRuler(null);
    setTyped('');
  };

  const pick = (p: Pt) => {
    for (let i = list.length - 1; i >= 0; i--) if (hit(list[i], p, tol)) return list[i].id;
    return null;
  };

  const fit = useCallback(() => {
    const b = bounds(list);
    if (!b) return setView({ x: 100, y: 60, k: 3 });
    const w = Math.max(1, b.maxX - b.minX);
    const h = Math.max(1, b.maxY - b.minY);
    setView({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, k: Math.min((size.w * 0.88) / w, (size.h * 0.88) / h, 60) });
  }, [list, size]);

  const zoomAt = (factor: number, at?: Pt) => {
    setView((v) => {
      const k = Math.min(200, Math.max(0.2, v.k * factor));
      if (!at) return { ...v, k };
      const before = toWorld(v, size.w, size.h, at);
      const nv = { ...v, k };
      const after = toWorld(nv, size.w, size.h, at);
      return { x: v.x + before.x - after.x, y: v.y + before.y - after.y, k };
    });
  };

  const local = (ev: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  const onDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    const s = local(ev);
    const w = toWorld(view, size.w, size.h, s);
    if (ev.button === 1 || tool === 'pan' || space.current) {
      drag.current = { kind: 'pan', last: s, moved: false };
      return;
    }
    if (ev.button !== 0) return;
    const p = place(w, ev.shiftKey);
    if (tool === 'select') {
      const id = pick(w);
      setSel(id);
      if (id) drag.current = { kind: 'move', last: p, moved: false };
      return;
    }
    if (tool === 'text') {
      if (textValue.trim()) commit({ id: newId(), type: 'text', p, h: textH, s: textValue.trim() });
      return;
    }
    if (tool === 'measure') {
      setRuler((r) => (r && r.length === 2 && draftPts.length === 0 ? [p, p] : r));
      if (draftPts.length === 0) {
        setDraftPts([p]);
        setRuler([p, p]);
      } else {
        setRuler([draftPts[0], p]);
        setDraftPts([]);
      }
      return;
    }
    if (tool === 'poly') {
      setDraftPts((d) => [...d, p]);
      return;
    }
    // line, rectangle, circle: the first click starts, the second finishes
    if (draftPts.length === 0) {
      setDraftPts([p]);
      return;
    }
    const a = draftPts[0];
    if (dist(a, p) > 0.0001) {
      if (tool === 'line') commit({ id: newId(), type: 'line', a, b: p });
      else if (tool === 'rect') commit({ id: newId(), type: 'rect', a, b: p });
      else if (tool === 'circle') commit({ id: newId(), type: 'circle', c: a, r: dist(a, p) });
    }
    setDraftPts([]);
    setTyped('');
  };

  const onMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const s = local(ev);
    const d = drag.current;
    if (d?.kind === 'pan') {
      setView((v) => ({ ...v, x: v.x - (s.x - d.last.x) / v.k, y: v.y + (s.y - d.last.y) / v.k }));
      d.last = s;
      return;
    }
    const p = place(toWorld(view, size.w, size.h, s), ev.shiftKey);
    setCursor(p);
    if (tool === 'measure' && draftPts.length === 1) setRuler([draftPts[0], p]);
    if (d?.kind === 'move' && sel) {
      const dx = p.x - d.last.x;
      const dy = p.y - d.last.y;
      if (dx !== 0 || dy !== 0) {
        d.moved = true;
        d.last = p;
        setList((l) => l.map((e) => (e.id === sel ? move(e, dx, dy) : e)));
      }
    }
  };

  const onUp = () => {
    drag.current = null;
  };

  const onWheel = (ev: React.WheelEvent<HTMLCanvasElement>) => {
    zoomAt(ev.deltaY < 0 ? 1.15 : 1 / 1.15, local(ev));
  };

  /** a number typed while drawing a line or circle sets its exact length / radius in the pointer's direction */
  const applyTyped = () => {
    const n = parseFloat(typed.replace(',', '.').replace('٫', '.'));
    if (!(n > 0) || draftPts.length === 0) return;
    const a = draftPts[0];
    const dir = cursor && dist(a, cursor) > 0 ? { x: (cursor.x - a.x) / dist(a, cursor), y: (cursor.y - a.y) / dist(a, cursor) } : { x: 1, y: 0 };
    if (tool === 'line') commit({ id: newId(), type: 'line', a, b: { x: a.x + dir.x * n, y: a.y + dir.y * n } });
    else if (tool === 'circle') commit({ id: newId(), type: 'circle', c: a, r: n });
    setDraftPts([]);
    setTyped('');
  };

  const remove = () => {
    if (!sel) return;
    setList((l) => l.filter((e) => e.id !== sel));
    setSel(null);
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        space.current = true;
        e.preventDefault();
        return;
      }
      const tl = TOOLS.find((x) => x.code === e.code);
      if (tl) {
        setTool(tl.id);
        cancel();
        return;
      }
      if (e.code === 'Escape') cancel();
      else if (e.code === 'Enter' && tool === 'poly') finishPoly(e.shiftKey);
      else if ((e.code === 'Delete' || e.code === 'Backspace') && sel) {
        remove();
        e.preventDefault();
      } else if (sel && e.code.startsWith('Arrow')) {
        const step = e.shiftKey ? grid * 5 : grid;
        const dx = e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0;
        const dy = e.code === 'ArrowDown' ? -step : e.code === 'ArrowUp' ? step : 0;
        setList((l) => l.map((x) => (x.id === sel ? move(x, dx, dy) : x)));
        e.preventDefault();
      } else if (e.code === 'KeyF') fit();
      else if (e.code === 'KeyO') setOrthoOn((o) => !o);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  /* ------------------------------------------------------------ files */

  const stem = 'drawing';
  const exportDxf = () => downloadBytes(new TextEncoder().encode(toDxf(list)), `${stem}.dxf`, 'application/dxf');
  const exportSvg = () => downloadBytes(new TextEncoder().encode(toSvg(list)), `${stem}.svg`, 'image/svg+xml');
  const exportPng = async () => {
    setError(false);
    try {
      const b = bounds(list);
      if (!b) return;
      const pad = 10;
      const w = b.maxX - b.minX + pad * 2;
      const h = b.maxY - b.minY + pad * 2;
      const k = Math.min(4000 / w, 4000 / h, 20);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      const ctx = c.getContext('2d')!;
      await document.fonts?.ready;
      paint(ctx, c.width, c.height, { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, k }, list, null, grid, null, null, null, true);
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
      if (!blob) throw new Error('png');
      downloadBytes(new Uint8Array(await blob.arrayBuffer()), `${stem}.png`, 'image/png');
    } catch (e) {
      console.error('[shootcut] cad png failed', e);
      setError(true);
    }
  };
  const importDxf = async (file: File | undefined) => {
    if (!file) return;
    setError(false);
    setNote(null);
    try {
      const r = fromDxf(await file.text());
      if (r.entities.length === 0) {
        setError(true);
        return;
      }
      setList((l) => [...l, ...r.entities]);
      setNote(r.skipped > 0 ? `${t('cadImported')} ${r.entities.length} · ${t('cadSkipped')} ${r.skipped}` : `${t('cadImported')} ${r.entities.length}`);
      setSel(null);
      setTimeout(() => fit(), 0);
    } catch {
      setError(true);
    }
  };
  const reset = () => {
    if (window.confirm(t('cadNewConfirm'))) {
      setList([]);
      setSel(null);
      cancel();
    }
  };

  /* ------------------------------------------------------------ side panel */

  const current = list.find((e) => e.id === sel) ?? null;
  const m = current ? measure(current) : null;
  const setLength = (n: number) => {
    if (!current || !(n > 0)) return;
    setList((l) =>
      l.map((e) => {
        if (e.id !== sel) return e;
        if (e.type === 'circle') return { ...e, r: n };
        if (e.type === 'line') {
          const d = dist(e.a, e.b) || 1;
          return { ...e, b: { x: e.a.x + ((e.b.x - e.a.x) / d) * n, y: e.a.y + ((e.b.y - e.a.y) / d) * n } };
        }
        return e;
      }),
    );
  };

  const status = (() => {
    if (tool === 'measure' && ruler) {
      const dx = ruler[1].x - ruler[0].x, dy = ruler[1].y - ruler[0].y;
      return `${t('cadDistance')}: ${fmt(dist(ruler[0], ruler[1]))} mm · ΔX ${fmt(dx)} · ΔY ${fmt(dy)} · ${fmt((Math.atan2(dy, dx) * 180) / Math.PI, 1)}°`;
    }
    if (draft && cursor) {
      if (draft.type === 'line') return `${t('cadLength')}: ${fmt(dist(draft.a, draft.b))} mm`;
      if (draft.type === 'rect') return `${fmt(Math.abs(draft.b.x - draft.a.x))} × ${fmt(Math.abs(draft.b.y - draft.a.y))} mm`;
      if (draft.type === 'circle') return `${t('cadRadius')}: ${fmt(draft.r)} mm`;
    }
    return cursor ? `X ${fmt(cursor.x)}  Y ${fmt(cursor.y)} mm` : t('cadStart');
  })();

  return (
    <ToolPage title={t('toolCad')} desc={t('toolCadDesc')}>
      <div className="sheet-toolbar">
        <button type="button" className="btn" onClick={reset}>
          <FilePlus2 size={16} aria-hidden /> {t('cadNew')}
        </button>
        <label className="btn">
          <Upload size={16} aria-hidden /> {t('cadOpenDxf')}
          <input type="file" accept=".dxf,application/dxf,image/vnd.dxf" hidden onChange={(e) => { void importDxf(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        <button type="button" className="btn btn-primary" data-save disabled={list.length === 0} onClick={exportDxf}>
          <FileDown size={16} aria-hidden /> {t('cadSaveDxf')}
        </button>
        <button type="button" className="btn" disabled={list.length === 0} onClick={exportSvg}>
          {t('cadSaveSvg')}
        </button>
        <button type="button" className="btn" disabled={list.length === 0} onClick={() => void exportPng()}>
          {t('cadSavePng')}
        </button>
      </div>
      {note && <Notice kind="success">{note}</Notice>}
      {error && <Notice kind="error">{t('cadFailed')}</Notice>}

      <div className="cad-tools" role="toolbar" aria-label={t('cadTools')}>
        {TOOLS.map(({ id, icon: Icon, key }) => (
          <button key={id} type="button" className={`btn cad-tool${tool === id ? ' is-on' : ''}`} aria-pressed={tool === id} data-tool={id} onClick={() => { setTool(id); cancel(); }}>
            <Icon size={16} aria-hidden /> {t(key)}
          </button>
        ))}
        <span className="cad-sep" aria-hidden />
        <button type="button" className="btn" aria-label={t('cadZoomIn')} onClick={() => zoomAt(1.4)}><ZoomIn size={16} aria-hidden /></button>
        <button type="button" className="btn" aria-label={t('cadZoomOut')} onClick={() => zoomAt(1 / 1.4)}><ZoomOut size={16} aria-hidden /></button>
        <button type="button" className="btn" aria-label={t('cadFit')} onClick={fit}><Maximize size={16} aria-hidden /></button>
      </div>

      <div className="cad-options">
        <label className="check"><input type="checkbox" checked={snapGrid} onChange={(e) => setSnapGrid(e.target.checked)} /> {t('cadSnapGrid')}</label>
        <label className="check"><input type="checkbox" checked={snapShape} onChange={(e) => setSnapShape(e.target.checked)} /> {t('cadSnapShape')}</label>
        <label className="check"><input type="checkbox" checked={orthoOn} onChange={(e) => setOrthoOn(e.target.checked)} /> {t('cadOrtho')}</label>
        <label className="cad-num">
          {t('cadGridStep')}
          <input className="input" type="number" min={0.5} step={0.5} value={grid} onChange={(e) => setGrid(Math.max(0.5, Number(e.target.value) || 10))} />
        </label>
        {tool === 'text' && (
          <>
            <input className="input" dir="auto" aria-label={t('cadTextValue')} placeholder={t('cadTextValue')} value={textValue} onChange={(e) => setTextValue(e.target.value)} />
            <label className="cad-num">
              {t('cadTextHeight')}
              <input className="input" type="number" min={1} value={textH} onChange={(e) => setTextH(Math.max(1, Number(e.target.value) || 8))} />
            </label>
          </>
        )}
        {(tool === 'line' || tool === 'circle') && draftPts.length === 1 && (
          <form className="cad-num" onSubmit={(e) => { e.preventDefault(); applyTyped(); }}>
            <label>
              {tool === 'line' ? t('cadLength') : t('cadRadius')}
              <input className="input" inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </label>
            <button type="submit" className="btn">{t('cadApply')}</button>
          </form>
        )}
        {tool === 'poly' && draftPts.length >= 2 && (
          <>
            <button type="button" className="btn" onClick={() => finishPoly(false)}>{t('cadFinish')}</button>
            <button type="button" className="btn" disabled={draftPts.length < 3} onClick={() => finishPoly(true)}>{t('cadFinishClosed')}</button>
          </>
        )}
      </div>

      <div className="cad-layout">
        <div className="cad-wrap" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            className="cad-canvas"
            style={{ width: size.w, height: size.h, cursor: tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair' }}
            role="img"
            aria-label={t('cadCanvas')}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => setCursor(null)}
            onWheel={onWheel}
            onDoubleClick={() => tool === 'poly' && finishPoly(false)}
          />
        </div>
        <aside className="cad-side" aria-label={t('cadProps')}>
          <p className="cad-status" role="status">{status}</p>
          {current && m ? (
            <div className="cad-props" data-selected={current.type}>
              <h2>{t(`cadKind_${current.type}` as Key)}</h2>
              {m.width !== undefined && m.height !== undefined && <p>{t('cadSize')}: {fmt(m.width)} × {fmt(m.height)} mm</p>}
              {m.length !== undefined && current.type !== 'circle' && <p>{current.type === 'line' ? t('cadLength') : t('cadPerimeter')}: {fmt(m.length)} mm</p>}
              {m.radius !== undefined && <p>{t('cadRadius')}: {fmt(m.radius)} mm</p>}
              {m.area !== undefined && <p>{t('cadArea')}: {fmt(m.area)} mm²</p>}
              {(current.type === 'line' || current.type === 'circle') && (
                <label className="cad-num">
                  {current.type === 'line' ? t('cadLength') : t('cadRadius')}
                  <input key={`${current.id}${fmt(current.type === 'line' ? m.length ?? 0 : m.radius ?? 0)}`} className="input" type="number" min={0.01} step="any" defaultValue={fmt(current.type === 'line' ? m.length ?? 0 : m.radius ?? 0)} onBlur={(e) => setLength(Number(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                </label>
              )}
              {current.type === 'text' && (
                <input className="input" dir="auto" aria-label={t('cadTextValue')} value={current.s} onChange={(e) => setList((l) => l.map((x) => (x.id === sel && x.type === 'text' ? { ...x, s: e.target.value } : x)))} />
              )}
              <button type="button" className="btn" onClick={remove}>
                <Trash2 size={16} aria-hidden /> {t('cadDelete')}
              </button>
            </div>
          ) : (
            <p className="hint">{t('cadNoSelection')}</p>
          )}
          <p className="hint">{t('cadCount')}: {list.length}</p>
        </aside>
      </div>
      <p className="hint">{t('cadHint')}</p>
    </ToolPage>
  );
}
