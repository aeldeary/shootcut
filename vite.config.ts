import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps asset URLs relative, so the build works on GitHub Pages
// under any repository name (https://user.github.io/<repo>/).
export default defineConfig({
  base: './',
  plugins: [react()],
  // The site uses the "legacy" pdf.js build: the current build draws some InDesign Arabic titles with their
  // letters scrambled (checked on a real flyer), the legacy build draws them correctly. Tests mock 'pdfjs-dist' themselves.
  resolve: {
    alias: [
      { find: 'pdfjs-dist/build/pdf.worker.min.mjs', replacement: 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' },
      { find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' },
    ],
  },
  build: { target: 'es2022' },
});
