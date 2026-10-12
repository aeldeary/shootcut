import { useEffect, useRef } from 'react';
import { register, type Handler, type ShortcutId } from '../lib/shortcuts';

/**
 * Registers the shortcuts this component supports while it is mounted. Handlers are read at the time the key
 * is pressed, so they always see the latest state. `priority` lets the app-wide handlers (open, print...)
 * give way to a tool that handles the same key itself.
 */
export function useShortcuts(handlers: Partial<Record<ShortcutId, Handler>>, priority = 1): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => register((id) => ref.current[id], priority), [priority]);
}
