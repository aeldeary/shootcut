// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fromXlsx, parseCsv, toCsv, toXlsx, extent } from './io';

describe('csv', () => {
  it('reads quotes, commas inside quotes, semicolons and a BOM', () => {
    expect(parseCsv('﻿a,b\n"x, y","he said ""hi"""\n').cells).toEqual({ A1: 'a', B1: 'b', A2: 'x, y', B2: 'he said "hi"' });
    expect(parseCsv('a;b;c\n1;2;3').cells).toMatchObject({ C2: '3' });
    expect(parseCsv('a\tb\r\n1\t2\r\n').cells).toEqual({ A1: 'a', B1: 'b', A2: '1', B2: '2' });
  });
  it('writes the shown values with a BOM, quoting where needed', () => {
    const csv = toCsv({ A1: 'مرحبا', B1: '=1+1', A2: 'a,b', B2: 'say "x"' });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿مرحبا,2\r\n"a,b","say ""x"""\r\n');
  });
  it('round trips', () => {
    const cells = { A1: 'name', B1: 'qty', A2: 'tea', B2: '3' };
    expect(parseCsv(toCsv(cells)).cells).toEqual(cells);
  });
  it('flags data outside the sheet', () => {
    const wide = Array.from({ length: 30 }, (_, i) => i).join(',');
    expect(parseCsv(wide).clipped).toBe(true);
  });
});

describe('xlsx', () => {
  it('round trips values, formulas, text with symbols and Arabic', () => {
    const cells = { A1: 'الاسم', B1: 'الكمية', A2: 'شاي & <سكر>', B2: '3', A3: 'total', B3: '=SUM(B2:B2)*2', C1: 'TRUE' };
    const back = fromXlsx(toXlsx(cells, { rtl: true }));
    expect(back.cells).toEqual({ ...cells, C1: 'TRUE' });
  });
  it('measures the used area', () => {
    expect(extent({ B3: 'x', A1: '' })).toEqual({ rows: 3, cols: 2 });
  });
});
