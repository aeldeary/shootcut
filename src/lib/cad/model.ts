/**
 * The drawing model of the light CAD tool: flat 2D shapes in millimetres, y pointing UP (like DXF).
 * Everything here is plain data and maths, so it can be tested without a screen.
 */
export interface Pt {
  x: number;
  y: number;
}
export type Entity =
  | { id: string; type: 'line'; a: Pt; b: Pt }
  | { id: string; type: 'rect'; a: Pt; b: Pt }
  | { id: string; type: 'circle'; c: Pt; r: number }
  | { id: string; type: 'poly'; pts: Pt[]; closed: boolean }
  | { id: string; type: 'text'; p: Pt; h: number; s: string };

export type EntityKind = Entity['type'];

let counter = 0;
export const newId = () => `e${Date.now().toString(36)}${(counter++).toString(36)}`;

export const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

export function snap(p: Pt, grid: number): Pt {
  if (!(grid > 0)) return p;
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
}

/** Shift held: the point is moved onto the horizontal or the vertical line through `from`. */
export function ortho(from: Pt, p: Pt): Pt {
  return Math.abs(p.x - from.x) >= Math.abs(p.y - from.y) ? { x: p.x, y: from.y } : { x: from.x, y: p.y };
}

/** Pulls `p` to the nearest corner, end or centre of a shape when one is closer than `tol` (in mm). */
export function snapToShapes(p: Pt, list: Entity[], tol: number): Pt | null {
  let best: Pt | null = null;
  let bd = tol;
  for (const q of keyPoints(list)) {
    const d = dist(p, q);
    if (d <= bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

export function keyPoints(list: Entity[]): Pt[] {
  const out: Pt[] = [];
  for (const e of list) {
    if (e.type === 'line') out.push(e.a, e.b, mid(e.a, e.b));
    else if (e.type === 'rect') out.push(...rectCorners(e), mid(e.a, e.b));
    else if (e.type === 'circle') out.push(e.c, { x: e.c.x + e.r, y: e.c.y }, { x: e.c.x - e.r, y: e.c.y }, { x: e.c.x, y: e.c.y + e.r }, { x: e.c.x, y: e.c.y - e.r });
    else if (e.type === 'poly') out.push(...e.pts);
    else out.push(e.p);
  }
  return out;
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const rectCorners = (e: { a: Pt; b: Pt }): Pt[] => [
  { x: e.a.x, y: e.a.y },
  { x: e.b.x, y: e.a.y },
  { x: e.b.x, y: e.b.y },
  { x: e.a.x, y: e.b.y },
];

/** The outline of a shape as a list of points (a circle becomes 64 segments), used for drawing, hit tests and export. */
export function outline(e: Entity): { pts: Pt[]; closed: boolean } {
  switch (e.type) {
    case 'line':
      return { pts: [e.a, e.b], closed: false };
    case 'rect':
      return { pts: rectCorners(e), closed: true };
    case 'poly':
      return { pts: e.pts, closed: e.closed };
    case 'circle':
      return { pts: Array.from({ length: 64 }, (_, i) => ({ x: e.c.x + e.r * Math.cos((i / 64) * Math.PI * 2), y: e.c.y + e.r * Math.sin((i / 64) * Math.PI * 2) })), closed: true };
    case 'text':
      return { pts: [e.p], closed: false };
  }
}

/** Text width is a guess (the screen measures it exactly); this is enough for boxes and export sizes. */
export const textWidth = (e: { h: number; s: string }) => e.s.length * e.h * 0.6;

export function bounds(list: Entity[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (p: Pt) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  };
  for (const e of list) {
    for (const p of outline(e).pts) add(p);
    if (e.type === 'text') add({ x: e.p.x + textWidth(e), y: e.p.y + e.h });
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** True when `p` is within `tol` of the shape's line (text: inside its box). */
export function hit(e: Entity, p: Pt, tol: number): boolean {
  if (e.type === 'text') return p.x >= e.p.x - tol && p.x <= e.p.x + textWidth(e) + tol && p.y >= e.p.y - tol && p.y <= e.p.y + e.h + tol;
  if (e.type === 'circle') return Math.abs(dist(p, e.c) - e.r) <= tol;
  const { pts, closed } = outline(e);
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) if (segDist(p, pts[i], pts[(i + 1) % pts.length]) <= tol) return true;
  return false;
}

export function move(e: Entity, dx: number, dy: number): Entity {
  const m = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });
  switch (e.type) {
    case 'line':
    case 'rect':
      return { ...e, a: m(e.a), b: m(e.b) };
    case 'circle':
      return { ...e, c: m(e.c) };
    case 'poly':
      return { ...e, pts: e.pts.map(m) };
    case 'text':
      return { ...e, p: m(e.p) };
  }
}

export interface Measure {
  length?: number; // line length, or the perimeter of a closed shape / circle circumference
  area?: number;
  width?: number;
  height?: number;
  radius?: number;
}

export function measure(e: Entity): Measure {
  if (e.type === 'circle') return { length: 2 * Math.PI * e.r, area: Math.PI * e.r * e.r, radius: e.r };
  if (e.type === 'text') return {};
  const { pts, closed } = outline(e);
  let length = 0;
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) length += dist(pts[i], pts[(i + 1) % pts.length]);
  const m: Measure = { length };
  if (closed && pts.length >= 3) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    m.area = Math.abs(a) / 2;
  }
  if (e.type === 'rect') {
    m.width = Math.abs(e.b.x - e.a.x);
    m.height = Math.abs(e.b.y - e.a.y);
  }
  return m;
}

/* ---------------------------------------------------------------- SVG */

const num = (n: number) => String(Math.round(n * 1000) / 1000);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toSvg(list: Entity[], ink = '#111111'): string {
  const b = bounds(list) ?? { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const pad = Math.max(5, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.03);
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxY - b.minY + pad * 2;
  const X = (x: number) => num(x - b.minX + pad);
  const Y = (y: number) => num(b.maxY - y + pad); // y points up in the model, down in SVG
  const sw = num(Math.max(w, h) / 600);
  const parts = list.map((e) => {
    switch (e.type) {
      case 'line':
        return `<line x1="${X(e.a.x)}" y1="${Y(e.a.y)}" x2="${X(e.b.x)}" y2="${Y(e.b.y)}"/>`;
      case 'rect':
        return `<rect x="${X(Math.min(e.a.x, e.b.x))}" y="${Y(Math.max(e.a.y, e.b.y))}" width="${num(Math.abs(e.b.x - e.a.x))}" height="${num(Math.abs(e.b.y - e.a.y))}"/>`;
      case 'circle':
        return `<circle cx="${X(e.c.x)}" cy="${Y(e.c.y)}" r="${num(e.r)}"/>`;
      case 'poly':
        return `<${e.closed ? 'polygon' : 'polyline'} points="${e.pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}"/>`;
      case 'text':
        return `<text x="${X(e.p.x)}" y="${Y(e.p.y)}" font-size="${num(e.h)}" fill="${ink}" stroke="none" font-family="sans-serif">${esc(e.s)}</text>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(w)} ${num(h)}" width="${num(w)}mm" height="${num(h)}mm">\n<g fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">\n${parts.join('\n')}\n</g>\n</svg>\n`;
}

/* ---------------------------------------------------------------- DXF (R12, ASCII: opens in every CAD program) */

const dxfText = (s: string) => Array.from(s).map((ch) => (ch.charCodeAt(0) > 126 ? `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}` : ch)).join('');
const undxfText = (s: string) => s.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

export function toDxf(list: Entity[]): string {
  const g: string[] = [];
  const put = (code: number, v: string | number) => g.push(String(code), String(typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
  put(0, 'SECTION'); put(2, 'HEADER'); put(9, '$ACADVER'); put(1, 'AC1009'); put(9, '$INSUNITS'); put(70, 4); put(0, 'ENDSEC');
  put(0, 'SECTION'); put(2, 'TABLES'); put(0, 'TABLE'); put(2, 'LAYER'); put(70, 1);
  put(0, 'LAYER'); put(2, '0'); put(70, 0); put(62, 7); put(6, 'CONTINUOUS'); put(0, 'ENDTAB'); put(0, 'ENDSEC');
  put(0, 'SECTION'); put(2, 'ENTITIES');
  const polyline = (pts: Pt[], closed: boolean) => {
    put(0, 'POLYLINE'); put(8, '0'); put(66, 1); put(70, closed ? 1 : 0);
    for (const p of pts) { put(0, 'VERTEX'); put(8, '0'); put(10, p.x); put(20, p.y); put(30, 0); }
    put(0, 'SEQEND'); put(8, '0');
  };
  for (const e of list) {
    if (e.type === 'line') { put(0, 'LINE'); put(8, '0'); put(10, e.a.x); put(20, e.a.y); put(30, 0); put(11, e.b.x); put(21, e.b.y); put(31, 0); }
    else if (e.type === 'circle') { put(0, 'CIRCLE'); put(8, '0'); put(10, e.c.x); put(20, e.c.y); put(30, 0); put(40, e.r); }
    else if (e.type === 'rect') polyline(rectCorners(e), true);
    else if (e.type === 'poly') polyline(e.pts, e.closed);
    else { put(0, 'TEXT'); put(8, '0'); put(10, e.p.x); put(20, e.p.y); put(30, 0); put(40, e.h); put(1, dxfText(e.s)); }
  }
  put(0, 'ENDSEC'); put(0, 'EOF');
  return g.join('\r\n') + '\r\n';
}

export interface DxfResult {
  entities: Entity[];
  skipped: number; // shapes of kinds this light tool does not draw (dimensions, hatches, blocks...)
}

export function fromDxf(text: string): DxfResult {
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const c = parseInt(lines[i].trim(), 10);
    if (!Number.isNaN(c)) pairs.push([c, lines[i + 1].trim()]);
  }
  const entities: Entity[] = [];
  let skipped = 0;
  let inEntities = false;
  let i = 0;
  const f = (v: string | undefined) => (v === undefined ? 0 : parseFloat(v) || 0);
  /** reads the group codes of one entity (until the next code 0) */
  const read = (): { type: string; g: [number, string][] } => {
    const type = pairs[i][1];
    i++;
    const g: [number, string][] = [];
    while (i < pairs.length && pairs[i][0] !== 0) g.push(pairs[i++]);
    return { type, g };
  };
  const first = (g: [number, string][], code: number) => g.find((p) => p[0] === code)?.[1];
  while (i < pairs.length) {
    const [code, val] = pairs[i];
    if (code === 0 && val === 'SECTION' && pairs[i + 1]?.[1] === 'ENTITIES') { inEntities = true; i += 2; continue; }
    if (code === 0 && val === 'ENDSEC') { inEntities = false; i++; continue; }
    if (!inEntities || code !== 0) { i++; continue; }
    const { type, g } = read();
    if (type === 'LINE') entities.push({ id: newId(), type: 'line', a: { x: f(first(g, 10)), y: f(first(g, 20)) }, b: { x: f(first(g, 11)), y: f(first(g, 21)) } });
    else if (type === 'CIRCLE') entities.push({ id: newId(), type: 'circle', c: { x: f(first(g, 10)), y: f(first(g, 20)) }, r: f(first(g, 40)) });
    else if (type === 'ARC') {
      const c = { x: f(first(g, 10)), y: f(first(g, 20)) }, r = f(first(g, 40));
      let a0 = (f(first(g, 50)) * Math.PI) / 180, a1 = (f(first(g, 51)) * Math.PI) / 180;
      if (a1 <= a0) a1 += Math.PI * 2;
      const n = Math.max(8, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 64));
      entities.push({ id: newId(), type: 'poly', closed: false, pts: Array.from({ length: n + 1 }, (_, k) => ({ x: c.x + r * Math.cos(a0 + ((a1 - a0) * k) / n), y: c.y + r * Math.sin(a0 + ((a1 - a0) * k) / n) })) });
    } else if (type === 'LWPOLYLINE') {
      const pts: Pt[] = [];
      let cur: Partial<Pt> = {};
      for (const [c, v] of g) {
        if (c === 10) { if (cur.x !== undefined && cur.y !== undefined) pts.push(cur as Pt); cur = { x: f(v) }; }
        else if (c === 20) cur.y = f(v);
      }
      if (cur.x !== undefined && cur.y !== undefined) pts.push(cur as Pt);
      if (pts.length >= 2) entities.push({ id: newId(), type: 'poly', pts, closed: (parseInt(first(g, 70) ?? '0', 10) & 1) === 1 });
    } else if (type === 'POLYLINE') {
      const closed = (parseInt(first(g, 70) ?? '0', 10) & 1) === 1;
      const pts: Pt[] = [];
      while (i < pairs.length && pairs[i][1] === 'VERTEX') {
        const v = read();
        pts.push({ x: f(first(v.g, 10)), y: f(first(v.g, 20)) });
      }
      if (i < pairs.length && pairs[i][1] === 'SEQEND') read();
      if (pts.length >= 2) entities.push({ id: newId(), type: 'poly', pts, closed });
    } else if (type === 'TEXT' || type === 'MTEXT') {
      const s = undxfText(g.filter((p) => p[0] === 3 || p[0] === 1).map((p) => p[1]).join('')).replace(/\\P/g, ' ').replace(/\{?\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '');
      if (s) entities.push({ id: newId(), type: 'text', p: { x: f(first(g, 10)), y: f(first(g, 20)) }, h: f(first(g, 40)) || 2.5, s });
    } else if (type !== 'SEQEND' && type !== 'VERTEX') skipped++;
  }
  return { entities, skipped };
}

export const fmt = (n: number, digits = 2) => (Math.round(n * 10 ** digits) / 10 ** digits).toString();
