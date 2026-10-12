// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { SHORTCUTS, dispatch, formatCombo, isMacPlatform, matches, register, type ShortcutId } from './shortcuts';

const ev = (o: Partial<KeyboardEvent> & { code: string }) =>
  ({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, isComposing: false, target: null, preventDefault() { (this as { defaultPrevented: boolean }).defaultPrevented = true; }, ...o }) as unknown as KeyboardEvent;

const off: (() => void)[] = [];
afterEach(() => off.splice(0).forEach((f) => f()));

describe('matching', () => {
  it('uses Ctrl on Windows and Command on a Mac', () => {
    const c = { code: 'KeyO', mod: true };
    expect(matches(ev({ code: 'KeyO', ctrlKey: true }), c, false)).toBe(true);
    expect(matches(ev({ code: 'KeyO', metaKey: true }), c, false)).toBe(false);
    expect(matches(ev({ code: 'KeyO', metaKey: true }), c, true)).toBe(true);
    expect(matches(ev({ code: 'KeyO', ctrlKey: true }), c, true)).toBe(false);
  });
  it('tells Ctrl+= (zoom in) from Ctrl+Shift+= (rotate)', () => {
    const zoom = SHORTCUTS.find((s) => s.id === 'zoomIn')!.combos[0];
    const rot = SHORTCUTS.find((s) => s.id === 'rotateCw')!.combos[0];
    const plus = ev({ code: 'Equal', ctrlKey: true });
    const shifted = ev({ code: 'Equal', ctrlKey: true, shiftKey: true });
    expect([matches(plus, zoom, false), matches(plus, rot, false)]).toEqual([true, false]);
    expect([matches(shifted, zoom, false), matches(shifted, rot, false)]).toEqual([false, true]);
  });
  it('goes by the physical key, so another keyboard layout still works', () => {
    expect(matches({ ...ev({ code: 'KeyF', ctrlKey: true }), key: 'ب' } as KeyboardEvent, { code: 'KeyF', mod: true }, false)).toBe(true);
  });
});

describe('the list', () => {
  it('has no two shortcuts on the same keys', () => {
    const seen = new Map<string, ShortcutId>();
    for (const s of SHORTCUTS)
      for (const c of s.combos) {
        const key = `${c.mod ? 'M' : ''}${c.shift ? 'S' : ''}${c.alt ? 'A' : ''}-${c.code}`;
        // the same plain key may serve different tools (S and F in the comment and form tools are different keys anyway)
        expect(seen.get(key), key).toBeUndefined();
        seen.set(key, s.id);
      }
  });
  it('has an English and an Arabic text for each', () => {
    for (const s of SHORTCUTS) {
      expect(s.label.en.length).toBeGreaterThan(2);
      expect(s.label.ar.length).toBeGreaterThan(2);
      expect(s.where.en && s.where.ar).toBeTruthy();
    }
  });
  it('writes the keys for each platform', () => {
    expect(formatCombo({ code: 'KeyN', mod: true, shift: true }, false)).toBe('Ctrl + Shift + N');
    expect(formatCombo({ code: 'KeyN', mod: true, shift: true }, true)).toBe('⌘ + ⇧ + N');
    expect(formatCombo({ code: 'PageDown', mod: true }, false)).toBe('Ctrl + Page Down');
  });
  it('recognises a Mac', () => {
    expect(isMacPlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isMacPlatform({ platform: 'Win32', userAgent: 'Windows' })).toBe(false);
  });
});

describe('dispatch', () => {
  it('runs the handler and takes the key; unhandled keys stay with the browser', () => {
    let hits = 0;
    off.push(register((id) => (id === 'zoomIn' ? () => void hits++ : undefined)));
    const e = ev({ code: 'Equal', ctrlKey: true });
    expect(dispatch(e, false)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(hits).toBe(1);
    const other = ev({ code: 'Equal', ctrlKey: true, shiftKey: true });
    expect(dispatch(other, false)).toBe(false);
    expect(other.defaultPrevented).toBe(false);
  });
  it('lets a handler decline with false', () => {
    off.push(register((id) => (id === 'nextScreen' ? () => false : undefined)));
    const e = ev({ code: 'PageDown' });
    expect(dispatch(e, false)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
  });
  it('gives the tool priority over the app-wide handler', () => {
    const order: string[] = [];
    off.push(register((id) => (id === 'print' ? () => void order.push('app') : undefined), 0));
    off.push(register((id) => (id === 'print' ? () => void order.push('tool') : undefined), 1));
    dispatch(ev({ code: 'KeyP', ctrlKey: true }), false);
    expect(order).toEqual(['tool']);
  });
  it('keeps plain keys for text fields and box handles, but not Ctrl keys', () => {
    let n = 0;
    off.push(register(() => () => void n++));
    const input = { tagName: 'INPUT', type: 'text', isContentEditable: false, closest: () => null };
    expect(dispatch(ev({ code: 'ArrowRight', target: input as unknown as EventTarget }), false)).toBe(false);
    expect(dispatch(ev({ code: 'KeyF', ctrlKey: true, target: input as unknown as EventTarget }), false)).toBe(true);
    const box = { tagName: 'DIV', isContentEditable: false, closest: (s: string) => (s === '.editable-box' ? {} : null) };
    expect(dispatch(ev({ code: 'ArrowRight', target: box as unknown as EventTarget }), false)).toBe(false);
    expect(n).toBe(1);
  });
});
