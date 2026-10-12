import { createWorker, type Worker } from 'tesseract.js';
import { PDFDocument, TextRenderingMode, popGraphicsState, pushGraphicsState, setTextRenderingMode } from 'pdf-lib';
import { embedFonts } from '../fonts';
import { canvasToBytes, createCanvas, type CanvasLike, type PdfPreview } from '../pdf';
import { drawLine, hasArabic, measureLine } from '../text';
import { viewAngleToUser } from './geometry';
import type { Rect } from './textselect';

export type OcrLang = 'ara' | 'eng';

export interface OcrPaths {
  /** directory with ara.traineddata.gz / eng.traineddata.gz */
  lang: string;
  /** directory with the tesseract-core*.wasm.js files */
  core: string;
  /** the tesseract worker script; omit in Node */
  worker?: string;
}

/** Where the OCR engine's files are served from: this site, never a CDN. */
export function browserOcrPaths(): OcrPaths {
  const base = new URL(`${import.meta.env.BASE_URL}ocr/`, document.baseURI).href;
  return { lang: `${base}lang`, core: `${base}core`, worker: `${base}worker.min.js` };
}

export interface OcrWord {
  text: string;
  /** pixels in the image that was recognized, origin top-left */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  confidence: number;
  /** words of one printed line share an id */
  line: string;
}

/** 'document': columns of running text (page segmentation 3). 'sparse': scattered text over pictures (11). */
export type OcrLayout = 'document' | 'sparse';

export interface OcrEngine {
  recognize: (image: Uint8Array, layout?: OcrLayout) => Promise<{ text: string; words: OcrWord[] }>;
  terminate: () => Promise<void>;
}

const DIRECTION_MARKS = /[\u200e\u200f\u202a-\u202e]/g;

export async function createOcrEngine(langs: OcrLang[], paths: OcrPaths, onProgress?: (fraction: number) => void): Promise<OcrEngine> {
  const worker: Worker = await createWorker(langs, 1, {
    langPath: paths.lang,
    corePath: paths.core,
    ...(paths.worker ? { workerPath: paths.worker } : {}),
    cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  const inBrowser = typeof document !== 'undefined';
  return {
    async recognize(image, layout = 'document') {
      await worker.setParameters({ tessedit_pageseg_mode: (layout === 'sparse' ? '11' : '3') as never });
      const input = inBrowser ? new Blob([image as unknown as BlobPart], { type: 'image/png' }) : (image as unknown as Buffer);
      const { data } = await worker.recognize(input as never, {}, { blocks: true, text: true });
      const words: OcrWord[] = [];
      let lineNo = 0;
      for (const block of data.blocks ?? []) {
        for (const para of block.paragraphs) {
          for (const line of para.lines) {
            lineNo += 1;
            for (const w of line.words) {
              const text = w.text.replace(DIRECTION_MARKS, '').trim();
              if (text) words.push({ text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, confidence: w.confidence, line: String(lineNo) });
            }
          }
        }
      }
      return { text: data.text ?? '', words };
    },
    terminate: async () => {
      await worker.terminate();
    },
  };
}

/** A recognized word placed in PDF user space. */
export interface PlacedWord {
  text: string;
  /** left (or right, for Arabic) end of the baseline */
  ax: number;
  ay: number;
  width: number;
  height: number;
  rtl: boolean;
}

export interface OcrPageResult {
  page: number;
  text: string;
  words: PlacedWord[];
  /** the page was read as a poster or photo: only clearly legible text is kept, and big decorative titles may be missing */
  poster?: boolean;
}

export interface RecognizeOptions {
  pages: number[];
  /** render resolution; 300 suits normal print, 200 is faster */
  dpi?: number;
  /** what kind of page this is; 'auto' tries a document read first and switches for posters and photos */
  content?: 'auto' | 'document' | 'poster';
  /** read only this part of one page (PDF points), enlarged so small print is legible; poster filters do not apply */
  region?: { page: number; rect: Rect };
  /** ignore words the engine is unsure about (0-100) */
  minConfidence?: number;
  onPage?: (done: number, total: number) => void;
}

/** Longest side, in pixels, that is worth recognizing. Beyond this the engine only reads noise in photos. */
export const MAX_OCR_SIDE = 3300;

/** A word worth keeping: confident enough and not just stray marks. */
export function isUsableWord(w: OcrWord, minConfidence: number): boolean {
  if (w.confidence < minConfidence) return false;
  const letters = w.text.match(/[\p{L}]/gu)?.length ?? 0;
  const digits = w.text.match(/\p{N}/gu)?.length ?? 0;
  if (letters + digits === 0) return w.text.length <= 2 && /^[|:/.,\-–—]+$/.test(w.text) && w.confidence >= 90;
  // short tokens are what photo grain turns into, so they must be clearly recognized
  const len = w.text.replace(/[^\p{L}\p{N}]/gu, '').length;
  if (len === 2 && w.confidence < 82) return false;
  if (len === 3 && letters === 3 && w.confidence < 72) return false;
  // a lone letter is almost always a speck on a photo
  if (letters + digits === 1 && w.text.length === 1) return w.confidence >= 90;
  if (letters === 1 && w.text.length > 1 && w.confidence < 85) return false;
  return true;
}

/**
 * For posters and photos: precision over recall. Grain, textures and decorative shapes are read as short,
 * plausible-looking words, so only clearly recognized, reasonably long tokens are trusted.
 */
export function isReliablePosterWord(w: OcrWord, minConfidence: number): boolean {
  if (w.confidence < minConfidence) return false;
  const alnum = w.text.replace(/[^\p{L}\p{N}]/gu, '');
  const digits = alnum.match(/\p{N}/gu)?.length ?? 0;
  if (alnum.length === 0) return false;
  if (digits === alnum.length) return alnum.length >= 2 ? w.confidence >= 90 : w.confidence >= 96;
  if (alnum.length === 1) return false;
  if (alnum.length === 2) return hasArabic(w.text) && w.confidence >= 88;
  if (alnum.length === 3) return w.confidence >= 80;
  return true;
}

const countLetters = (ws: OcrWord[]) => ws.reduce((n, w) => n + (w.text.match(/\p{L}|\p{N}/gu)?.length ?? 0), 0);

/**
 * Builds the page text from the kept words: words that sit on the same horizontal band form a line, lines run
 * top to bottom, and each line reads right to left when most of its words are Arabic.
 */
export function groupWordLines(words: OcrWord[]): OcrWord[][] {
  const centre = (w: OcrWord) => (w.y0 + w.y1) / 2;
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const lines: OcrWord[][] = [];
  for (const w of [...words].sort((a, b) => centre(a) - centre(b))) {
    // same line when the word's centre is within half a line-height of the line's typical centre
    const line = lines.find((l) => Math.abs(centre(w) - median(l.map(centre))) < median(l.map((x) => x.y1 - x.y0)) * 0.5);
    if (line) line.push(w);
    else lines.push([w]);
  }
  return lines.sort((a, b) => Math.min(...a.map((w) => w.y0)) - Math.min(...b.map((w) => w.y0)));
}

/** A printed line worth keeping has a real word in it (or a number); a lone short fragment is a speck. */
export function dropOrphanLines(words: OcrWord[]): OcrWord[] {
  return groupWordLines(words)
    .filter((l) =>
      l.some((w) => {
        const alnum = w.text.replace(/[^\p{L}\p{N}]/gu, '');
        return alnum.length >= 4 || (alnum.length >= 2 && /^\p{N}+$/u.test(alnum));
      }),
    )
    .flat();
}

export function wordsToText(words: OcrWord[]): string {
  return groupWordLines(words)
    .map((l) => {
      // numbers and symbols say nothing about direction: count only words that contain letters
      const lettered = l.filter((w) => /\p{L}/u.test(w.text));
      const rtl = lettered.length > 0 && lettered.filter((w) => hasArabic(w.text)).length > lettered.length / 2;
      return [...l].sort((a, b) => (rtl ? b.x0 - a.x0 : a.x0 - b.x0)).map((w) => w.text).join(' ');
    })
    .join('\n');
}

type Ctx2d = { getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray }; putImageData: (d: unknown, x: number, y: number) => void };

/** Black text on white from a picture whose text is light (white titles over a photo). */
async function brightTextMask(canvas: CanvasLike): Promise<Uint8Array> {
  const ctx = canvas.getContext('2d') as Ctx2d;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.min(d[i], d[i + 1], d[i + 2]) > 205 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvasToBytes(canvas, 'image/png');
}

const overlapRatio = (a: OcrWord, b: OcrWord) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
};

/** Of words that cover the same spot (found at different sizes), keeps the one the engine trusts most. */
export function mergeWords(candidates: OcrWord[]): OcrWord[] {
  const kept: OcrWord[] = [];
  for (const w of [...candidates].sort((a, b) => b.confidence - a.confidence)) {
    if (!kept.some((k) => overlapRatio(k, w) > 0.3)) kept.push(w);
  }
  return kept;
}

/**
 * Reading passes for a poster or photo. Small print reads best at full size, but big decorative titles are only
 * recognized when the picture is shrunk, and white titles over a photo need a light-on-dark mask.
 */
const POSTER_PASSES: { side: number; mask: boolean }[] = [
  { side: Infinity, mask: false },
  { side: 1000, mask: false },
  { side: 600, mask: false },
  { side: 1000, mask: true },
];

/** Longest side of a selected region once enlarged, in pixels. */
const REGION_TARGET = 2600;

/** The part of a rendered page that holds `rect`, as its own canvas, plus where it starts in the full render. */
async function cropRegion(preview: PdfPreview, page: number, rect: Rect, scale: number) {
  const vp = await preview.viewport(page, scale);
  const canvas = createCanvas(1, 1);
  await preview.renderToCanvas(page, canvas, scale);
  const [ax, ay] = vp.toView(rect.x, rect.y);
  const [bx, by] = vp.toView(rect.x + rect.width, rect.y + rect.height);
  const left = Math.max(0, Math.floor(Math.min(ax, bx)));
  const top = Math.max(0, Math.floor(Math.min(ay, by)));
  const w = Math.max(1, Math.min(canvas.width - left, Math.ceil(Math.abs(bx - ax))));
  const h = Math.max(1, Math.min(canvas.height - top, Math.ceil(Math.abs(by - ay))));
  const crop = createCanvas(w, h);
  crop.getContext('2d').drawImage(canvas as unknown as CanvasImageSource, left, top, w, h, 0, 0, w, h);
  return { vp, crop, left, top };
}

export async function recognizePages(preview: PdfPreview, engine: OcrEngine, o: RecognizeOptions): Promise<OcrPageResult[]> {
  const minConf = o.minConfidence ?? 60;
  const out: OcrPageResult[] = [];
  for (const [i, page] of o.pages.entries()) {
    if (o.region && o.region.page === page) {
      const r = o.region.rect;
      const size = await preview.pageSize(page);
      // enlarge small regions (but keep the whole-page render within memory)
      const s = Math.max(1, Math.min(REGION_TARGET / Math.max(r.width, r.height, 1), 8000 / Math.max(size.width, size.height), 8));
      const { vp, crop, left, top } = await cropRegion(preview, page, r, s);
      const png = await canvasToBytes(crop, 'image/png');
      // a selected area is usually one block of print: read it as running text and as scattered text, keep the better reading of each word
      const found: OcrWord[] = [];
      for (const layout of ['document', 'sparse'] as OcrLayout[]) {
        found.push(...(await engine.recognize(png, layout)).words.filter((w) => isUsableWord(w, minConf)));
      }
      const words = mergeWords(found).map((w) => ({ ...w, x0: w.x0 + left, x1: w.x1 + left, y0: w.y0 + top, y1: w.y1 + top }));
      const placed: PlacedWord[] = words.map((w) => {
        const rtl = hasArabic(w.text);
        const [ax, ay] = vp.toPdf(rtl ? w.x1 : w.x0, w.y1);
        return { text: w.text, ax, ay, width: (w.x1 - w.x0) / s, height: (w.y1 - w.y0) / s, rtl };
      });
      out.push({ page, text: wordsToText(words), words: placed, poster: false });
      o.onPage?.(i + 1, o.pages.length);
      continue;
    }
    const size = await preview.pageSize(page);
    const longest = Math.max(size.width, size.height);
    // a big poster at "300 dpi" is tens of megapixels of upscaled photo: cap it
    const scale = Math.min((o.dpi ?? 300) / 72, MAX_OCR_SIDE / longest);
    const vp = await preview.viewport(page, scale);

    /** Reads the page at `s` (CSS px per point); word boxes come back in the pixels of the main scale. */
    const read = async (s: number, layout: OcrLayout, mask: boolean, minimum: number, keep = isUsableWord): Promise<OcrWord[]> => {
      const canvas = createCanvas(1, 1);
      await preview.renderToCanvas(page, canvas, s);
      const png = mask ? await brightTextMask(canvas) : await canvasToBytes(canvas, 'image/png');
      const k = scale / s;
      return (await engine.recognize(png, layout)).words
        .filter((w) => keep(w, minimum))
        .map((w) => ({ ...w, x0: w.x0 * k, y0: w.y0 * k, x1: w.x1 * k, y1: w.y1 * k }));
    };

    const content = o.content ?? 'auto';
    let words: OcrWord[] = [];
    let poster = false;
    if (content !== 'poster') words = await read(scale, 'document', false, minConf);
    // posters and photos have scattered text: read it as such, at several sizes, and keep the best reading of each word
    if (content === 'poster' || (content === 'auto' && words.length < 60)) {
      const all: OcrWord[] = [];
      for (const pass of POSTER_PASSES) {
        const s = Math.min(scale, pass.side / longest);
        all.push(...(await read(s, 'sparse', pass.mask, Math.max(minConf, pass.mask ? 80 : 72), isReliablePosterWord)));
      }
      const merged = dropOrphanLines(mergeWords(all));
      if (content === 'poster' || countLetters(merged) > countLetters(words)) {
        words = merged;
        poster = true;
      }
    }

    const placed: PlacedWord[] = [];
    for (const w of words) {
      const rtl = hasArabic(w.text);
      const [ax, ay] = vp.toPdf(rtl ? w.x1 : w.x0, w.y1);
      placed.push({ text: w.text, ax, ay, width: (w.x1 - w.x0) / scale, height: (w.y1 - w.y0) / scale, rtl });
    }
    out.push({ page, text: wordsToText(words), words: placed, poster });
    o.onPage?.(i + 1, o.pages.length);
  }
  return out;
}

/**
 * Adds the recognized words to the pages as invisible text, on top of the original page. The page looks
 * the same, but the text can now be searched, selected and copied.
 */
export async function addTextLayer(bytes: Uint8Array, results: OcrPageResult[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const fonts = await embedFonts(doc);
  for (const r of results) {
    const page = doc.getPage(r.page);
    const angle = viewAngleToUser(page, 0);
    page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
    for (const w of r.words) {
      const natural = measureLine(w.text, fonts, 1);
      const size = Math.min(Math.max(natural > 0 ? w.width / natural : w.height, w.height * 0.4), w.height * 1.2, 200);
      drawLine(page, w.text, { x: w.ax, y: w.ay, size, fonts, rotate: angle, align: w.rtl ? 'right' : 'left', base: w.rtl ? 'rtl' : 'ltr' });
    }
    page.pushOperators(popGraphicsState());
  }
  doc.setProducer('Shootcut (OCR)');
  return doc.save();
}
