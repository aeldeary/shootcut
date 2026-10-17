import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The public address of the site. GitHub Pages address by default; the deploy workflow sets SITE_URL to the custom
// domain (repository variable CUSTOM_DOMAIN) so links, share cards, robots.txt and the sitemap use the real address.
const SITE_URL = (process.env.SITE_URL || 'https://aeldeary.github.io/shootcut').replace(/\/+$/, '') + '/';

function siteMeta(): Plugin {
  return {
    name: 'shootcut-site-meta',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', SITE_URL),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n` });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}</loc></url>\n</urlset>\n`,
      });
    },
  };
}

// base './' keeps asset URLs relative, so the build works on GitHub Pages
// under any repository name (https://user.github.io/<repo>/).
export default defineConfig({
  base: './',
  plugins: [react(), siteMeta()],
  // The site uses the "legacy" pdf.js build: the current build draws some InDesign Arabic titles with their
  // letters scrambled (checked on a real flyer), the legacy build draws them correctly. Tests mock 'pdfjs-dist' themselves.
  resolve: {
    alias: [
      { find: 'pdfjs-dist/build/pdf.worker.min.mjs', replacement: 'pdfjs-dist/legacy/build/pdf.worker.min.mjs' },
      { find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' },
    ],
  },
  // the FFmpeg wrapper starts its own worker from a relative URL, which Vite's dev pre-bundling would break
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  build: { target: 'es2022' },
});
