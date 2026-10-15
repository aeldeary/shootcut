import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { StudioPage, StudiosBlock, StudioLauncher } from './Studios';
import { findStudio } from '../lib/studios';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const wrap = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

function stubFetchPublished() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const id = /studio\/(\w+)\//.exec(url)![1];
      const repo = { word: 'wordcraft', grid: 'gridcraft' }[id as 'word' | 'grid'];
      return repo ? new Response(JSON.stringify({ repo, sha: 'abcdef123', builtAt: 't', wasmBytes: 13_400_000 })) : new Response('', { status: 404 });
    }),
  );
}

describe('Studios', () => {
  it('shows the five studios on the home page', () => {
    wrap(<StudiosBlock />);
    expect(document.querySelectorAll('[data-studio]').length).toBe(5);
    expect(screen.getByText('Design')).toBeTruthy();
  });

  it('keeps the PDF editions out of the Studios block and offers Full or Light first, with the PDF tools as the light edition', () => {
    wrap(<StudiosBlock />);
    expect(document.querySelector('[data-studio=pdf]')).toBeNull();
    cleanup();
    stubFetchPublished();
    wrap(<StudioPage studio={findStudio('pdf')!} lightContent={<p data-testid="pdf-tools">tools</p>} />);
    expect(document.querySelector('[data-version=full]')).toBeTruthy();
    expect(screen.queryByTestId('pdf-tools')).toBeNull();
    fireEvent.click(document.querySelector('[data-version=light]')!);
    expect(screen.getByTestId('pdf-tools')).toBeTruthy();
    fireEvent.click(screen.getByText(/change version|تغيير النسخة/i));
    fireEvent.click(document.querySelector('[data-version=full]')!);
    expect(document.querySelectorAll('[data-app]').length).toBe(1);
  });

  it('asks for full or light before showing anything to open', async () => {
    stubFetchPublished();
    wrap(<StudioPage studio={findStudio('docs')!} />);
    expect(document.querySelector('[data-version=full]')).toBeTruthy();
    expect(document.querySelector('[data-version=light]')).toBeTruthy();
    expect(document.querySelector('[data-app]')).toBeNull();
    fireEvent.click(document.querySelector('[data-version=full]')!);
    expect(document.querySelectorAll('[data-app]').length).toBe(3);
    await waitFor(() => expect(document.querySelectorAll('a[href="#/studio/docs/word"]').length).toBe(1));
    // Deck is not published in this stub: its button stays disabled
    const deck = document.querySelector('[data-app=deck] button') as HTMLButtonElement;
    expect(deck.disabled).toBe(true);
  });

  it('light version lists ready Shootcut tools', () => {
    wrap(<StudioPage studio={findStudio('cad')!} />);
    fireEvent.click(document.querySelector('[data-version=light]')!);
    expect(document.querySelector('[data-app]')).toBeNull();
    expect(document.querySelectorAll('a.card[href="#/cad"]').length).toBe(1);
    cleanup();
    wrap(<StudioPage studio={findStudio('design')!} />);
    fireEvent.click(document.querySelector('[data-version=light]')!);
    expect(document.querySelectorAll('a.card[href^="#/img-"]').length).toBeGreaterThan(3);
  });

  it('recommends light on a phone and warns', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }));
    wrap(<StudioPage studio={findStudio('docs')!} />);
    expect(document.querySelector('[data-version=light] .tag-new')).toBeTruthy();
    expect(document.querySelector('[data-version=full] .tag-new')).toBeNull();
    expect(screen.getAllByRole('note').length).toBeGreaterThan(0);
  });

  it('without WebGL it recommends the light version and offers it', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    wrap(<StudioPage studio={findStudio('docs')!} />);
    expect(document.querySelector('[data-version=light] .tag-new')).toBeTruthy();
    expect(document.querySelector('[data-version=full] .tag-new')).toBeNull();
    expect(screen.getAllByRole('button', { name: /light version|النسخة الخفيفة/i }).length).toBeGreaterThan(1);
  });

  it('the full-screen advice names the shortcuts of the program that is open', () => {
    stubFetchPublished();
    const photo = findStudio('design')!;
    wrap(<StudioLauncher studio={photo} app={photo.apps.find((a) => a.id === 'photo')!} />);
    expect(document.querySelector('.fs-callout')!.textContent).toContain('Free Transform');
    cleanup();
    const cad = findStudio('cad')!;
    wrap(<StudioLauncher studio={cad} app={cad.apps[0]} />);
    expect(document.querySelector('.fs-callout')!.textContent).not.toContain('Free Transform');
    expect(document.querySelector('.fs-callout')!.textContent).toContain('new drawing');
  });

  it('the untranslated studios open in English and have no language menu', async () => {
    stubFetchPublished();
    const studio = findStudio('film')!;
    wrap(<StudioLauncher studio={studio} app={studio.apps[0]} />);
    expect(document.querySelector('iframe')!.getAttribute('src')).toContain('lang=en');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('the launcher frames the built app with the right sandbox and credit', async () => {
    stubFetchPublished();
    const studio = findStudio('docs')!;
    wrap(<StudioLauncher studio={studio} app={studio.apps[0]} />);
    const frame = document.querySelector('iframe')!;
    // compatibility mode (WebGL) is on by default; the box turns it off
    expect(frame.getAttribute('src')).toBe('./studio/word/index.html?lang=en&webgl');
    expect(frame.getAttribute('sandbox')).toContain('allow-same-origin');
    // the person picks the program's language: it follows, and is remembered
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ar' } });
    expect(document.querySelector('iframe')!.getAttribute('src')).toBe('./studio/word/index.html?lang=ar&webgl');
    expect(localStorage.getItem('shootcut-program-lang')).toBe('ar');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'site' } });
    expect(localStorage.getItem('shootcut-program-lang')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(document.querySelector('iframe')!.getAttribute('src')).toBe('./studio/word/index.html?lang=en');
    // no source names anywhere on the launcher
    expect(document.body.textContent).not.toMatch(/storytold|craft/i);
  });
});
