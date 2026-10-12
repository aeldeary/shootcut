/** Pure builders for the FFmpeg command lines of the video tools (tested without running FFmpeg). */

export interface VideoInfo {
  duration: number; // seconds
  width: number;
  height: number;
  hasAudio?: boolean;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  bitrateKbps?: number;
}

export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'mkv';
export type AudioFormat = 'mp3' | 'm4a' | 'wav' | 'ogg' | 'flac';

export const VIDEO_MIME: Record<VideoFormat, string> = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska' };
export const AUDIO_MIME: Record<AudioFormat, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac' };

/** Even numbers only: H.264 and VP9 need even width and height. */
export const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

/** Codec options for an output container. `crf` is quality (lower = better); WebM uses VP8, the rest H.264. */
export function codecArgs(format: VideoFormat, crf = 23, audio = true, audioKbps = 128): string[] {
  const a = audio ? (format === 'webm' ? ['-c:a', 'libopus', '-b:a', `${audioKbps}k`] : ['-c:a', 'aac', '-b:a', `${audioKbps}k`]) : ['-an'];
  if (format === 'webm') {
    // VP8, not VP9: the VP9 encoder in the WebAssembly build crashes (checked in Chromium); VP8 works
    return ['-c:v', 'libvpx', '-crf', String(Math.max(4, Math.round(crf * 0.5))), '-b:v', '2M', '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p', ...a];
  }
  const web = format === 'mp4' || format === 'mov' ? ['-movflags', '+faststart'] : [];
  return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p', ...a, ...web];
}

export function convertArgs(input: string, output: string, format: VideoFormat, mute: boolean): string[] {
  return ['-i', input, ...codecArgs(format, 23, !mute), output];
}

/** Platform presets for compression: the largest side allowed and the quality that fits typical limits. */
export interface CompressPreset {
  id: 'whatsapp' | 'instagram' | 'tiktok' | 'x' | 'email' | 'custom';
  maxHeight: number | null;
  crf: number;
  audioKbps: number;
  /** a size limit the service enforces, MB */
  limitMb?: number;
}
export const COMPRESS_PRESETS: CompressPreset[] = [
  { id: 'whatsapp', maxHeight: 720, crf: 28, audioKbps: 96, limitMb: 16 },
  { id: 'instagram', maxHeight: 1080, crf: 26, audioKbps: 128 },
  { id: 'tiktok', maxHeight: 1080, crf: 26, audioKbps: 128 },
  { id: 'x', maxHeight: 720, crf: 27, audioKbps: 128 },
  { id: 'email', maxHeight: 480, crf: 30, audioKbps: 96, limitMb: 20 },
  { id: 'custom', maxHeight: null, crf: 28, audioKbps: 128 },
];

/** Video bitrate (kbit/s) that makes the file about `targetMb`, after leaving room for the sound. */
export function targetBitrateKbps(targetMb: number, durationSec: number, audioKbps: number, hasAudio: boolean): number {
  if (!(durationSec > 0)) return 0;
  const totalKbps = (targetMb * 8 * 1024 * 0.95) / durationSec; // 5% for the container
  return Math.max(50, Math.floor(totalKbps - (hasAudio ? audioKbps : 0)));
}

export interface CompressOptions {
  crf: number;
  maxHeight: number | null;
  audioKbps: number;
  mute: boolean;
  /** when set, aim for this size instead of a fixed quality */
  targetMb: number | null;
}
export function compressArgs(input: string, output: string, o: CompressOptions, info: VideoInfo): string[] {
  const vf = o.maxHeight && info.height > o.maxHeight ? ['-vf', `scale=-2:${o.maxHeight}`] : [];
  const audio = o.mute || info.hasAudio === false ? ['-an'] : ['-c:a', 'aac', '-b:a', `${o.audioKbps}k`];
  const quality =
    o.targetMb && info.duration > 0
      ? (() => {
          const v = targetBitrateKbps(o.targetMb, info.duration, o.audioKbps, !o.mute && info.hasAudio !== false);
          return ['-b:v', `${v}k`, '-maxrate', `${Math.round(v * 1.5)}k`, '-bufsize', `${v * 2}k`];
        })()
      : ['-crf', String(o.crf)];
  return ['-i', input, ...vf, '-c:v', 'libx264', '-preset', 'veryfast', ...quality, '-pix_fmt', 'yuv420p', ...audio, '-movflags', '+faststart', output];
}

/** "1:23.5", "83.5", "00:01:23" → seconds; null when it cannot be read. */
export function parseTime(text: string): number | null {
  const s = text.trim().replace(/،/g, '.').replace(/,/g, '.');
  if (!s) return null;
  const parts = s.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s - h * 3600 - m * 60;
  const rs = (Math.round(r * 10) / 10).toFixed(1).padStart(4, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${rs}` : `${m}:${rs}`;
}

export function trimArgs(input: string, output: string, start: number, end: number, fast: boolean, format: VideoFormat): string[] {
  const t = ['-ss', String(start), '-to', String(end)];
  // fast: copy the streams (instant, but starts at the nearest keyframe); precise: decode and encode again
  return fast ? [...t, '-i', input, '-c', 'copy', '-avoid_negative_ts', 'make_zero', output] : ['-ss', String(start), '-i', input, '-t', String(end - start), ...codecArgs(format), output];
}

/**
 * Joins clips one after another. Every clip is scaled (with bars, never stretched) to the first clip's size
 * and frame rate, so mixed phone/camera clips still join. Sound is kept only when every clip has it.
 */
export function mergeArgs(inputs: string[], output: string, size: { width: number; height: number }, allHaveAudio: boolean, format: VideoFormat): string[] {
  const w = even(size.width);
  const h = even(size.height);
  const parts: string[] = [];
  inputs.forEach((_, i) => {
    parts.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`);
    if (allHaveAudio) parts.push(`[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
  });
  const joined = inputs.map((_, i) => `[v${i}]${allHaveAudio ? `[a${i}]` : ''}`).join('');
  parts.push(`${joined}concat=n=${inputs.length}:v=1:a=${allHaveAudio ? 1 : 0}[v]${allHaveAudio ? '[a]' : ''}`);
  return [...inputs.flatMap((f) => ['-i', f]), '-filter_complex', parts.join(';'), '-map', '[v]', ...(allHaveAudio ? ['-map', '[a]'] : []), ...codecArgs(format, 23, allHaveAudio), output];
}

export type CropAspect = 'square' | 'portrait916' | 'portrait45' | 'landscape169' | 'landscape43' | 'custom';
export const ASPECT_RATIO: Record<Exclude<CropAspect, 'custom'>, number> = { square: 1, portrait916: 9 / 16, portrait45: 4 / 5, landscape169: 16 / 9, landscape43: 4 / 3 };

/** The largest rectangle of the ratio that fits the video, placed by `px`,`py` (0 = start, 0.5 = middle, 1 = end). */
export function cropRect(width: number, height: number, ratio: number, px = 0.5, py = 0.5): { x: number; y: number; w: number; h: number } {
  let w = width;
  let h = Math.round(width / ratio);
  if (h > height) {
    h = height;
    w = Math.round(height * ratio);
  }
  w = Math.min(width, even(w));
  h = Math.min(height, even(h));
  return { x: Math.round((width - w) * px), y: Math.round((height - h) * py), w, h };
}

export function cropArgs(input: string, output: string, r: { x: number; y: number; w: number; h: number }, format: VideoFormat): string[] {
  return ['-i', input, '-vf', `crop=${even(r.w)}:${even(r.h)}:${Math.max(0, r.x)}:${Math.max(0, r.y)}`, ...codecArgs(format), output];
}

export type RotateMode = 'cw' | 'ccw' | 'flip180' | 'mirror' | 'flipv';
export const ROTATE_FILTER: Record<RotateMode, string> = { cw: 'transpose=1', ccw: 'transpose=2', flip180: 'hflip,vflip', mirror: 'hflip', flipv: 'vflip' };
export function rotateArgs(input: string, output: string, mode: RotateMode, format: VideoFormat): string[] {
  return ['-i', input, '-vf', ROTATE_FILTER[mode], ...codecArgs(format), output];
}

/** atempo only accepts 0.5–2 per step, so larger changes are chained. */
export function atempoChain(speed: number): string {
  const steps: number[] = [];
  let s = speed;
  while (s > 2) {
    steps.push(2);
    s /= 2;
  }
  while (s < 0.5) {
    steps.push(0.5);
    s /= 0.5;
  }
  steps.push(Math.round(s * 10000) / 10000);
  return steps.map((x) => `atempo=${x}`).join(',');
}
export function speedArgs(input: string, output: string, speed: number, hasAudio: boolean, format: VideoFormat): string[] {
  const v = `setpts=PTS/${speed}`;
  return hasAudio ? ['-i', input, '-filter_complex', `[0:v]${v}[v];[0:a]${atempoChain(speed)}[a]`, '-map', '[v]', '-map', '[a]', ...codecArgs(format), output] : ['-i', input, '-vf', v, ...codecArgs(format, 23, false), output];
}

export function resizeArgs(input: string, output: string, o: { height: number | null; fps: number | null }, format: VideoFormat): string[] {
  const vf = [o.height ? `scale=-2:${even(o.height)}` : '', o.fps ? `fps=${o.fps}` : ''].filter(Boolean).join(',');
  return ['-i', input, ...(vf ? ['-vf', vf] : []), ...codecArgs(format), output];
}

/** Encoder options for a sound format (`kbps` is ignored by the lossless ones). */
export function audioCodecArgs(format: AudioFormat, kbps: number): string[] {
  const codec: Record<AudioFormat, string[]> = {
    mp3: ['-c:a', 'libmp3lame', '-b:a', `${kbps}k`],
    m4a: ['-c:a', 'aac', '-b:a', `${kbps}k`],
    ogg: ['-c:a', 'libvorbis', '-b:a', `${kbps}k`],
    wav: ['-c:a', 'pcm_s16le'],
    flac: ['-c:a', 'flac'],
  };
  return codec[format];
}

export function audioArgs(input: string, output: string, format: AudioFormat, kbps: number): string[] {
  return ['-i', input, '-vn', ...audioCodecArgs(format, kbps), output];
}

/** Keeps `start`–`end` seconds of a sound file (always re-encoded, so the cut is exact). */
export function audioTrimArgs(input: string, output: string, start: number, end: number, format: AudioFormat, kbps: number): string[] {
  return ['-ss', String(start), '-i', input, '-t', String(end - start), '-vn', ...audioCodecArgs(format, kbps), output];
}

/** Joins sound files one after another; every file is brought to 44.1 kHz stereo first so different files fit together. */
export function audioMergeArgs(inputs: string[], output: string, format: AudioFormat, kbps: number): string[] {
  const parts = inputs.map((_, i) => `[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
  parts.push(`${inputs.map((_, i) => `[a${i}]`).join('')}concat=n=${inputs.length}:v=0:a=1[a]`);
  return [...inputs.flatMap((f) => ['-i', f]), '-filter_complex', parts.join(';'), '-map', '[a]', ...audioCodecArgs(format, kbps), output];
}

export interface PolishOptions {
  /** change in decibels; 0 keeps it */
  volumeDb: number;
  /** level the loudness to about −16 LUFS */
  normalize: boolean;
  fadeIn: number;
  fadeOut: number;
  speed: number;
  mono: boolean;
  /** length of the source in seconds (needed to place the fade out); 0 when unknown */
  duration: number;
}

/** The audio filter chain for the "improve sound" tool; empty when nothing is asked for. */
export function polishFilter(o: PolishOptions): string {
  const f: string[] = [];
  if (o.speed !== 1) f.push(atempoChain(o.speed));
  if (o.volumeDb !== 0) f.push(`volume=${o.volumeDb}dB`);
  if (o.normalize) f.push('loudnorm=I=-16:TP=-1.5:LRA=11');
  if (o.fadeIn > 0) f.push(`afade=t=in:st=0:d=${o.fadeIn}`);
  if (o.fadeOut > 0 && o.duration > 0) {
    const out = o.duration / o.speed;
    const d = Math.min(o.fadeOut, out);
    f.push(`afade=t=out:st=${Math.round((out - d) * 1000) / 1000}:d=${d}`);
  }
  return f.join(',');
}

export function polishArgs(input: string, output: string, o: PolishOptions, format: AudioFormat, kbps: number): string[] {
  const af = polishFilter(o);
  return ['-i', input, '-vn', ...(af ? ['-af', af] : []), ...(o.mono ? ['-ac', '1'] : []), ...audioCodecArgs(format, kbps), output];
}

export function gifArgs(input: string, output: string, o: { start: number; duration: number; fps: number; width: number }): string[] {
  const vf = `fps=${o.fps},scale=${even(o.width)}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`;
  return ['-ss', String(o.start), '-t', String(o.duration), '-i', input, '-filter_complex', vf, '-loop', '0', output];
}

/** Reads what FFmpeg prints for `-i file` (duration, size, codecs, frame rate, sound). */
export function parseInfo(log: string): Partial<VideoInfo> {
  const out: Partial<VideoInfo> = {};
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  if (d) out.duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  const br = /bitrate:\s*(\d+)\s*kb\/s/.exec(log);
  if (br) out.bitrateKbps = Number(br[1]);
  const v = /Stream #[^\n]*Video:\s*([A-Za-z0-9_]+)[^\n]*?,\s*(\d{2,5})x(\d{2,5})/.exec(log);
  if (v) {
    out.videoCodec = v[1];
    out.width = Number(v[2]);
    out.height = Number(v[3]);
  }
  const fps = /(\d+(?:\.\d+)?)\s*fps/.exec(log);
  if (fps) out.fps = Number(fps[1]);
  const a = /Stream #[^\n]*Audio:\s*([A-Za-z0-9_]+)/.exec(log);
  out.hasAudio = !!a;
  if (a) out.audioCodec = a[1];
  return out;
}
