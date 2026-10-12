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
    expect(screen.getByRole('note')).toBeTruthy();
  });

  it('the launcher frames the built app with the right sandbox and credit', async () => {
    stubFetchPublished();
    const studio = findStudio('docs')!;
    wrap(<StudioLauncher studio={studio} app={studio.apps[0]} />);
    const frame = document.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe('./studio/word/index.html');
    expect(frame.getAttribute('sandbox')).toContain('allow-same-origin');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(document.querySelector('iframe')!.getAttribute('src')).toBe('./studio/word/index.html?webgl');
    // no source names anywhere on the launcher
    expect(document.body.textContent).not.toMatch(/storytold|craft/i);
  });
});
