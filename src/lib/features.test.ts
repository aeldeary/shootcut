// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GENERAL_FEATURES, NOT_AVAILABLE, TOOL_FEATURES } from './features';
import { TOOLS } from './tools';

describe('the Features page data', () => {
  it('describes every tool that is ready, in both languages (add an entry when you add a tool)', () => {
    for (const tool of TOOLS.filter((x) => x.status === 'ready')) {
      const list = TOOL_FEATURES[tool.id];
      expect(list, `no features written for the tool "${tool.id}" in src/lib/features.ts`).toBeTruthy();
      expect(list.length).toBeGreaterThan(0);
      for (const f of list) {
        expect(f.en.trim().length).toBeGreaterThan(5);
        expect(f.ar.trim().length).toBeGreaterThan(5);
      }
    }
  });
  it('has no entry for a tool that does not exist', () => {
    const ids = new Set(TOOLS.map((x) => x.id));
    for (const id of Object.keys(TOOL_FEATURES)) expect(ids.has(id), id).toBe(true);
  });
  it('has both languages for the general features and the limits', () => {
    for (const g of GENERAL_FEATURES) for (const t of [g.title, g.text]) expect(t.en && t.ar).toBeTruthy();
    for (const n of NOT_AVAILABLE) expect(n.en && n.ar).toBeTruthy();
  });
  it('uses Western digits in the Arabic texts', () => {
    const all = [...Object.values(TOOL_FEATURES).flat(), ...NOT_AVAILABLE, ...GENERAL_FEATURES.flatMap((g) => [g.title, g.text])];
    for (const t of all) expect(/[٠-٩]/.test(t.ar), t.ar).toBe(false);
  });
});
