// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Sheet, SheetError, colIndex, colName, display, normalizeInput, parseKey, type Cells } from './engine';

const v = (cells: Cells, key: string) => display(new Sheet(cells).get(key));

describe('references', () => {
  it('names columns and reads keys', () => {
    expect(colName(0)).toBe('A');
    expect(colName(25)).toBe('Z');
    expect(colName(26)).toBe('AA');
    expect(colIndex('AA')).toBe(26);
    expect(parseKey('$B$12')).toEqual({ c: 1, r: 11 });
    expect(parseKey('12B')).toBeNull();
  });
});

describe('formulas', () => {
  it('does arithmetic with precedence', () => {
    expect(v({ A1: '=1+2*3' }, 'A1')).toBe('7');
    expect(v({ A1: '=(1+2)*3' }, 'A1')).toBe('9');
    expect(v({ A1: '=2^3^2' }, 'A1')).toBe('512');
    expect(v({ A1: '=-2^2' }, 'A1')).toBe('4'); // like a spreadsheet: unary minus binds first
    expect(v({ A1: '=50%' }, 'A1')).toBe('0.5');
  });
  it('reads cells and ranges', () => {
    const c = { A1: '10', A2: '20', A3: '30', B1: '=SUM(A1:A3)', B2: '=AVERAGE(A1:A3)', B3: '=MAX(A1:A3)-MIN(A1:A3)', B4: '=A1+A2' };
    expect(v(c, 'B1')).toBe('60');
    expect(v(c, 'B2')).toBe('20');
    expect(v(c, 'B3')).toBe('20');
    expect(v(c, 'B4')).toBe('30');
  });
  it('ignores text and blanks inside ranges but not direct text', () => {
    const c = { A1: '5', A2: 'x', A4: '7', B1: '=SUM(A1:A4)', B2: '=COUNT(A1:A4)', B3: '=COUNTA(A1:A4)', B4: '=A2+1' };
    expect(v(c, 'B1')).toBe('12');
    expect(v(c, 'B2')).toBe('2');
    expect(v(c, 'B3')).toBe('3');
    expect(v(c, 'B4')).toBe('#VALUE!');
  });
  it('supports IF, comparisons and text', () => {
    expect(v({ A1: '5', B1: '=IF(A1>3,"big","small")' }, 'B1')).toBe('big');
    expect(v({ A1: '=1=1' }, 'A1')).toBe('TRUE');
    expect(v({ A1: '="a"&"b"&1' }, 'A1')).toBe('ab1');
    expect(v({ A1: '=UPPER("abc")&LEN("xyz")' }, 'A1')).toBe('ABC3');
    expect(v({ A1: '=AND(1>0,2>1)' }, 'A1')).toBe('TRUE');
  });
  it('rounds half away from zero', () => {
    expect(v({ A1: '=ROUND(2.5)' }, 'A1')).toBe('3');
    expect(v({ A1: '=ROUND(-2.5)' }, 'A1')).toBe('-3');
    expect(v({ A1: '=ROUND(3.14159,2)' }, 'A1')).toBe('3.14');
  });
  it('SUMIF and COUNTIF', () => {
    const c = { A1: 'a', A2: 'b', A3: 'a', B1: '1', B2: '2', B3: '4', C1: '=SUMIF(A1:A3,"a",B1:B3)', C2: '=COUNTIF(B1:B3,">1")' };
    expect(v(c, 'C1')).toBe('5');
    expect(v(c, 'C2')).toBe('2');
  });
  it('reports errors instead of throwing', () => {
    expect(v({ A1: '=1/0' }, 'A1')).toBe('#DIV/0!');
    expect(v({ A1: '=FOO(1)' }, 'A1')).toBe('#NAME?');
    expect(v({ A1: '=1+' }, 'A1')).toBe('#ERROR!');
    expect(v({ A1: '=ZZZ' }, 'A1')).toBe('#NAME?');
    expect(v({ A1: '=A2', A2: '=1/0' }, 'A1')).toBe('#DIV/0!');
  });
  it('detects circular references', () => {
    expect(v({ A1: '=B1', B1: '=A1' }, 'A1')).toBe('#CIRC!');
    expect(v({ A1: '=A1+1' }, 'A1')).toBe('#CIRC!');
  });
  it('accepts Arabic digits and separators', () => {
    expect(normalizeInput('=SUM(١٫٥؛٢)')).toBe('=SUM(1.5;2)');
    expect(v({ A1: '=SUM(١٫٥؛٢)' }, 'A1')).toBe('3.5');
    expect(v({ A1: '٣', B1: '=A1*٢' }, 'B1')).toBe('6');
    expect(v({ A1: '="٣"' }, 'A1')).toBe('٣'); // text in quotes stays as typed
  });
  it('cell text that looks like a number is a number', () => {
    expect(new Sheet({ A1: '12.5' }).get('A1')).toBe(12.5);
    expect(new Sheet({ A1: '12%' }).get('A1')).toBe(0.12);
    expect(new Sheet({ A1: 'abc' }).get('A1')).toBe('abc');
    expect(new SheetError('#REF!').toString()).toBe('#REF!');
  });
});
