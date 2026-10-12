# Shootcut

Live: https://aeldeary.github.io/shootcut/

Free **PDF, image and video** tools that run **entirely in your browser**. No server, no uploads, no sign-up.
The home page has three sections: PDF, Images, Video. Interface in Arabic (RTL) and English (LTR).

أدوات مجانية للـ **PDF والصور والفيديو** تعمل **بالكامل داخل المتصفح**. بلا خادم ولا رفع ملفات ولا تسجيل.
تضم الصفحة الرئيسية ثلاثة أقسام: PDF والصور والفيديو. الواجهة بالعربية (من اليمين إلى اليسار) والإنجليزية (من اليسار إلى اليمين).


## Images / الصور

| Tool | Notes |
| --- | --- |
| Compress | Many pictures at once, JPG/WebP quality, optional longest-side limit; re-encoding strips camera data |
| Resize | By pixels or percent, many at once |
| Crop | Drag an area, free or fixed shape |
| Rotate and flip | Many at once, live preview |
| Adjust colours | Brightness, contrast, saturation, grey, sepia, blur, invert; live preview |
| Transparent background | Make one colour see-through (not an automatic cut-out) |
| Convert | JPG, PNG, WebP |
| Social media sizes | Instagram, stories, Facebook, X, LinkedIn, YouTube presets; fill or fit |
| Meme maker | Top and bottom text, Arabic or English |
| Watermark | Text or logo on many pictures |
| Blur or hide areas | Blur, pixels or black box over areas you mark |

## Video / الفيديو

Runs FFmpeg (WebAssembly, about 32 MB, GPL-2.0-or-later, compatible with this project's AGPL-3.0) inside the browser.
The engine is served by the site itself and stored in the browser (Cache Storage) after the first download.
Single-threaded, so it is slower than a desktop app; very large files can run out of memory on phones.

| Tool | Notes |
| --- | --- |
| Convert | MP4, WebM (VP8), MOV, MKV; optional mute |
| Compress | WhatsApp, Instagram, TikTok, X, email presets; quality, height or target size |
| Resolution and frame rate | 2160p to 240p, 60 to 12 fps |
| Trim | Fast (copy) or precise (re-encode) |
| Merge | Different sizes fitted to the first clip; sound kept only if every clip has it |
| Crop | 9:16, 1:1, 4:5, 16:9, 4:3 or exact pixels, with a frame on the preview |
| Rotate and flip | 90°, 180°, mirror |
| Speed | 0.25× to 8×, sound in step |
| Extract audio | MP3, M4A, WAV, OGG, FLAC |
| Video to GIF | Up to 30 s |
| Save frames | One frame or one every N seconds as ZIP (uses the browser's player) |
| Video details | Size, length, resolution, fps, codecs, bitrate |

Known limits: the VP9 encoder crashes in this WebAssembly build, so WebM uses VP8; no AI features, no downloading from websites.

## PDF

## Status / الحالة

All 18 tools work in the browser / كل الأدوات الـ 18 شغالة.

| Tool / الأداة | Notes |
| --- | --- |
| Undo / redo | Every tool: buttons at the top of the page, Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z (Cmd on Mac). Undoes your edits and choices; text fields keep the browser's own undo. Compare only undoes its view choices |
| Features page | Header link "Features / المميزات": everything the site does, per tool, plus a shortcut table (also opens with F1) |
| Keyboard shortcuts | Acrobat DC style: Ctrl (Cmd on Mac) +/-/0/1/2, Shift+Ctrl+N, Ctrl+F, F3, Ctrl+Shift+Plus (rotate), Ctrl+L, Ctrl+Shift+Y, Ctrl+S (the tool's main action) and more. Keys marked `*` on the Features page are usual Acrobat keys not checked against Adobe's own page |
| Browse a file | What is inside a PDF (pages, paper size, text or scan, form fields, metadata) and every page in one continuous scroll, built for phones |
| View & find | Read, search (Arabic-friendly), rotate view, read mode, full screen |
| Print | Colour, grey or black and white (applied to the pages, so it works with any printer) |
| Share | System share sheet (WhatsApp, Mail, ...) for the file; message links for WhatsApp, Telegram, email. No upload, so no file links |
| Export to… | Word, Excel, PowerPoint, text, RTF, HTML, XML (text only; Excel keeps table columns; PowerPoint is page pictures) |
| Create PDF | Images and text (Arabic + English) into one PDF |
| Merge, Organize pages | Reorder, rotate, delete, split |
| Export to images | PNG/JPG, 72-300 dpi, ZIP |
| Scan & OCR | Tesseract, Arabic + English, searchable PDF. Has a poster/photo mode that reads at several sizes. Language data ships with the site |
| Fill & sign | Fill forms, text, check marks, drawn/image signature (visual, not certificate-based) |
| Prepare form | Examines the file first and suggests fields (empty table cells, blanks, lines, tick boxes, labels with a colon), or draw them yourself. Add text, multiline, checkbox, radio, dropdown, list fields. Boxes can be moved and resized (handles, arrow keys, or exact width/height in points) |
| Comment & highlight | Real PDF highlight, underline, strike-out and sticky-note annotations; drag selects text like a reader, "Free area" for pictures |
| Stamp | Text/image stamps, watermarks, page numbers, live preview. Place it anywhere: click or drag on the preview, or type exact percentages (plus 9 quick spots and tiling) |
| Compare | Text diff and visual diff |
| Measure | Calibrated distance and area |
| Protect | AES-256 password, or remove a password you know |
| Redact | Search or draw; affected pages are rasterized so the text is really gone |
| Optimize | Light (lossless), balanced, strong, flatten |

Out of scope for a browser-only app: Export to Word/Excel/PowerPoint, PDF/A and print-production
checks, accessibility tagging, certificate-based signing, "Certified PDF" and "Reader Extended PDF", PostScript export, links to files (needs upload), cloud features (send for comments,
bulk send, web forms).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + component tests
npm run build      # outputs dist/
```

## Deploy to GitHub Pages

1. Push this repository to GitHub (default branch `main`).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Every push to `main` runs the tests, builds, and publishes the site.

The build uses relative asset paths and hash routing (`#/merge`), so it works under any
repository name without extra configuration.

## Built with

[pdf-lib](https://pdf-lib.js.org/) (editing), [PDF.js](https://mozilla.github.io/pdf.js/) (page previews),
React, Vite, TypeScript. Fonts are bundled locally (Inter, IBM Plex Sans Arabic), so the app makes
no third-party requests.

## License

AGPL-3.0-only (see LICENSE). You may use, study, change and share it, but a modified version, including one offered as a website, must stay open source under the same licence. Earlier copies taken while the project was MIT stay MIT. This project is independent and is not affiliated with or endorsed by Adobe.
Adobe and Acrobat are trademarks of Adobe Inc.
