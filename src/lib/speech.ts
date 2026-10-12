import { hasArabic } from './text';

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** Language to speak a piece of text in, by which script dominates it. */
export function speechLang(text: string): 'ar-SA' | 'en-US' {
  const arabic = text.match(/[؀-ۿ]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return arabic >= latin && hasArabic(text) ? 'ar-SA' : 'en-US';
}

/**
 * Cuts text into pieces short enough for the browser's voice (long utterances are cut off in some browsers),
 * breaking at sentence ends and line breaks, and mixing nothing: every piece is in one language.
 */
export function splitForSpeech(text: string, max = 200): string[] {
  const sentences = text
    .replace(/\s*\n+\s*/g, '\n')
    .split(/(?<=[.!?؟۔…\n])\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let cur = '';
  const flush = () => {
    if (cur) out.push(cur);
    cur = '';
  };
  for (const s of sentences) {
    if (s.length > max) {
      flush();
      // a very long sentence: break at spaces
      let part = '';
      for (const w of s.split(/\s+/)) {
        if ((part + ' ' + w).length > max && part) {
          out.push(part);
          part = w;
        } else part = part ? `${part} ${w}` : w;
      }
      if (part) out.push(part);
      continue;
    }
    if (cur && speechLang(cur) !== speechLang(s)) flush();
    if ((cur + ' ' + s).length > max) flush();
    cur = cur ? `${cur} ${s}` : s;
  }
  flush();
  return out;
}

/** Speaks the text piece by piece. Returns a function that stops it; `onEnd` runs when it finished or was stopped. */
export function speak(text: string, onEnd: (finished: boolean) => void): () => void {
  const synth = window.speechSynthesis;
  const pieces = splitForSpeech(text);
  let stopped = false;
  let i = 0;
  const next = () => {
    if (stopped) return;
    if (i >= pieces.length) {
      onEnd(true);
      return;
    }
    const u = new SpeechSynthesisUtterance(pieces[i++]);
    u.lang = speechLang(u.text);
    u.onend = next;
    u.onerror = (e) => {
      if (!stopped && e.error !== 'canceled' && e.error !== 'interrupted') next();
    };
    synth.speak(u);
  };
  synth.cancel();
  next();
  return () => {
    stopped = true;
    synth.cancel();
    onEnd(false);
  };
}
