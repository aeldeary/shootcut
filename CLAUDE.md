# Shootcut — project rules

## Keep the Features page current (standing rule)
Whenever a feature is added, changed or removed, update the Features page in the **same change**:

- `src/lib/features.ts` — `TOOL_FEATURES` (one entry per ready tool, Arabic and English, Western digits), `GENERAL_FEATURES`, `NOT_AVAILABLE`.
- `src/lib/shortcuts.ts` — any new or changed keyboard shortcut (the Features page table is generated from it).
- `README.md` — the status table.

`src/lib/features.test.ts` fails if a ready tool has no feature entry.

## Structure
- The home page offers four sections: PDF, Images, Video and audio, Sheets and slides (`SECTIONS` in `src/lib/tools.ts`), then the Studios. Each tool belongs to a group, each group to a section.
- Everything runs in the browser. No server, no uploads, no paid or terms-violating services, no third-party requests.
- Video tools run FFmpeg (WebAssembly) through `src/lib/video/engine.ts`: the 32 MB engine is copied to `public/ffmpeg` by `scripts/copy-assets.mjs` and kept in the browser's Cache Storage after the first download. Command lines are built in `src/lib/video/args.ts` (tested); pages share `src/components/VideoTool.tsx`. WebM uses VP8 because the VP9 encoder crashes in this build. Never add a CDN URL.
- PDF page tools (split, extract/remove, crop, repair) are in `src/lib/ops/pdftools.ts` and `src/tools/PdfPageTools.tsx`.
- Image tools share `src/components/ImageBatch.tsx` (many pictures) or `src/tools/ImageEditTools.tsx` (one picture); the picture maths lives in `src/lib/ops/imgops.ts` with tests.

- The person chooses places, never a fixed preset only: crops use the draggable `src/components/CropFrame.tsx`; watermark and meme text use `PlacePad.tsx` or clicks on the preview; the PDF stamp has its own free placement.
- Files the person adds (PDF, pictures, video) are kept in IndexedDB (`src/lib/persist.ts`, `src/hooks/useKeptMedia.ts`, `MediaKeepBar`) so the next tool opens with them. Nothing is kept until the person chooses yes once; saved files expire after 24 hours; the bar offers delete, delete-all and an off switch.

- Studios (`src/lib/studios.ts`, `src/components/Studios.tsx`): five studios embed open-source web apps (Rust/WebAssembly, MIT OR Apache-2.0) built by `.github/workflows/studios.yml` (matrix must match `STUDIOS`, a test checks it) into the `studios` branch; `deploy.yml` copies that branch into `public/studio`. The person must choose Full or Light before anything opens. Before compiling, `scripts/patch-studio.py` gives each app Shootcut's identity: names, logos and pictures, colours (blue/green/orange become the brand red), no Discord or community links, loading text "Loading Shootcut Program…", favicon, and the `?lang=` language hand-over. Every per-app edit must match or the build stops; the build log lists what is left of the old names. Nothing visible may show the upstream's name, logo, colours or Discord. The licence texts stay with each app (legally required) and are listed on the `#/noticesssssshotcuts` page, linked discreetly from the footer. Never use the upstream's names or logos as Shootcut's own branding. Studio names on the home page are plain: Documents, Design, Video editing, Audio, Engineering (المستندات، التصميم، المونتاج، الصوت، الهندسة).

## Other conventions
- Arabic text in the interface is Modern Standard Arabic (Fusha), not dialect.
- Arabic (RTL) and English (LTR) must both work; add every string to `src/i18n.tsx` in both blocks.
- No third-party network requests. Everything runs in the browser.
- Shortcuts match `KeyboardEvent.code` (layout independent); Ctrl on Windows, Command on Mac.
