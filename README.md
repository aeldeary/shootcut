# Shootcut

Live: https://aeldeary.github.io/shootcut/

Free **PDF, image and video** tools that run **entirely in your browser**. No server, no uploads, no sign-up.
The home page is a search box (Arabic and English) and five sections: PDF, Images, Video and audio, Sheets and slides, Engineering; each section page opens with a slim strip of its full programs (Studios), and the tool bar has three menus: section, tools and full programs. Interface in Arabic (RTL) and English (LTR).

أدوات مجانية للـ **PDF والصور والفيديو** تعمل **بالكامل داخل المتصفح**. بلا خادم ولا رفع ملفات ولا تسجيل.
تضم الصفحة الرئيسية ثلاثة أقسام: PDF والصور والفيديو. الواجهة بالعربية (من اليمين إلى اليسار) والإنجليزية (من اليسار إلى اليمين).


## Images / الصور

| Tool | Notes |
| --- | --- |
| Enlarge | 2×, 3× or 4× with sharpening. Smooth enlarging, not AI: it cannot add detail; limited to 36 megapixels |
| Compress | Many pictures at once, JPG/WebP quality, optional longest-side limit; never returns a larger file (keeps the original); re-encoding strips camera data |
| Resize | By pixels or percent, many at once |
| Crop | Drag an area, free or fixed shape |
| Rotate and flip | Many at once, live preview |
| Adjust colours | Brightness, contrast, saturation, grey, sepia, blur, invert; live preview |
| Transparent background | Make one colour see-through (not an automatic cut-out) |
| Convert | JPG, PNG, WebP. Opens iPhone HEIC photos (libheif, LGPL-3.0, loaded only when one is picked) |
| Social media sizes | Instagram, stories, Facebook, X, LinkedIn, YouTube presets; fill or fit |
| Meme maker | Top and bottom text, Arabic or English; or click/drag on the picture to place each text |
| Watermark | Text or logo on many pictures; 9 quick spots, tiling, or click/drag to choose the exact place |
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
| Crop | 9:16, 1:1, 4:5, 16:9, 4:3 or exact pixels, with a draggable frame on the preview (free shape too) |
| Rotate and flip | 90°, 180°, mirror |
| Speed | 0.25× to 8×, sound in step |
| Extract audio | MP3, M4A, WAV, OGG, FLAC |
| Video to GIF | Up to 30 s |
| Save frames | One frame or one every N seconds as ZIP (uses the browser's player) |
| Video details | Size, length, resolution, fps, codecs, bitrate |

Known limits: the VP9 encoder crashes in this WebAssembly build, so WebM uses VP8; no AI features, no downloading from websites.

## Audio / الصوت

Same FFmpeg engine as the video tools.

| Tool | Notes |
| --- | --- |
| Trim | Exact seconds or the player position; MP3, M4A, WAV, OGG, FLAC |
| Convert | MP3, M4A, WAV, OGG, FLAC with a quality choice |
| Join | Several files in a chosen order, matched to 44.1 kHz stereo |
| Improve | Volume in dB, loudness levelling (about −16 LUFS), fades, speed 0.25 to 4, mono |

## PDF

## Status / الحالة

All PDF tools work in the browser / كل أدوات PDF شغالة.

| Tool / الأداة | Notes |
| --- | --- |
| Undo / redo | Every tool: buttons at the top of the page, Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z (Cmd on Mac). Undoes your edits and choices; text fields keep the browser's own undo. Compare only undoes its view choices |
| Search | Box on the home page: finds tools and studios by what you want to do; Arabic spelling variants folded; matches in either language; Enter opens the first result |
| Features page | Header link "Features / المميزات": everything the site does, per tool, plus a shortcut table (also opens with F1) |
| Keyboard shortcuts | Acrobat DC style: Ctrl (Cmd on Mac) +/-/0/1/2, Shift+Ctrl+N, Ctrl+F, F3, Ctrl+Shift+Plus (rotate), Ctrl+L, Ctrl+Shift+Y, Ctrl+S (the tool's main action) and more. Keys marked `*` on the Features page are usual Acrobat keys not checked against Adobe's own page |
| Browse a file | What is inside a PDF (pages, paper size, text or scan, form fields, metadata) and every page in one continuous scroll, built for phones |
| View & find | Read, search (Arabic-friendly), rotate view, read mode, full screen |
| Print | Colour, grey or black and white (applied to the pages, so it works with any printer) |
| Share | System share sheet (WhatsApp, Mail, ...) for the file; message links for WhatsApp, Telegram, email. No upload, so no file links |
| Extract text to… | Word, Excel, PowerPoint, Markdown, text, RTF, HTML, XML (text only; Excel keeps table columns; PowerPoint is page pictures) |
| Create PDF | Images and text (Arabic + English) into one PDF; on a phone, photograph pages with the camera (straightened) |
| Merge, Organize pages | Merge PDFs and pictures into one PDF; reorder, rotate, delete; insert blank pages, duplicate pages, add pages from another PDF |
| Split | By ranges, every N pages, or one file per page; several files come as a ZIP |
| Extract or remove pages | Keep the pages you name (in that order) or delete them |
| Crop pages | Margins in mm for all or some pages, or drag the frame and its corners on the preview; turned pages handled |
| Repair | Copies pages into a clean file (keeps text); if that fails, redraws pages as pictures and says so |
| Export to images | PNG/JPG, 72-300 dpi, ZIP |
| Scan & OCR | Tesseract, Arabic + English, searchable PDF. Has a poster/photo mode that reads at several sizes. Language data ships with the site |
| Fill & sign | Fill forms, text, check marks, drawn/image signature (visual, not certificate-based) |
| Prepare form | Examines the file first and suggests fields (empty table cells, blanks, lines, tick boxes, labels with a colon), or draw them yourself. Add text, multiline, checkbox, radio, dropdown, list fields. Boxes can be moved and resized (handles, arrow keys, or exact width/height in points). **Fill in** mode types straight inside each rectangle on the page (Tab / Shift+Tab move between boxes, row by row), with right-to-left, left-to-right or centred text, colour, font (built-in or a font file from the device), bold, italic and underline; the text is written onto the page, Arabic included. **Convert to interactive PDF** turns all boxes (the detected ones too) into real fillable fields in one click, keeping typed Latin text as the value (Arabic is written onto the page); the fields' text starts at the right edge (Arabic) or the middle |
| Comment & highlight | Real PDF highlight, underline, strike-out and sticky-note annotations; drag selects text like a reader, "Free area" for pictures |
| Stamp | Text/image stamps, watermarks, page numbers (`{n}`, `{total}`, `{date}`, Bates `{n:6}`), odd/even page ranges, live preview. Place it anywhere: click or drag on the preview, or type exact percentages (plus 9 quick spots and tiling) |
| Compare | Text diff and visual diff |
| Measure | Calibrated distance and area |
| Protect | AES-256 password, or remove a password you know |
| Redact sensitive data | Search, draw, or find private data by shape (emails, phones incl. Arabic digits, cards with check digit, ID numbers, dates, links); affected pages are rasterized so the text is really gone |
| Pages per sheet, Booklet | 2 to 16 pages per sheet (A4/A3/Letter), or an imposed booklet that folds into a book (right-to-left too) |
| Clean hidden information | Audit and remove metadata, JavaScript, attachments, comments, links, bookmarks, thumbnails; removed objects are dropped from the file, not just unlinked |
| Accessibility check | Title, language, tags, real text, figure descriptions, bookmarks, field tooltips; sets title and language. Reading order and contrast stay manual |
| Optimize | Light (lossless), balanced, strong, flatten |

Out of scope for a browser-only app: AI tools (background removal, AI upscaling, translation, summaries), downloading videos from sites, Word/Excel/PowerPoint to PDF with exact layout, PDF/A and print-production
checks, building accessibility tags, certificate-based signing, "Certified PDF" and "Reader Extended PDF", PostScript export, links to files (needs upload), cloud features (send for comments,
bulk send, web forms).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + component tests
npm run build      # outputs dist/
```

## Sheets and slides / الجداول والعروض

Light tools, no server: a spreadsheet (26 columns × 200 rows, formulas, XLSX and CSV in and out), a slide maker (four layouts, five themes, Arabic right to left, PPTX with editable text, PDF, pictures, full-screen presenting) and a 2D drafting board (lines, rectangles, circles, polylines, text, snapping, exact lengths, measuring, DXF in and out, SVG and picture export). All save in the browser as you work.

## Studios / الاستوديوهات

Five studios (Docs, Design, Film, Audio, CAD) embed full open-source web apps (MIT OR Apache-2.0), built by `.github/workflows/studios.yml` with Shootcut's names, colours and logos (`scripts/patch-studio.py`) into the `studios` branch and served under `/studio/<app>/`; their licence texts are listed on the in-site notices page. Each studio opens at once on the version that suits the device (phones are pointed to light) with an always-visible switch between **full** and **light**; the last choice is kept in this browser (`shootcut-edition`). A **Device fonts** button adds fonts from the person's computer to the apps (font files in any browser; the installed fonts through Local Font Access in Chrome, Edge and Opera), kept in IndexedDB and handed over by `scripts/studio-fonts/bridge.rs` (Docs, Design, Slides, Vector, Photo, Film and Effects; Sheets, Light, Sound and CAD have no text tool to give fonts to). **Import all my fonts** reads every installed font through Local Font Access (one browser permission) and hands them to the app without keeping them; an option repeats it when an app opens and the permission is already granted. The same panel lists the open-licence (SIL OFL) font library in `public/fonts/library/` (`manifest.json`; only fonts whose own licence allows redistribution go there). The Docs studio programs open in Arabic or English (the site's language or the **Program language** menu; the PDF editor too): Docs has an `ar.tsv` catalog and Sheets an `ar.rs` table (`scripts/studio-patches/wordcraft|gridcraft/`), Slides has no translation system, so `patch-studio.py` (`deck_wrap`) sends its labels through `src/ar.rs` of the app; all use `bidi.rs` for display order. The Design, Video editing, Audio and Engineering programs are English only; Shootcut's frame, notices and light tools follow the chosen language.

| Studio | Full apps | Light version |
| --- | --- | --- |
| Docs | Documents, Spreadsheets, Presentations | Light spreadsheet, light slides, create and convert PDF |
| Design | Photo editor, Photo developer, Vector drawing, Graphic design, UI design | Picture tools |
| Film | Video editor, Motion effects | Video tools |
| Audio | Audio workstation | Trim, convert, join and improve sound |
| CAD | CAD drafting | Light drafting board (lines, shapes, text, measure, DXF/SVG/PNG) |

### PDF: Full and Light

The PDF card on the home page opens on the same switch. **Full** is the pdfcraft web app (MIT OR Apache-2.0, built in the same `studios.yml` matrix as id `pdf`, served under `/studio/pdf/`, with Shootcut's name, colours and loading screen, and no community links or upstream logos); **Light** is the PDF tools of this site. Full finds the fields of a form by itself (`scripts/studio-patches/pdfcraft/*shootcut_detect.rs`, ported from the Light tool: table cells, dotted blanks, ruled lines with the caption on, over or under them, colon labels, tick boxes; Arabic labels named whole; no frame or fill), opens in the site's language (its own Arabic catalog is selected through `?lang=`; `patch-studio.py` makes the web build read the browser language and adds the strings Shootcut introduced), uses Acrobat DC's shortcuts, and `patch-studio.py` stops the browser's own handling of those keys. It is a hidden entry of `STUDIOS` (`hidden: true`), so it is not a sixth studio and has no card in the Studios block.

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

## Your files stay with you
The PDF, pictures or video you open are kept in this browser (IndexedDB, never uploaded) only after you say yes the first time, and for 24 hours, so the next tool of the same kind opens with them. A bar under the file lets you delete one file, delete all saved files, or switch keeping off.
