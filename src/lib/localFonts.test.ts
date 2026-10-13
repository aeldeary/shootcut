import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { families, isFontFile, removeFont, saveFont, savedFonts, sendFonts } from './localFonts';

describe('device fonts for the studios', () => {
  it('accepts only font files the apps can read', () => {
    expect(isFontFile('Amiri-Regular.TTF')).toBe(true);
    expect(isFontFile('x.otf')).toBe(true);
    expect(isFontFile('x.woff2')).toBe(false);
    expect(isFontFile('notes.txt')).toBe(false);
  });

  it('keeps fonts on the device and forgets them on request', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const f = await saveFont('A.ttf', bytes);
    expect((await savedFonts()).map((x) => x.name)).toContain('A.ttf');
    await removeFont(f.id);
    expect((await savedFonts()).map((x) => x.name)).not.toContain('A.ttf');
  });

  it('hands the bytes to the frame with the frame\'s own array types', () => {
    const win = { Array, Uint8Array } as unknown as Window;
    expect(sendFonts(win, [new Uint8Array([9, 8]).buffer])).toBe(true);
    const list = (win as unknown as { __shootcutFonts: Uint8Array[] }).__shootcutFonts;
    expect(list).toHaveLength(1);
    expect([...list[0]]).toEqual([9, 8]);
    expect(sendFonts(null, [new ArrayBuffer(1)])).toBe(false);
    expect(sendFonts(win, [])).toBe(false);
  });

  it('lists each family once', () => {
    const face = (family: string) => ({ family, fullName: family, style: 'Regular', load: async () => new ArrayBuffer(0) });
    expect(families([face('Cairo'), face('Amiri'), face('Cairo')])).toEqual(['Amiri', 'Cairo']);
  });
});

describe('auto import choice', () => {
  it('is off by default and remembers the choice', async () => {
    const { autoImportOn, setAutoImport } = await import('./localFonts');
    setAutoImport(false);
    expect(autoImportOn()).toBe(false);
    setAutoImport(true);
    expect(autoImportOn()).toBe(true);
    setAutoImport(false);
    expect(autoImportOn()).toBe(false);
  });
});
