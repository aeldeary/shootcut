import { useEffect, useState } from 'react';
import { useI18n, type Key } from '../i18n';

const EVENT = 'shootcut:toast';

/** Shows a short message at the bottom of the screen (used when a keyboard shortcut has nothing to do). */
export function notify(key: Key): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<Key>(EVENT, { detail: key }));
}

export function useToast(): string | null {
  const { t } = useI18n();
  const [key, setKey] = useState<Key | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      setKey((e as CustomEvent<Key>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setKey(null), 3500);
    };
    window.addEventListener(EVENT, on);
    return () => {
      window.removeEventListener(EVENT, on);
      clearTimeout(timer);
    };
  }, []);
  return key ? t(key) : null;
}
