import { createCanvas, type CanvasLike } from '../pdf';

/**
 * Picture operations on canvases. Everything works on pixels we handle ourselves (no canvas filters), so the
 * result is the same in every browser and in the tests.
 */

const ctx = (c: CanvasLike) => c.getContext('2d');

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cloneCanvas(src: CanvasLike): CanvasLike {
  const out = createCanvas(src.width, src.height);
  ctx(out).drawImage(src, 0, 0);
  return out;
}

/** Fills the canvas with a colour (JPEG has no transparency, so transparent pixels become this). */
export function flatten(src: CanvasLike, color = '#ffffff'): CanvasLike {
  const out = createCanvas(src.width, src.height);
  const c = ctx(out);
  c.fillStyle = color;
  c.fillRect(0, 0, out.width, out.height);
  c.drawImage(src, 0, 0);
  return out;
}

/** Resizes with smoothing; large reductions go in halves so thin lines and text stay clean. */
export function resizeCanvas(src: CanvasLike, width: number, height: number): CanvasLike {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  let cur = src;
  while (cur.width / 2 >= w && cur.height / 2 >= h) {
    const half = createCanvas(Math.ceil(cur.width / 2), Math.ceil(cur.height / 2));
    const c = ctx(half);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  const out = createCanvas(w, h);
  const c = ctx(out);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(cur, 0, 0, w, h);
  return out;
}

/** Largest size that fits inside the limits and keeps the shape; never enlarges. */
export function fitWithin(w: number, h: number, maxW: number, maxH: number): { width: number; height: number } {
  const k = Math.min(1, maxW > 0 ? maxW / w : 1, maxH > 0 ? maxH / h : 1);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

export function cropCanvas(src: CanvasLike, box: Box): CanvasLike {
  const x = Math.max(0, Math.min(src.width - 1, Math.round(box.x)));
  const y = Math.max(0, Math.min(src.height - 1, Math.round(box.y)));
  const w = Math.max(1, Math.min(src.width - x, Math.round(box.width)));
  const h = Math.max(1, Math.min(src.height - y, Math.round(box.height)));
  const out = createCanvas(w, h);
  ctx(out).drawImage(src, x, y, w, h, 0, 0, w, h);
  return out;
}

/** Clockwise degrees (multiples of 90), then optional mirroring. */
export function rotateCanvas(src: CanvasLike, degrees: number, flipH = false, flipV = false): CanvasLike {
  const d = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
  const swap = d === 90 || d === 270;
  const out = createCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
  const c = ctx(out);
  c.translate(out.width / 2, out.height / 2);
  c.rotate((d * Math.PI) / 180);
  c.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  c.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

export interface Adjust {
  /** -100 .. 100 */
  brightness: number;
  contrast: number;
  saturation: number;
  /** 0 .. 100 */
  grayscale: number;
  sepia: number;
  /** blur radius as a percent of the picture's width, 0 .. 5 */
  blur: number;
  invert?: boolean;
}

export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, grayscale: 0, sepia: 0, blur: 0 };

const clamp8 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

export function adjustCanvas(src: CanvasLike, a: Adjust): CanvasLike {
  const out = cloneCanvas(src);
  if (a.blur > 0) blurRegion(out, { x: 0, y: 0, width: out.width, height: out.height }, Math.round((a.blur / 100) * out.width));
  const c = ctx(out);
  const img = c.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const br = (a.brightness / 100) * 255;
  const ct = 1 + a.contrast / 100;
  const sat = 1 + a.saturation / 100;
  const gray = a.grayscale / 100;
  const sep = a.sepia / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] + br;
    let g = d[i + 1] + br;
    let b = d[i + 2] + br;
    r = (r - 128) * ct + 128;
    g = (g - 128) * ct + 128;
    b = (b - 128) * ct + 128;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * sat;
    g = l + (g - l) * sat;
    b = l + (b - l) * sat;
    if (gray > 0) {
      const l2 = 0.299 * r + 0.587 * g + 0.114 * b;
      r += (l2 - r) * gray;
      g += (l2 - g) * gray;
      b += (l2 - b) * gray;
    }
    if (sep > 0) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r += (sr - r) * sep;
      g += (sg - g) * sep;
      b += (sb - b) * sep;
    }
    if (a.invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }
    d[i] = clamp8(r);
    d[i + 1] = clamp8(g);
    d[i + 2] = clamp8(b);
  }
  c.putImageData(img, 0, 0);
  return out;
}

function clampBox(canvas: CanvasLike, box: Box): Box {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  return { x, y, width: Math.max(0, Math.min(canvas.width - x, Math.ceil(box.width))), height: Math.max(0, Math.min(canvas.height - y, Math.ceil(box.height))) };
}

/** Box blur (three passes, close to a Gaussian) of one area, in place. */
export function blurRegion(canvas: CanvasLike, region: Box, radius: number): void {
  const b = clampBox(canvas, region);
  const r = Math.round(radius);
  if (b.width < 1 || b.height < 1 || r < 1) return;
  const c = ctx(canvas);
  const img = c.getImageData(b.x, b.y, b.width, b.height);
  const { width: w, height: h, data } = img;
  const tmp = new Uint8ClampedArray(data.length);
  const pass = (from: Uint8ClampedArray, to: Uint8ClampedArray, horizontal: boolean) => {
    const len = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const step = horizontal ? 4 : w * 4;
    const lineStep = horizontal ? w * 4 : 4;
    const rad = Math.min(r, len - 1);
    for (let line = 0; line < lines; line++) {
      const base = line * lineStep;
      for (let ch = 0; ch < 4; ch++) {
        let sum = 0;
        for (let k = -rad; k <= rad; k++) sum += from[base + Math.min(len - 1, Math.max(0, k)) * step + ch];
        for (let i = 0; i < len; i++) {
          to[base + i * step + ch] = sum / (2 * rad + 1);
          const out = Math.min(len - 1, Math.max(0, i - rad));
          const inn = Math.min(len - 1, Math.max(0, i + rad + 1));
          sum += from[base + inn * step + ch] - from[base + out * step + ch];
        }
      }
    }
  };
  for (let n = 0; n < 3; n++) {
    pass(data, tmp, true);
    pass(tmp, data, false);
  }
  c.putImageData(img, b.x, b.y);
}

/** Turns an area into coarse squares, so what was there can no longer be read. */
export function pixelateRegion(canvas: CanvasLike, region: Box, block: number): void {
  const b = clampBox(canvas, region);
  const s = Math.max(2, Math.round(block));
  if (b.width < 1 || b.height < 1) return;
  const c = ctx(canvas);
  const img = c.getImageData(b.x, b.y, b.width, b.height);
  const d = img.data;
  for (let y0 = 0; y0 < b.height; y0 += s) {
    for (let x0 = 0; x0 < b.width; x0 += s) {
      let r = 0, g = 0, bl = 0, a = 0, n = 0;
      const y1 = Math.min(b.height, y0 + s);
      const x1 = Math.min(b.width, x0 + s);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * b.width + x) * 4; r += d[i]; g += d[i + 1]; bl += d[i + 2]; a += d[i + 3]; n++; }
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * b.width + x) * 4; d[i] = r / n; d[i + 1] = g / n; d[i + 2] = bl / n; d[i + 3] = a / n; }
    }
  }
  c.putImageData(img, b.x, b.y);
}

export function blackoutRegion(canvas: CanvasLike, region: Box): void {
  const b = clampBox(canvas, region);
  const c = ctx(canvas);
  c.fillStyle = '#000000';
  c.fillRect(b.x, b.y, b.width, b.height);
}

/** Pixels close to `color` become see-through; `tolerance` 0..100, `feather` softens the edge. */
export function makeTransparent(src: CanvasLike, color: [number, number, number], tolerance: number, feather = 8): CanvasLike {
  const out = cloneCanvas(src);
  const c = ctx(out);
  const img = c.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const max = (tolerance / 100) * 441.67; // distance from black to white
  const soft = Math.max(0, (feather / 100) * 441.67);
  for (let i = 0; i < d.length; i += 4) {
    const dist = Math.hypot(d[i] - color[0], d[i + 1] - color[1], d[i + 2] - color[2]);
    if (dist <= max) d[i + 3] = 0;
    else if (soft > 0 && dist < max + soft) d[i + 3] = Math.round(d[i + 3] * ((dist - max) / soft));
  }
  c.putImageData(img, 0, 0);
  return out;
}

export function pixelAt(src: CanvasLike, x: number, y: number): [number, number, number, number] {
  const p = ctx(src).getImageData(Math.max(0, Math.min(src.width - 1, Math.floor(x))), Math.max(0, Math.min(src.height - 1, Math.floor(y))), 1, 1).data;
  return [p[0], p[1], p[2], p[3]];
}

export type Place = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'tile';

export interface Watermark {
  text?: string;
  image?: CanvasLike;
  /** width of the mark as a percent of the picture's width */
  size: number;
  opacity: number;
  /** degrees, counter-clockwise */
  rotation: number;
  place: Place;
  color?: string;
}

export function watermarkCanvas(src: CanvasLike, wm: Watermark): CanvasLike {
  const out = cloneCanvas(src);
  const c = ctx(out);
  const margin = out.width * 0.03;
  let mw: number;
  let mh: number;
  let paint: (cx: CanvasRenderingContext2D) => void;
  if (wm.image) {
    mw = (out.width * wm.size) / 100;
    mh = (wm.image.height / wm.image.width) * mw;
    paint = (cx) => cx.drawImage(wm.image as unknown as CanvasImageSource, -mw / 2, -mh / 2, mw, mh);
  } else {
    const text = wm.text ?? '';
    if (!text.trim()) return out;
    const target = (out.width * wm.size) / 100;
    c.font = '700 100px "IBM Plex Sans Arabic", Inter, sans-serif';
    const measured = c.measureText(text).width || 100;
    const px = (100 * target) / measured;
    mw = target;
    mh = px * 1.2;
    paint = (cx) => {
      cx.font = `700 ${px}px "IBM Plex Sans Arabic", Inter, sans-serif`;
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.fillStyle = wm.color ?? '#ffffff';
      cx.strokeStyle = 'rgba(0,0,0,0.35)';
      cx.lineWidth = Math.max(1, px / 18);
      cx.strokeText(text, 0, 0);
      cx.fillText(text, 0, 0);
    };
  }
  const drawAt = (cx0: number, cy0: number) => {
    c.save();
    c.globalAlpha = wm.opacity;
    c.translate(cx0, cy0);
    c.rotate((-wm.rotation * Math.PI) / 180);
    paint(c as unknown as CanvasRenderingContext2D);
    c.restore();
  };
  if (wm.place === 'tile') {
    const gx = mw * 1.7;
    const gy = mh * 3;
    let row = 0;
    for (let y = gy / 2; y < out.height + gy; y += gy, row++) for (let x = gx / 2 + (row % 2 ? gx / 2 : 0); x < out.width + gx; x += gx) drawAt(x, y);
    return out;
  }
  const cx = wm.place.endsWith('left') ? margin + mw / 2 : wm.place.endsWith('right') ? out.width - margin - mw / 2 : out.width / 2;
  const cy = wm.place.startsWith('top') ? margin + mh / 2 : wm.place.startsWith('bottom') ? out.height - margin - mh / 2 : out.height / 2;
  drawAt(cx, cy);
  return out;
}

/** Fills the exact size by cropping the overflow (cover), or fits the whole picture with bars (contain). */
export function fitToSize(src: CanvasLike, width: number, height: number, mode: 'cover' | 'contain', background = '#ffffff'): CanvasLike {
  const out = createCanvas(width, height);
  const c = ctx(out);
  c.fillStyle = background;
  c.fillRect(0, 0, width, height);
  const k = mode === 'cover' ? Math.max(width / src.width, height / src.height) : Math.min(width / src.width, height / src.height);
  const w = src.width * k;
  const h = src.height * k;
  const scaled = resizeCanvas(src, w, h);
  c.drawImage(scaled, (width - w) / 2, (height - h) / 2);
  return out;
}

export interface Meme {
  top: string;
  bottom: string;
  /** percent of the picture's height */
  size: number;
  color: string;
}

export function memeCanvas(src: CanvasLike, m: Meme): CanvasLike {
  const out = cloneCanvas(src);
  const c = ctx(out);
  const px = (out.height * m.size) / 100;
  c.font = `800 ${px}px "IBM Plex Sans Arabic", Inter, Impact, sans-serif`;
  c.textAlign = 'center';
  c.fillStyle = m.color;
  c.strokeStyle = '#000000';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(2, px / 7);
  const maxW = out.width * 0.94;
  const lines = (text: string): string[] => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const rows: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && c.measureText(next).width > maxW) {
        rows.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) rows.push(cur);
    return rows;
  };
  const draw = (rows: string[], y0: number) => {
    c.textBaseline = 'top';
    rows.forEach((row, i) => {
      const y = y0 + i * px * 1.1;
      c.strokeText(row, out.width / 2, y, maxW);
      c.fillText(row, out.width / 2, y, maxW);
    });
  };
  const top = lines(m.top);
  const bottom = lines(m.bottom);
  draw(top, out.height * 0.03);
  draw(bottom, out.height * 0.97 - bottom.length * px * 1.1);
  return out;
}
