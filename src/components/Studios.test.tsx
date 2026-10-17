import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { StudioPage, SectionStudios, StudioLauncher } from './Studios';
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

/** A browser that can draw WebGL and is not a phone: the full edition is the recommended one. */
function stubDesktop() {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ getExtension: () => null, getParameter: () => '' } as never);
}

const pressed = (v: 'full' | 'light') => document.querySelector(`[data-version=${v}]`)!.getAttribute('aria-pressed') === 'true';

describe('Studios', () => {
  it('offers each studio inside the section it belongs to, and none on the PDF section', () => {
    const count = (section: 'pdf' | 'image' | 'video' | 'office') => {
      wrap(<SectionStudios section={section} />);
      const n = document.querySelectorAll('[data-studio]').length;
      cleanup();
      return n;
    };
    expect(count('image')).toBe(1);
    expect(count('video')).toBe(2);
    expect(count('office')).toBe(2);
    expect(count('pdf')).toBe(0);
    wrap(<SectionStudios section="image" />);
    expect(screen.getByText('Design')).toBeTruthy();
  });

  it('opens the PDF page on the recommended edition at once, keeps a switch, and remembers the choice', () => {
    stubDesktop();
    wrap(<StudioPage studio={findStudio('pdf')!} lightContent={<p data-testid="pdf-tools">tools</p>} />);
    // no waiting screen: the full edition is already showing, and the switch is there
    expect(pressed('full')).toBe(true);
    expect(document.querySelectorAll('[data-app]').length).toBe(1);
    expect(screen.queryByTestId('pdf-tools')).toBeNull();
    fireEvent.click(document.querySelector('[data-version=light]')!);
    expect(pressed('light')).toBe(true);
    expect(screen.getByTestId('pdf-tools')).toBeTruthy();
    expect(localStorage.getItem('shootcut-edition')).toBe('light');
    // the next visit opens on the edition the person chose, not on the recommendation
    cleanup();
    wrap(<StudioPage studio={findStudio('pdf')!} lightContent={<p data-testid="pdf-tools">tools</p>} />);
    expect(pressed('light')).toBe(true);
    expect(screen.getByTestId('pdf-tools')).toBeTruthy();
    fireEvent.click(document.querySelector('[data-version=full]')!);
    expect(document.querySelectorAll('[data-app]').length).toBe(1);
  });

  it('shows the apps of a studio without asking anything first', async () => {
    stubDesktop();
    stubFetchPublished();
    wrap(<StudioPage studio={findStudio('docs')!} />);
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

  it('recommends light on a phone, and warns only if the full edition is picked', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }));
    wrap(<StudioPage studio={findStudio('docs')!} />);
    expect(pressed('light')).toBe(true);
    expect(document.querySelector('[data-version=light] .tag-new')).toBeTruthy();
    expect(document.querySelector('[data-version=full] .tag-new')).toBeNull();
    expect(screen.queryAllByRole('note').length).toBe(0);
    fireEvent.click(document.querySelector('[data-version=full]')!);
    expect(screen.getAllByRole('note').length).toBeGreaterThan(0);
  });

  it('without WebGL it opens on the light version and offers it again if full is picked', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    wrap(<StudioPage studio={findStudio('docs')!} />);
    expect(pressed('light')).toBe(true);
    expect(document.querySelector('[data-version=light] .tag-new')).toBeTruthy();
    expect(document.querySelector('[data-version=full] .tag-new')).toBeNull();
    fireEvent.click(document.querySelector('[data-version=full]')!);
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
