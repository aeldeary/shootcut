// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GROUPS, SECTIONS, TOOLS, WHATS_NEW, sectionOfRoute } from './tools';
import { STUDIOS, studiosOfSection } from './studios';

describe('the catalogue of tools', () => {
  it('puts every tool in a group that exists, and every group in a section', () => {
    const groups = new Set(GROUPS.map((g) => g.id));
    const sections = new Set(SECTIONS.map((s) => s.id));
    for (const t of TOOLS) expect(groups.has(t.group), t.id).toBe(true);
    for (const g of GROUPS) expect(sections.has(g.section), g.id).toBe(true);
  });

  it('keeps every group short enough to scan: at least one and at most seven ready tools', () => {
    for (const g of GROUPS) {
      const n = TOOLS.filter((t) => t.group === g.id && t.status === 'ready').length;
      expect(n, g.id).toBeGreaterThanOrEqual(1);
      expect(n, g.id).toBeLessThanOrEqual(7);
    }
  });

  it('splits the PDF creation tools from the page tools', () => {
    const ids = (group: string) => TOOLS.filter((t) => t.group === group).map((t) => t.id).sort();
    expect(ids('create')).toEqual(['convert', 'create', 'export', 'merge', 'ocr']);
    expect(ids('pages')).toEqual(['organize', 'pdf-crop', 'pdf-extract', 'pdf-layout', 'pdf-split']);
    expect(sectionOfRoute('organize')).toBe('pdf');
  });

  it('points out at most three new tools, all real', () => {
    expect(WHATS_NEW.length).toBeLessThanOrEqual(3);
    for (const w of WHATS_NEW) expect(TOOLS.some((t) => t.id === w.id), w.id).toBe(true);
  });

  it('gives every visible studio exactly one section, and lists it there', () => {
    const shown = STUDIOS.filter((s) => !s.hidden);
    expect(shown.length).toBe(5);
    const listed = SECTIONS.flatMap((s) => studiosOfSection(s.id).map((x) => x.id));
    expect(listed.sort()).toEqual(shown.map((s) => s.id).sort());
  });
});
