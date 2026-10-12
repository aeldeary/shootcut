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

describe('kept pictures and videos', () => {
  it('keeps the list of files, gives the same bytes back, and deletes them', async () => {
    const { saveMedia, loadMedia, getMediaMeta, forgetMedia } = await import('./persist');
    await forgetMedia('image');
    expect(await loadMedia('image')).toEqual([]);
    const a = new File(['aaa'], 'a.png', { type: 'image/png' });
    const b = new File(['bbbb'], 'b.jpg', { type: 'image/jpeg' });
    await saveMedia('image', [a, b]);
    const back = await loadMedia('image');
    expect(back.map((f) => f.name)).toEqual(['a.png', 'b.jpg']);
    expect(await back[1].text()).toBe('bbbb');
    expect(await getMediaMeta('image')).toMatchObject({ count: 2 });
    expect(await loadMedia('video')).toEqual([]); // separate from videos
    await forgetMedia('image');
    expect(await loadMedia('image')).toEqual([]);
  });

  it('switching keeping off deletes kept pictures and videos too', async () => {
    const { saveMedia, loadMedia } = await import('./persist');
    await saveMedia('video', [new File(['v'], 'v.mp4', { type: 'video/mp4' })]);
    await setKeepEnabled(false);
    expect(await loadMedia('video')).toEqual([]);
    await setKeepEnabled(true);
  });
});
