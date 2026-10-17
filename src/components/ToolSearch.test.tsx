import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { SEARCH_LIMIT, ToolSearch } from './ToolSearch';

const open = (lang: 'ar' | 'en') => {
  localStorage.setItem('shootcut:lang', lang);
  render(
    <I18nProvider>
      <ToolSearch />
    </I18nProvider>,
  );
  return screen.getByRole('searchbox') as HTMLInputElement;
};
const type = (box: HTMLInputElement, value: string) => fireEvent.change(box, { target: { value } });
const hrefs = () => [...document.querySelectorAll('.search-results a')].map((a) => a.getAttribute('href'));

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('ToolSearch', () => {
  it('shows nothing until something is typed', () => {
    open('en');
    expect(document.querySelector('.search-results')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('finds tools by what the person wants to do, in English', () => {
    const box = open('en');
    type(box, 'merge');
    expect(hrefs()).toContain('#/merge');
    expect(screen.getByRole('status').textContent).toMatch(/results/);
  });

  it('finds tools in Arabic, with the article, and also from an English word on the Arabic site', () => {
    const box = open('ar');
    type(box, 'الدمج');
    expect(hrefs()).toContain('#/merge');
    type(box, 'merge');
    expect(hrefs()).toContain('#/merge');
    type(box, 'ضغط');
    expect(hrefs()).toEqual(expect.arrayContaining(['#/img-compress', '#/vid-compress']));
  });

  it('finds a studio too', () => {
    const box = open('en');
    type(box, 'engineering');
    expect(hrefs()).toContain('#/studio/cad');
  });

  it('says so when nothing matches, and clears with the button or Escape', () => {
    const box = open('en');
    type(box, 'qqqzzz');
    expect(screen.getByRole('status').textContent).toContain('qqqzzz');
    expect(document.querySelector('.search-results')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /clear the search/i }));
    expect(box.value).toBe('');
    type(box, 'merge');
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.value).toBe('');
  });

  it('opens the first result on Enter', () => {
    const box = open('en');
    type(box, 'merge');
    const first = hrefs()[0]!;
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(window.location.hash).toBe(first);
  });

  it('lists a limited number and asks for another word when there are more', () => {
    const box = open('en');
    type(box, 'pdf');
    expect(hrefs().length).toBe(SEARCH_LIMIT);
    expect(screen.getByRole('status').textContent).toContain(String(SEARCH_LIMIT));
  });
});
