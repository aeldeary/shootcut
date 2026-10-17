import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { I18nProvider } from './i18n';
import App from './App';

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

beforeEach(() => {
  localStorage.setItem('shootcut:lang', 'en');
  window.location.hash = '';
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('the home page', () => {
  it('is a search box, four sections and a short list of what is new, and nothing else', () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    expect(document.querySelector('#tool-search')).toBeTruthy();
    expect(document.querySelectorAll('nav.sections a.section-card').length).toBe(4);
    expect(document.querySelector('[data-studio]')).toBeNull();
    expect(document.querySelector('.features-banner')).toBeNull();
    expect(document.querySelectorAll('.whats-new li').length).toBe(3);
    // the Features page stays one click away in the header
    expect(document.querySelector('a.nav-features[href="#/features"]')).toBeTruthy();
  });

  it('puts the studios at the end of the section they belong to', async () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    go('#/video');
    await waitFor(() => expect(document.querySelectorAll('[data-studio]').length).toBe(2));
    go('#/image');
    await waitFor(() => expect(document.querySelectorAll('[data-studio]').length).toBe(1));
    go('#/office');
    await waitFor(() => expect(document.querySelectorAll('[data-studio]').length).toBe(2));
  });

  it('keeps the section marked on a studio page, so the person always knows where they are', async () => {
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    go('#/studio/film');
    await waitFor(() => expect(document.querySelector('.toolnav-sec.is-here')?.textContent).toBe('Video & audio'));
    go('#/studio/cad');
    await waitFor(() => expect(document.querySelector('.toolnav-sec.is-here')?.textContent).toBe('Sheets & slides'));
  });

  it('splits the PDF tools into creating and organizing pages', async () => {
    localStorage.setItem('shootcut-edition', 'light');
    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );
    go('#/pdf');
    await waitFor(() => expect(document.querySelector('#g-pages')).toBeTruthy());
    expect(document.querySelector('#g-create')!.textContent).toBe('Create & convert');
    expect(document.querySelector('#g-pages')!.textContent).toBe('Organize pages');
    expect(document.querySelector('#g-create')!.parentElement!.querySelector('a[href="#/merge"]')).toBeTruthy();
    expect(document.querySelector('#g-pages')!.parentElement!.querySelector('a[href="#/organize"]')).toBeTruthy();
  });
});
