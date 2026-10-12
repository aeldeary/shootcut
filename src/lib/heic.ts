import { createCanvas, type CanvasLike } from './pdf';

/** iPhone photos (HEIC/HEIF). Browsers other than Safari cannot open them, so a small decoder (libheif, LGPL-3.0) is loaded when one is picked. */
export function isHeic(file: { name: string; type: string }): boolean {
  return /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]/i.test(file.type);
}

interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (result: unknown) => void): void;
}
interface HeifLib {
  HeifDecoder: new () => { decode(bytes: Uint8Array): HeifImage[] };
}

let lib: Promise<HeifLib> | null = null;
const load = (): Promise<HeifLib> => (lib ??= import('libheif-js/wasm-bundle').then((m) => ((m as { default?: HeifLib }).default ?? (m as unknown as HeifLib))));

/** Decodes the first picture of a HEIC file. */
export async function decodeHeic(bytes: Uint8Array): Promise<CanvasLike> {
  const { HeifDecoder } = await load();
  const images = new HeifDecoder().decode(bytes);
  if (!images || images.length === 0) throw new Error('empty HEIC');
  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  const canvas = createCanvas(width, height);
  const ctx = (canvas as unknown as { getContext(t: '2d'): CanvasRenderingContext2D }).getContext('2d');
  const data = ctx.createImageData(width, height);
  const ok = await new Promise<boolean>((resolve) => {
    image.display({ data: data.data, width, height }, (result) => resolve(result !== null && result !== undefined));
  });
  if (!ok) throw new Error('HEIC could not be drawn');
  ctx.putImageData(data, 0, 0);
  return canvas;
}
