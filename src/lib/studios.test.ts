// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { STUDIOS, parseStudioRoute, probeStudio, looksLikePhone, findStudio } from './studios';
import { TOOLS } from './tools';

const apps = STUDIOS.flatMap((s) => s.apps);

describe('studios', () => {
  it('has unique studio and app ids', () => {
    expect(new Set(STUDIOS.map((s) => s.id)).size).toBe(STUDIOS.length);
    expect(new Set(apps.map((a) => a.id)).size).toBe(apps.length);
  });

  it('lists only light tools that exist and are ready', () => {
    for (const s of STUDIOS) for (const id of s.light) expect(TOOLS.find((t) => t.id === id)?.status, `${s.id}:${id}`).toBe('ready');
  });

  it('matches the build matrix of .github/workflows/studios.yml', () => {
    const yml = readFileSync(new URL('../../.github/workflows/studios.yml', import.meta.url), 'utf8');
    const rows = [...yml.matchAll(/\{ id: (\w+), repo: (\w+) \}/g)].map((m) => `${m[1]}:${m[2]}`).sort();
    expect(rows).toEqual(apps.map((a) => `${a.id}:${a.repo}`).sort());
  });

  it('parses studio routes', () => {
    expect(parseStudioRoute('studio/docs')).toMatchObject({ studio: { id: 'docs' }, app: null });
    expect(parseStudioRoute('studio/docs/word')).toMatchObject({ app: { id: 'word' } });
    expect(parseStudioRoute('studio/docs/film')).toBeNull();
    expect(parseStudioRoute('studio/nope')).toBeNull();
    expect(parseStudioRoute('pdf')).toBeNull();
  });

  it('recognises a published app only when build.json names the right repository', async () => {
    const app = findStudio('docs')!.apps[0];
    const ok = async () => new Response(JSON.stringify({ repo: 'wordcraft', sha: 'abc1234', builtAt: 'x', wasmBytes: 13_000_000 }));
    expect(await probeStudio(app, ok as typeof fetch)).toMatchObject({ sha: 'abc1234', wasmBytes: 13_000_000 });
    const home = async () => new Response('<html>home</html>');
    expect(await probeStudio(app, home as typeof fetch)).toBeNull();
    const wrong = async () => new Response(JSON.stringify({ repo: 'other', sha: 'a' }));
    expect(await probeStudio(app, wrong as typeof fetch)).toBeNull();
    const missing = async () => new Response('', { status: 404 });
    expect(await probeStudio(app, missing as typeof fetch)).toBeNull();
  });

  it('treats narrow or touch screens as phones', () => {
    expect(looksLikePhone((q) => ({ matches: q.includes('max-width') }))).toBe(true);
    expect(looksLikePhone((q) => ({ matches: q.includes('coarse') }))).toBe(true);
    expect(looksLikePhone(() => ({ matches: false }))).toBe(false);
  });
});
