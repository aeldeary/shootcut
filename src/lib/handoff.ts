/**
 * Hands one PDF from a tool to the next one the person opens ("open this file in another tool"),
 * without uploading anything: it only lives in memory for a few seconds.
 */
const TTL_MS = 5000;
let held: { file: File; at: number } | null = null;

export function holdFile(file: File): void {
  held = { file, at: Date.now() };
}

/** The file waiting for the tool that just opened, if it was handed over a moment ago. */
export function takeFile(now = Date.now()): File | null {
  if (!held) return null;
  if (now - held.at > TTL_MS) {
    held = null;
    return null;
  }
  return held.file;
}

export function clearHeld(): void {
  held = null;
}
