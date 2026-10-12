// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { History, isTextEditing, shallowEqual } from './history';

describe('History', () => {
  it('undoes and redoes, and forgets the future after a new change', () => {
    const h = new History({ n: 0 });
    h.record({ n: 1 }, 1000);
    h.record({ n: 2 }, 2000);
    expect(h.undo()).toEqual({ n: 1 });
    expect(h.undo()).toEqual({ n: 0 });
    expect(h.undo()).toBeNull();
    expect(h.redo()).toEqual({ n: 1 });
    h.record({ n: 5 }, 9000);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toEqual({ n: 1 });
  });

  it('counts quick successive changes (typing, dragging) as one step', () => {
    const h = new History({ s: '' });
    h.record({ s: 'a' }, 1000);
    h.record({ s: 'ab' }, 1100);
    h.record({ s: 'abc' }, 1200);
    expect(h.undo()).toEqual({ s: '' });
    expect(h.canUndo).toBe(false);
  });

  it('ignores a snapshot equal to the current one and keeps the number of steps limited', () => {
    const items = [1];
    const h = new History({ items }, 3);
    expect(h.record({ items }, 1000)).toBe(false);
    for (let i = 0; i < 10; i++) h.record({ items: [i] }, 2000 + i * 1000);
    expect(h.past.length).toBe(3);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('leaves text fields to the browser', () => {
    expect(isTextEditing({ tagName: 'INPUT', type: 'text' } as unknown as EventTarget)).toBe(true);
    expect(isTextEditing({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTextEditing({ tagName: 'INPUT', type: 'checkbox' } as unknown as EventTarget)).toBe(false);
    expect(isTextEditing({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
  });
});
