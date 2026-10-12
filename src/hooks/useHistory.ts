import { useEffect, useRef } from 'react';
import { History, historyStore, isTextEditing, type Snapshot } from '../lib/history';

/**
 * Gives a tool undo and redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z and the buttons in the page header).
 *
 * `snapshot` holds the tool's editable values, exactly as they are in its state (do not build new arrays or objects
 * for it: a value that is a different object every render counts as a change). `restore` puts a snapshot back.
 * `scope` is the thing the work belongs to, such as the open file: when it changes the history starts over.
 */
export function useHistory<S extends Snapshot>(snapshot: S, restore: (s: S) => void, scope?: unknown): void {
  const history = useRef<History<S>>(null as unknown as History<S>);
  const scopeRef = useRef<unknown>(scope);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  if (!history.current) history.current = new History(snapshot);

  const publish = () => historyStore.setStatus({ canUndo: history.current.canUndo, canRedo: history.current.canRedo });

  // runs after every render: cheap, it only compares the snapshot's fields
  useEffect(() => {
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      history.current = new History(snapshot);
    } else {
      history.current.record(snapshot);
    }
    publish();
  });

  useEffect(() => {
    const undo = () => {
      const s = history.current.undo();
      if (s) restoreRef.current(s);
      publish();
    };
    const redo = () => {
      const s = history.current.redo();
      if (s) restoreRef.current(s);
      publish();
    };
    const unregister = historyStore.register({ undo, redo });
    publish();
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextEditing(e.target)) return;
      // by physical key: with the Arabic layout on, the Z key types a different letter, but it is still the Z key
      const k = e.code === 'KeyZ' || e.code === 'KeyY' ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) undo();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      unregister();
    };
  }, []);
}
