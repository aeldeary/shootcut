import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { Header } from '../components/Shell';
import { initNodeEnv } from '../test/node';
import { makeFile, stubBrowserBits, upload } from '../test/dom';
import { forgetSaved, getSavedMeta } from '../lib/persist';
import { MergeTool } from './Merge';
import { OrganizeTool } from './Organize';
import { ShareTool } from './Share';

vi.mock('pdfjs-dist', async () => (await import('../test/dom')).legacyPdfjs());

beforeAll(() => {
  initNodeEnv();
  stubBrowserBits();
});
beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('shootcut:lang', 'en');
  await forgetSaved();
});
afterEach(cleanup);

const wrap = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

async function pdf(pages = 2) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 200]);
  return doc.save();
}

describe('the file follows the person between tools', () => {
  it('a file uploaded in Merge is there in Organize and in Share', async () => {
    const merge = wrap(<MergeTool />);
    upload([makeFile(await pdf(), 'from-merge.pdf')]);
    await screen.findByText('from-merge.pdf');
    await waitFor(async () => expect((await getSavedMeta())?.name).toBe('from-merge.pdf'));
    merge.unmount();

    const organize = wrap(<OrganizeTool />);
    expect(await screen.findByText('from-merge.pdf')).toBeTruthy();
    organize.unmount();

    wrap(<ShareTool />);
    expect(await screen.findByText('from-merge.pdf')).toBeTruthy();
  });

  it('Organize keeps its file for the other tools, and its delete button forgets it', async () => {
    wrap(<OrganizeTool />);
    upload([makeFile(await pdf(), 'org.pdf')]);
    await screen.findByText('org.pdf');
    await waitFor(async () => expect((await getSavedMeta())?.name).toBe('org.pdf'));
    fireEvent.click(await screen.findByRole('button', { name: /Delete the saved file/ }));
    await waitFor(async () => expect(await getSavedMeta()).toBeNull());
  });

  it('taking the kept file out of the Merge list deletes the saved copy', async () => {
    wrap(<MergeTool />);
    upload([makeFile(await pdf(), 'drop-me.pdf')]);
    await screen.findByText('drop-me.pdf');
    await waitFor(async () => expect(await getSavedMeta()).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(async () => expect(await getSavedMeta()).toBeNull());
  });

  it('adds the kept file once, not twice', async () => {
    const first = wrap(<MergeTool />);
    upload([makeFile(await pdf(), 'once.pdf')]);
    await screen.findByText('once.pdf');
    await waitFor(async () => expect(await getSavedMeta()).not.toBeNull());
    first.unmount();
    wrap(<MergeTool />);
    await screen.findByText('once.pdf');
    expect(screen.getAllByText('once.pdf')).toHaveLength(1);
  });
});

describe('tool bar', () => {
  it('shows the groups as headings and opens a menu with that group\'s tools', () => {
    wrap(<Header showBack activeId="organize" section="pdf" />);
    const nav = screen.getByRole('navigation', { name: 'All tools' });
    expect(nav.querySelectorAll('button')).toHaveLength(5);
    expect(nav.querySelectorAll('a')).toHaveLength(3); // the three sections
    const heading = screen.getByRole('button', { name: /Create/ });
    expect(heading.className).toContain('is-here');
    fireEvent.click(heading);
    const menu = screen.getByRole('menu');
    expect(menu.querySelector('a[href="#/merge"]')?.textContent).toContain('Merge');
    expect(menu.querySelector('[aria-current="page"]')?.textContent).toContain('Organize');
    expect(heading.getAttribute('aria-expanded')).toBe('true');
  });
  it('closes with Escape, with a second click and after picking a tool', () => {
    wrap(<Header showBack activeId="organize" section="pdf" />);
    const heading = screen.getByRole('button', { name: /Create/ });
    fireEvent.click(heading);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(heading);
    fireEvent.click(heading);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(heading);
    fireEvent.click(screen.getByRole('menuitem', { name: /Merge/ }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('the home page has no tool bar: its three section cards are the choice', () => {
    wrap(<Header showBack={false} />);
    expect(screen.queryByRole('navigation', { name: 'All tools' })).toBeNull();
  });
  it('inside the image section it shows the image groups, and the PDF section the PDF ones', () => {
    wrap(<Header showBack activeId="img-resize" section="image" />);
    const nav = screen.getByRole('navigation', { name: 'All tools' });
    expect(nav.querySelectorAll('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: /Optimize/ }).className).toContain('is-here');
    expect(nav.querySelector('a.is-here')?.getAttribute('href')).toBe('#/image');
  });
});
