import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { initNodeEnv } from '../test/node';
import { makeFile, stubBrowserBits, upload } from '../test/dom';
import { forgetSaved, getSavedMeta, loadSaved } from '../lib/persist';
import { ProtectTool } from './Protect';

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

async function samplePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 200]).drawText('Kept body', { x: 20, y: 100, size: 18, font });
  return doc.save();
}

describe('keeping the opened PDF on this device', () => {
  it('reopens the file in a tool opened later, without another upload', async () => {
    const first = wrap(<ProtectTool />);
    upload([makeFile(await samplePdf(), 'kept.pdf')]);
    await screen.findByText('kept.pdf');
    await waitFor(async () => expect((await getSavedMeta())?.name).toBe('kept.pdf'));
    first.unmount();

    wrap(<ProtectTool />); // another tool or tab: nothing is uploaded here
    expect(await screen.findByText('kept.pdf')).toBeTruthy();
  });

  it('deletes the saved copy and closes the file from the delete button', async () => {
    wrap(<ProtectTool />);
    upload([makeFile(await samplePdf(), 'gone.pdf')]);
    await screen.findByText('gone.pdf');
    fireEvent.click(await screen.findByRole('button', { name: /Delete the saved file/ }));
    await waitFor(() => expect(screen.queryByText('gone.pdf')).toBeNull());
    expect(await loadSaved()).toBeNull();
  });

  it('does not keep the file when the switch is off', async () => {
    wrap(<ProtectTool />);
    upload([makeFile(await samplePdf(), 'private.pdf')]);
    await screen.findByText('private.pdf');
    await waitFor(async () => expect(await getSavedMeta()).not.toBeNull());
    fireEvent.click(screen.getByLabelText('Keep this file on this device'));
    await waitFor(async () => expect(await getSavedMeta()).toBeNull());
    expect(screen.queryByRole('button', { name: /Delete the saved file/ })).toBeNull();
  });
});
