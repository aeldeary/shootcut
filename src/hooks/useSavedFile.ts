import { useCallback, useEffect, useState } from 'react';
import { forgetSaved, getSavedMeta, isKeepEnabled, keepChoice, setKeepEnabled, subscribe, type SavedMeta } from '../lib/persist';

/** What is kept on this device right now, kept up to date across tools and browser tabs. */
export function useSavedFile() {
  const [meta, setMeta] = useState<SavedMeta | null>(null);
  const [keep, setKeepState] = useState(isKeepEnabled);
  const [ask, setAsk] = useState(() => keepChoice() === null);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      setKeepState(isKeepEnabled());
      setAsk(keepChoice() === null);
      void getSavedMeta().then((m) => alive && setMeta(m));
    };
    refresh();
    const off = subscribe(refresh);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const setKeep = useCallback((on: boolean) => {
    setKeepState(on); // the switch moves at once; clearing the saved copy follows
    return setKeepEnabled(on);
  }, []);
  const forget = useCallback(() => forgetSaved(), []);
  return { meta, keep, ask, setKeep, forget };
}
