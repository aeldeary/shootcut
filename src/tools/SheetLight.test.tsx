import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import SheetLight from './SheetLight';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const type = (cell: string, text: string) => {
  fireEvent.mouseDown(document.querySelector(`[data-cell=${cell}]`)!);
  const bar = screen.getByLabelText('Cell content') as HTMLInputElement;
  fireEvent.change(bar, { target: { value: text } });
  fireEvent.keyDown(bar, { key: 'Enter' });
};
const shown = (cell: string) => document.querySelector(`[data-cell=${cell}]`)!.textContent;

describe('light spreadsheet', () => {
  it('computes formulas from typed cells and moves down on Enter', () => {
    render(<I18nProvider><SheetLight /></I18nProvider>);
    type('A1', '10');
    type('A2', '32');
    type('A3', '=SUM(A1:A2)');
    expect(shown('A3')).toBe('42');
    // the cell below the last edit is now selected
    expect(document.querySelector('[data-cell=A4]')!.getAttribute('aria-selected')).toBe('true');
    type('A1', '20');
    expect(shown('A3')).toBe('52');
  });
  it('shows errors and keeps the formula text in the bar', () => {
    render(<I18nProvider><SheetLight /></I18nProvider>);
    type('B1', '=1/0');
    expect(shown('B1')).toBe('#DIV/0!');
    fireEvent.mouseDown(document.querySelector('[data-cell=B1]')!);
    expect((screen.getByLabelText('Cell content') as HTMLInputElement).value).toBe('=1/0');
  });
  it('saves as you type', () => {
    render(<I18nProvider><SheetLight /></I18nProvider>);
    type('C1', 'hello');
    expect(JSON.parse(localStorage.getItem('shootcut:sheet')!)).toEqual({ C1: 'hello' });
  });
  it('typing on a selected cell starts an entry, Delete clears it', () => {
    render(<I18nProvider><SheetLight /></I18nProvider>);
    type('A1', '5');
    fireEvent.mouseDown(document.querySelector('[data-cell=A1]')!);
    fireEvent.keyDown(screen.getByTestId('sheet-grid'), { key: 'Delete' });
    expect(shown('A1')).toBe('');
  });
});
