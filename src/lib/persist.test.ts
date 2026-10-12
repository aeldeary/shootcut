import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetSaved, getSavedMeta, isKeepEnabled, loadSaved, saveFile, setKeepEnabled, subscribe } from './persist';

const pdf = (name: string, text = '%PDF-1.7 hello') => new File([text], name, { type: 'application/pdf' });

beforeEach(async () => {
  localStorage.clear();
  await forgetSaved();
});

describe('kept file', () => {
  it('saves a file and gives the same bytes back', async () => {
    expect(await loadSaved()).toBeNull();
    expect(await saveFile(pdf('a.pdf', '%PDF-1.7 abc'))).toBe(true);
    const back = await loadSaved();
    expect(back?.name).toBe('a.pdf');
    expect(await back!.text()).toBe('%PDF-1.7 abc');
    expect(await getSavedMeta()).toMatchObject({ name: 'a.pdf', size: 12 });
  });

  it('keeps only the latest file', async () => {
    await saveFile(pdf('a.pdf'));
    await saveFile(pdf('b.pdf'));
    expect((await loadSaved())?.name).toBe('b.pdf');
  });

  it('deletes the saved copy', async () => {
    await saveFile(pdf('a.pdf'));
    await forgetSaved();
    expect(await loadSaved()).toBeNull();
    expect(await getSavedMeta()).toBeNull();
  });

  it('stops saving, and deletes what was saved, when keeping is switched off', async () => {
    await saveFile(pdf('a.pdf'));
    await setKeepEnabled(false);
    expect(isKeepEnabled()).toBe(false);
    expect(await loadSaved()).toBeNull();
    expect(await saveFile(pdf('b.pdf'))).toBe(false);
    expect(await loadSaved()).toBeNull();
    await setKeepEnabled(true);
    expect(await saveFile(pdf('b.pdf'))).toBe(true);
  });

  it('tells listeners about every change', async () => {
    const seen = vi.fn();
    const off = subscribe(seen);
    await saveFile(pdf('a.pdf'));
    await forgetSaved();
    off();
    await saveFile(pdf('b.pdf'));
    expect(seen).toHaveBeenCalledTimes(2);
  });
});
