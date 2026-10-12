import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { initNodeEnv } from '../test/node';
import { stubBrowserBits } from '../test/dom';
import { VidConvertTool, VidMergeTool, VidTrimTool } from './VideoTools';
import { VidInfoTool } from './VideoExtraTools';

const downloads: { bytes: Uint8Array; name: string }[] = [];
vi.mock('../lib/pdf', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/pdf')>();
  return { ...orig, downloadBytes: (bytes: Uint8Array, name: string) => downloads.push({ bytes, name }) };
});

// the engine is a 32 MB WebAssembly file: tests replace it and check what the pages ask of it
const runs: { args: string[]; ext: string }[] = [];
vi.mock('../lib/video/engine', () => ({
  engineCached: async () => false,
  cancelEngine: vi.fn(),
  readMeta: async () => ({ duration: 6, width: 640, height: 360 }),
  probeFile: async () => ({ duration: 6, width: 640, height: 360, hasAudio: true, fps: 25, videoCodec: 'h264', audioCodec: 'aac', bitrateKbps: 1200 }),
  runFfmpeg: async (files: File[], make: (i: string[], o: string) => string[], ext: string, onProgress?: (p: number) => void) => {
    runs.push({ args: make(files.map((_, i) => `in${i}.mp4`), `out.${ext}`), ext });
    onProgress?.(0.5);
    return new Uint8Array([1, 2, 3, 4]);
  },
}));

beforeAll(() => {
  initNodeEnv();
  stubBrowserBits();
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => undefined;
});
beforeEach(() => {
  downloads.length = 0;
  runs.length = 0;
  localStorage.setItem('shootcut:lang', 'en');
});
afterEach(cleanup);

const wrap = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);
const clip = (name = 'clip.mp4') => new File([new Uint8Array(100)], name, { type: 'video/mp4' });
const pick = (files: File[]) => fireEvent.change(document.querySelector('input[type=file]')!, { target: { files } });

describe('video tools', () => {
  it('converts a video and offers the download', async () => {
    wrap(<VidConvertTool />);
    expect(await screen.findByText(/downloads the video engine/)).toBeTruthy(); // said before the first job
    pick([clip()]);
    await screen.findByText(/640×360/);
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'webm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByText(/Done\./);
    expect(runs).toHaveLength(1);
    expect(runs[0].ext).toBe('webm');
    expect(runs[0].args.join(' ')).toContain('libvpx');
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(downloads[0].name).toBe('clip-converted.webm');
  });

  it('refuses a file that is not a video', async () => {
    wrap(<VidConvertTool />);
    pick([new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    await screen.findByText(/Only video files/);
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('trims only with a valid range', async () => {
    wrap(<VidTrimTool />);
    pick([clip()]);
    await screen.findByText(/640×360/);
    const start = screen.getByLabelText('Start at');
    const end = screen.getByLabelText('End at');
    fireEvent.change(start, { target: { value: '4' } });
    fireEvent.change(end, { target: { value: '2' } });
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(end, { target: { value: '5' } });
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByText(/Done\./);
    expect(runs[0].args).toContain('copy'); // fast mode by default
  });

  it('needs two videos to merge, and lets the order change', async () => {
    wrap(<VidMergeTool />);
    pick([clip('a.mp4')]);
    await screen.findByText(/at least two/);
    expect((screen.getByRole('button', { name: 'Merge' }) as HTMLButtonElement).disabled).toBe(true);
    pick([clip('b.mp4')]);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Merge' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]);
    const names = Array.from(document.querySelectorAll('.vid-file-name')).map((n) => n.textContent);
    expect(names).toEqual(['b.mp4', 'a.mp4']);
  });

  it('describes a video', async () => {
    wrap(<VidInfoTool />);
    pick([clip()]);
    await screen.findByText('h264');
    expect(screen.getByText('aac')).toBeTruthy();
    expect(screen.getByText('1200 kbps')).toBeTruthy();
  });
});
