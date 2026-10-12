import { describe, expect, it } from 'vitest';
import type { TextItem } from '../pdf';
import { findTextBoxes, groupLines, itemsToText, rectFromPoints, selectTextFlow, textRectsInRegion } from './textselect';

const item = (str: string, x: number, y: number, width: number, rtl = false, eol = false): TextItem => ({ str, x, y, width, height: 10, rtl, eol, vertical: false });

describe('text selection helpers', () => {
  it('orders corner points into a rectangle', () => {
    expect(rectFromPoints([50, 80], [10, 20])).toEqual({ x: 10, y: 20, width: 40, height: 60 });
  });

  it('cuts runs to the dragged span and ignores other lines', () => {
    const items = [item('Hello world', 100, 700, 110), item('Second line', 100, 680, 110)];
    const r = textRectsInRegion(items, { x: 130, y: 695, width: 40, height: 20 });
    expect(r).toHaveLength(1);
    expect(r[0].x).toBe(130);
    expect(r[0].width).toBe(40);
    expect(r[0].y).toBeLessThan(700);
  });

  it('highlights whole runs when the drag covers several lines', () => {
    const items = [item('Hello world', 100, 700, 110), item('Second line', 100, 680, 110)];
    const r = textRectsInRegion(items, { x: 90, y: 670, width: 300, height: 50 });
    expect(r.map((x) => [x.x, x.width])).toEqual([[100, 110], [100, 110]]);
  });

  it('returns nothing over empty space', () => {
    expect(textRectsInRegion([item('a', 0, 0, 5)], { x: 200, y: 200, width: 10, height: 10 })).toEqual([]);
  });

  it('finds a word inside a run (left-to-right)', () => {
    const [box] = findTextBoxes([item('abcdefghij', 100, 500, 100)], 'DEF');
    // d starts at char 3 -> x 130, width 30, plus padding
    expect(box.x).toBeLessThan(130);
    expect(box.x).toBeGreaterThan(125);
    expect(box.x + box.width).toBeGreaterThan(160);
    expect(box.x + box.width).toBeLessThan(165);
  });

  it('mirrors the position for right-to-left runs', () => {
    const [box] = findTextBoxes([item('abcdefghij', 100, 500, 100, true)], 'abc');
    // first letters sit at the right edge
    expect(box.x).toBeGreaterThan(165);
    expect(box.x + box.width).toBeLessThanOrEqual(200);
  });

  it('finds every occurrence and ignores an empty query', () => {
    expect(findTextBoxes([item('aa aa', 0, 0, 50)], 'aa')).toHaveLength(2);
    expect(findTextBoxes([item('aa', 0, 0, 50)], '  ')).toEqual([]);
  });

  it('builds page text with line breaks', () => {
    expect(itemsToText([item('one', 0, 0, 10), item('two', 20, 0, 10, false, true), item('three', 0, 0, 10)])).toBe('one two\nthree');
  });

  describe('selectTextFlow', () => {
    const page = [item('First line of text', 100, 700, 180), item('Second line here', 100, 680, 160), item('Third line end', 100, 660, 140)];

    it('selects from the start point to the end point in reading order', () => {
      const r = selectTextFlow(page, [150, 702], [200, 682]);
      // first line: from x=150 to its end; second line: from its start to x=200
      expect(r).toHaveLength(2);
      expect(r[0].x).toBe(150);
      expect(r[0].x + r[0].width).toBe(280);
      expect(r[1].x).toBe(100);
      expect(r[1].x + r[1].width).toBe(200);
    });

    it('takes whole lines in between and works when dragging upwards', () => {
      const r = selectTextFlow(page, [120, 662], [120, 702]);
      expect(r).toHaveLength(3);
      expect(r[1].width).toBe(160);
    });

    it('follows right-to-left lines', () => {
      const ar = [item('سطر أول', 100, 700, 100, true), item('سطر ثان', 100, 680, 100, true)];
      const r = selectTextFlow(ar, [150, 702], [150, 682]);
      // first line: from the start point leftwards; second line: from its right edge to the end point
      expect(r[0].x).toBe(100);
      expect(r[0].x + r[0].width).toBe(150);
      expect(r[1].x).toBe(150);
      expect(r[1].x + r[1].width).toBe(200);
    });

    it('stays on one line when the drag is level', () => {
      const r = selectTextFlow(page, [110, 701], [160, 699]);
      expect(r).toEqual([{ x: 110, y: expect.any(Number), width: 50, height: expect.any(Number) }]);
    });

    it('finds nothing when the page has no text near the drag', () => {
      expect(selectTextFlow(page, [10, 300], [50, 320])).toEqual([]);
      expect(selectTextFlow([], [0, 0], [10, 10])).toEqual([]);
    });

    it('groups runs of the same line together', () => {
      expect(groupLines([item('a', 10, 700, 20), item('b', 40, 700, 20), item('c', 10, 680, 20)])).toHaveLength(2);
    });
  });
});

describe('forgiving search', () => {
  it('matches alef forms and case, and keeps the text length', async () => {
    const { normalizeSearch } = await import('./textselect');
    expect(normalizeSearch('أحمد')).toBe(normalizeSearch('احمد'));
    expect(normalizeSearch('Hello')).toBe('hello');
    expect(normalizeSearch('إلى')).toHaveLength(3);
    const boxes = findTextBoxes([item('الأمل والإيمان', 100, 700, 140, true)], 'الامل', normalizeSearch);
    expect(boxes).toHaveLength(1);
  });
});

describe('real-world text quirks', () => {
  it('drops shadow copies and runs contained in a longer run', async () => {
    const { dropDuplicateRuns } = await import('./textselect');
    const items = [item('1448', 100, 50, 40), item('1448', 100, 50, 40), item('2026', 200, 50, 40), item('2026 -', 200, 50, 55), item('-', 238, 50, 17), item('other', 100, 80, 40)];
    expect(dropDuplicateRuns(items).map((i) => i.str)).toEqual(['1448', '2026 -', 'other']);
  });

  it('keeps vertical text out of the horizontal lines and reads it as its own line', () => {
    const v = (str: string, y: number): TextItem => ({ ...item(str, 20, y, 60, true), vertical: 'up' });
    const lines = groupLines([item('Body text', 100, 300, 80), v('second', 150), v('first', 100)]);
    expect(lines).toHaveLength(2);
    const side = lines.find((l) => l.vertical)!;
    expect(side.items.map((i) => i.str)).toEqual(['first', 'second']);
    expect(selectTextFlow([v('abc', 100)], [20, 100], [20, 150])).toEqual([]);
    expect(findTextBoxes([v('abc', 100)], 'abc')).toEqual([]);
  });

  it('finds a word even when its letters are stretched', () => {
    const boxes = findTextBoxes([item('توزيــع المصاحـــف', 100, 700, 180, true)], 'توزيع');
    expect(boxes).toHaveLength(1);
    // the word is at the right end of a right-to-left run
    expect(boxes[0].x + boxes[0].width).toBeGreaterThan(250);
  });
});

describe('Arabic details', () => {
  it('keeps the tatweel of هـ but removes decorative stretching', async () => {
    const { stripTatweel } = await import('./textselect');
    expect(stripTatweel('توزيــع 1448 هـ')).toBe('توزيع 1448 هـ');
  });

  it('decides a line direction from its words, not its numbers', () => {
    const lines = groupLines([item('1448', 100, 50, 40), item('هـ', 150, 50, 20, true), item('2026', 180, 50, 40), item('م', 225, 50, 10, true)]);
    expect(lines[0].rtl).toBe(true);
  });
});
