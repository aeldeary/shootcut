// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { atempoChain, audioArgs, compressArgs, cropRect, even, formatTime, gifArgs, mergeArgs, parseInfo, parseTime, speedArgs, targetBitrateKbps, trimArgs } from './args';

describe('video arguments', () => {
  it('rounds to even sizes', () => {
    expect(even(721)).toBe(722);
    expect(even(1)).toBe(2);
  });
  it('reads times in several spellings', () => {
    expect(parseTime('1:23.5')).toBe(83.5);
    expect(parseTime('00:01:23')).toBe(83);
    expect(parseTime('12')).toBe(12);
    expect(parseTime('1,5')).toBe(1.5);
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('')).toBeNull();
  });
  it('formats times', () => {
    expect(formatTime(83.5)).toBe('1:23.5');
    expect(formatTime(3725)).toBe('1:02:05.0');
  });
  it('chains atempo for big speed changes', () => {
    expect(atempoChain(1.5)).toBe('atempo=1.5');
    expect(atempoChain(4)).toBe('atempo=2,atempo=2');
    expect(atempoChain(0.25)).toBe('atempo=0.5,atempo=0.5');
  });
  it('speeds up with sound kept in step', () => {
    const a = speedArgs('in.mp4', 'out.mp4', 2, true, 'mp4').join(' ');
    expect(a).toContain('setpts=PTS/2');
    expect(a).toContain('atempo=2');
    expect(speedArgs('in.mp4', 'out.mp4', 2, false, 'mp4')).not.toContain('-c:a');
  });
  it('aims at a size', () => {
    const v = targetBitrateKbps(10, 100, 128, true);
    expect(v).toBeGreaterThan(600);
    expect(v).toBeLessThan(700);
    expect(targetBitrateKbps(1, 0, 128, true)).toBe(0);
  });
  it('only shrinks, never enlarges, when limiting height', () => {
    const o = { crf: 28, maxHeight: 720, audioKbps: 96, mute: false, targetMb: null };
    expect(compressArgs('i.mp4', 'o.mp4', o, { duration: 10, width: 1920, height: 1080, hasAudio: true }).join(' ')).toContain('scale=-2:720');
    expect(compressArgs('i.mp4', 'o.mp4', o, { duration: 10, width: 640, height: 360, hasAudio: true }).join(' ')).not.toContain('scale=');
    expect(compressArgs('i.mp4', 'o.mp4', { ...o, targetMb: 5 }, { duration: 10, width: 640, height: 360, hasAudio: true }).join(' ')).toContain('-b:v');
  });
  it('trims fast or precisely', () => {
    expect(trimArgs('i.mp4', 'o.mp4', 5, 10, true, 'mp4')).toContain('copy');
    const p = trimArgs('i.mp4', 'o.mp4', 5, 10, false, 'mp4');
    expect(p).toContain('libx264');
    expect(p[p.indexOf('-t') + 1]).toBe('5');
  });
  it('merges with matching sizes and drops sound when one clip has none', () => {
    const withSound = mergeArgs(['a.mp4', 'b.mp4'], 'o.mp4', { width: 1281, height: 720 }, true, 'mp4').join(' ');
    expect(withSound).toContain('scale=1282:720');
    expect(withSound).toContain('concat=n=2:v=1:a=1');
    const silent = mergeArgs(['a.mp4', 'b.mp4'], 'o.mp4', { width: 1280, height: 720 }, false, 'mp4').join(' ');
    expect(silent).toContain('a=0');
    expect(silent).toContain('-an');
  });
  it('finds the biggest crop of a ratio', () => {
    expect(cropRect(1920, 1080, 1)).toEqual({ x: 420, y: 0, w: 1080, h: 1080 });
    expect(cropRect(1920, 1080, 9 / 16)).toEqual({ x: 656, y: 0, w: 608, h: 1080 });
    expect(cropRect(1080, 1920, 16 / 9)).toEqual({ x: 0, y: 656, w: 1080, h: 608 });
    expect(cropRect(1920, 1080, 1, 0, 0).x).toBe(0);
    expect(cropRect(1920, 1080, 1, 1, 0).x).toBe(840);
  });
  it('builds audio and gif commands', () => {
    expect(audioArgs('i.mp4', 'o.mp3', 'mp3', 192).join(' ')).toContain('libmp3lame -b:a 192k');
    expect(audioArgs('i.mp4', 'o.wav', 'wav', 192)).not.toContain('-b:a');
    expect(gifArgs('i.mp4', 'o.gif', { start: 1, duration: 3, fps: 12, width: 480 }).join(' ')).toContain('palettegen');
  });
  it("reads FFmpeg's description of a file", () => {
    const log = `Input #0, mov,mp4, from 'in.mp4':
  Duration: 00:01:05.50, start: 0.000000, bitrate: 1200 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1280x720 [SAR 1:1 DAR 16:9], 1100 kb/s, 29.97 fps, 30 tbr
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6D703461), 44100 Hz, stereo, fltp, 96 kb/s`;
    expect(parseInfo(log)).toMatchObject({ duration: 65.5, width: 1280, height: 720, fps: 29.97, videoCodec: 'h264', audioCodec: 'aac', hasAudio: true, bitrateKbps: 1200 });
    expect(parseInfo('Stream #0:0: Video: vp9, yuv420p, 640x360, 30 fps').hasAudio).toBe(false);
  });
});
