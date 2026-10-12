import { canvasToBytes, decodeImage } from '../pdf';
import { decodeFile } from '../img';
import { isHeic } from '../heic';
import { fitWithin, resizeCanvas } from './imgops';
import type { CreateImage } from './create';

/** JPEG and PNG go in as they are; any other format the browser can read is converted to PNG. */
export async function toCreateImage(file: File, fromCamera = false): Promise<CreateImage> {
  if (fromCamera) {
    // a phone photo stores "turned sideways" in a tag the PDF would ignore: draw it upright, and keep it to a sensible size
    const full = await decodeFile(file);
    const s = fitWithin(full.width, full.height, 2400, 2400);
    const canvas = s.width < full.width ? resizeCanvas(full, s.width, s.height) : full;
    return { bytes: await canvasToBytes(canvas, 'image/jpeg', 0.85), mime: 'image/jpeg' };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)) return { bytes, mime: 'image/jpeg' };
  if (file.type === 'image/png' || /\.png$/i.test(file.name)) return { bytes, mime: 'image/png' };
  const canvas = await (isHeic(file) ? decodeFile(file) : decodeImage(bytes));
  return { bytes: await canvasToBytes(canvas, 'image/png'), mime: 'image/png' };
}

