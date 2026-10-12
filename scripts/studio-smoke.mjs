// Opens a built studio in headless Chromium, waits, and saves a screenshot + a small report.
//   node scripts/studio-smoke.mjs <dir> <id> <out-dir>
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const [dir, id, out] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (p.endsWith('/')) p += 'index.html';
    const f = join(dir, p);
    await stat(f);
    res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
const t0 = Date.now();
await page.goto(base + 'index.html?webgl', { waitUntil: 'load', timeout: 120000 }).catch((e) => errors.push('goto: ' + e.message));
await page.waitForSelector('canvas', { timeout: 90000 }).catch(() => errors.push('no canvas within 90 s'));
await page.waitForTimeout(20000);
await page.screenshot({ path: join(out, `${id}.png`) });
const info = await page.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length, title: document.title }));
await writeFile(join(out, `${id}.json`), JSON.stringify({ id, ...info, seconds: Math.round((Date.now() - t0) / 1000), errors: errors.slice(0, 10) }, null, 1));
await browser.close();
server.close();
console.log(id, info, errors.slice(0, 3));
