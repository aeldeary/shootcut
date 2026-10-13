import { useCallback, useEffect, useState } from 'react';
import { forgetMedia, getMediaMeta, isKeepEnabled, keepChoice, loadMedia, saveMedia, setKeepEnabled, subscribe, type MediaKind, type MediaMeta } from '../lib/persist';

/**
 * Keeps the pictures or videos the person added, so the next tool of the same section opens with them.
 * `restore` is called once, when the tool opens, with the kept files (the tool should only use them if it has none yet).
 * The returned `keep(files)` saves the current list (an empty list forgets it).
 */
export function useKeptMedia(kind: MediaKind, restore: (files: File[]) => void) {
  useEffect(() => {
    let alive = true;
    if (!isKeepEnabled()) return;
    void loadMedia(kind).then((files) => {
      if (alive && files.length > 0) restore(files);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the tool opens
  }, [kind]);

  return useCallback(
    (files: File[]) => {
      if (files.length === 0) void forgetMedia(kind);
      else void saveMedia(kind, files);
    },
    [kind],
  );
}

/** What is kept right now (for the keep bar), up to date across tools and tabs. */
export function useMediaMeta(kind: MediaKind) {
  const [meta, setMeta] = useState<MediaMeta | null>(null);
  const [on, setOn] = useState(isKeepEnabled);
  const [ask, setAsk] = useState(() => keepChoice() === null);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      setOn(isKeepEnabled());
      setAsk(keepChoice() === null);
      void getMediaMeta(kind).then((m) => alive && setMeta(m));
    };
    refresh();
    const off = subscribe(refresh);
    return () => {
      alive = false;
      off();
    };
  }, [kind]);
  const setKeep = useCallback((v: boolean) => {
    setOn(v);
    return setKeepEnabled(v);
  }, []);
  return { meta, keep: on, ask, setKeep, forget: () => forgetMedia(kind) };
}
