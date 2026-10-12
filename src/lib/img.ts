import { baseName, canvasToBytes, decodeImage, type CanvasLike } from './pdf';
import { flatten } from './ops/imgops';

export type OutFormat = 'jpeg' | 'png' | 'webp';
export type FormatChoice = OutFormat | 'keep';

export const MIME: Record<OutFormat, 'image/jpeg' | 'image/png' | 'image/webp'> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const EXT: Record<OutFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

/** The format a file already has, when the browser can write it; anything else (GIF, BMP, SVG, AVIF) becomes PNG. */
export function formatOf(file: { type: string; name: string }): OutFormat {
  if (file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)) return 'jpeg';
  if (file.type === 'image/webp' || /\.webp$/i.test(file.name)) return 'webp';
  return 'png';
}

export async function decodeFile(file: File): Promise<CanvasLike> {
  return decodeImage(new Uint8Array(await file.arrayBuffer()));
}

/** Encodes a canvas; JPEG has no transparency, so see-through areas are filled with white first. */
export async function encodeCanvas(canvas: CanvasLike, format: OutFormat, quality: number): Promise<Uint8Array> {
  const src = format === 'jpeg' ? flatten(canvas) : canvas;
  return canvasToBytes(src, MIME[format], quality);
}

export function outName(file: { name: string }, suffix: string, format: OutFormat): string {
  return `${baseName(file.name) || 'image'}${suffix}.${EXT[format]}`;
}

/** Names must be unique inside a ZIP: a repeated name gets -2, -3 … */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const k = n.toLowerCase();
    const count = (seen.get(k) ?? 0) + 1;
    seen.set(k, count);
    if (count === 1) return n;
    const dot = n.lastIndexOf('.');
    return dot > 0 ? `${n.slice(0, dot)}-${count}${n.slice(dot)}` : `${n}-${count}`;
  });
}

/** Shrinks a decoded picture for a quick preview. */
export function previewSize(w: number, h: number, max = 720): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}
