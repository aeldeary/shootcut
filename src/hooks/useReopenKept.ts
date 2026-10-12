import { useEffect } from 'react';
import { clearHeld, takeFile } from '../lib/handoff';
import { isKeepEnabled, loadSaved } from '../lib/persist';

/**
 * For tools that do not use usePdfFile: when the tool opens, hand it the file passed over from another tool
 * ("open in...") or else the one kept on this device. Gives the file to `open`, which should not save it again.
 */
export function useReopenKept(open: (file: File) => void): void {
  useEffect(() => {
    let alive = true;
    const handed = takeFile();
    if (handed) {
      setTimeout(clearHeld, 1000); // survives a development double-mount
      open(handed);
      return;
    }
    if (!isKeepEnabled()) return;
    void loadSaved().then((saved) => {
      if (alive && saved) open(saved);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the tool opens
  }, []);
}
