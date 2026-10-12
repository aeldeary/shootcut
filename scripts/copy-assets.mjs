// Copies runtime assets from node_modules into public/ so the app can serve them itself
// (no CDN, no third-party requests): pdf.js fonts/cmaps and the Tesseract OCR engine + Arabic/English data.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);
const out = (p) => join(root, 'public', p);

function copy(from, to) {
  if (!existsSync(from)) {
    console.error(`copy-assets: missing ${from}. Did you run "npm install"?`);
    process.exit(1);
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

rmSync(out('pdfjs'), { recursive: true, force: true });
rmSync(out('ocr'), { recursive: true, force: true });
rmSync(out('ffmpeg'), { recursive: true, force: true });

// pdf.js: fonts for PDFs that don't embed the standard 14, and character maps
copy(nm('pdfjs-dist/standard_fonts'), out('pdfjs/standard_fonts'));
copy(nm('pdfjs-dist/cmaps'), out('pdfjs/cmaps'));

// Tesseract.js: worker, WebAssembly core (LSTM builds only; the browser picks the fastest it supports)
copy(nm('tesseract.js/dist/worker.min.js'), out('ocr/worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  copy(nm(`tesseract.js-core/${f}`), out(`ocr/core/${f}`));
}

// Language data (the "best" integer models, gzip-compressed)
copy(nm('@tesseract.js-data/ara/4.0.0_best_int/ara.traineddata.gz'), out('ocr/lang/ara.traineddata.gz'));
copy(nm('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), out('ocr/lang/eng.traineddata.gz'));

// FFmpeg (WebAssembly) for the video tools; the app stores it in the browser after the first download
copy(nm('@ffmpeg/core/dist/esm/ffmpeg-core.js'), out('ffmpeg/ffmpeg-core.js'));
copy(nm('@ffmpeg/core/dist/esm/ffmpeg-core.wasm'), out('ffmpeg/ffmpeg-core.wasm'));

console.log('copy-assets: done');
