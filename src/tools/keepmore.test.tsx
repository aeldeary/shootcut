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
  localStorage.setItem('shootcut:keep', '1');
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
  const nav = () => screen.getByRole('navigation', { name: 'All tools' });
  it('has three menus at most: the section, its tools and its full programs', () => {
    wrap(<Header showBack activeId="organize" section="pdf" />);
    // the PDF section has no full programs of its own, so two menus
    expect(nav().querySelectorAll('button')).toHaveLength(2);
    expect(nav().querySelectorAll('a')).toHaveLength(0);
    const tools = screen.getByRole('button', { name: /Tools/ });
    expect(tools.className).toContain('is-here');
    fireEvent.click(tools);
    const menu = screen.getByRole('menu');
    expect(tools.getAttribute('aria-expanded')).toBe('true');
    // every group is one column of the same panel, and the open tool is marked
    expect(menu.querySelectorAll('[role=group]').length).toBeGreaterThan(3);
    expect(menu.querySelector('[aria-current="page"]')?.textContent).toContain('Organize');
    expect(menu.querySelector('a[href="#/merge"]')?.textContent).toContain('Merge');
  });
  it('the section menu moves to another section', () => {
    wrap(<Header showBack activeId="img-resize" section="image" />);
    fireEvent.click(nav().querySelector('.toolnav-section')!);
    const menu = screen.getByRole('menu');
    expect(menu.querySelectorAll('a')).toHaveLength(4);
    expect(menu.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('#/image');
  });
  it('the full programs menu lists the programs of the section', () => {
    wrap(<Header showBack activeId="img-resize" section="image" />);
    expect(nav().querySelectorAll('button')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /Full programs/ }));
    expect(screen.getByRole('menu').querySelector('a[href="#/studio/design"]')).toBeTruthy();
  });
  it('closes with Escape, with a second click and after picking a tool', () => {
    wrap(<Header showBack activeId="organize" section="pdf" />);
    const tools = screen.getByRole('button', { name: /Tools/ });
    fireEvent.click(tools);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(tools);
    fireEvent.click(tools);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(tools);
    fireEvent.click(screen.getByRole('menuitem', { name: /Merge/ }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
  it('the home page has no tool bar: its section cards are the choice', () => {
    wrap(<Header showBack={false} />);
    expect(screen.queryByRole('navigation', { name: 'All tools' })).toBeNull();
  });
});
