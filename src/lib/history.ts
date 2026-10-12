/** Undo/redo for the state of one tool: snapshots of a small record of values, compared field by field. */

export type Snapshot = Record<string, unknown>;

export function shallowEqual(a: Snapshot, b: Snapshot): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

export class History<S extends Snapshot> {
  past: S[] = [];
  future: S[] = [];
  present: S;
  private lastAt = 0;

  /**
   * `limit`: how many steps are kept. `mergeMs`: changes that follow each other faster than this (typing, dragging)
   * count as one step.
   */
  constructor(initial: S, private limit = 100, private mergeMs = 300) {
    this.present = initial;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  /** Notes the state after a change. Returns false when nothing differs from the current state. */
  record(next: S, now = Date.now()): boolean {
    if (shallowEqual(this.present, next)) return false;
    if (this.past.length === 0 || now - this.lastAt > this.mergeMs) {
      this.past.push(this.present);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
    this.present = next;
    this.lastAt = now;
    return true;
  }

  undo(): S | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(this.present);
    this.present = prev;
    this.lastAt = 0;
    return prev;
  }

  redo(): S | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(this.present);
    this.present = next;
    this.lastAt = 0;
    return next;
  }
}

/** The undo/redo buttons in the page header follow whichever tool is open. */
export interface HistoryControls {
  undo: () => void;
  redo: () => void;
}

export interface HistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
}

let controls: HistoryControls | null = null;
let status: HistoryStatus = { canUndo: false, canRedo: false };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const historyStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getStatus: () => status,
  setStatus(next: HistoryStatus) {
    if (next.canUndo === status.canUndo && next.canRedo === status.canRedo) return;
    status = next;
    emit();
  },
  register(c: HistoryControls) {
    controls = c;
    return () => {
      if (controls === c) {
        controls = null;
        status = { canUndo: false, canRedo: false };
        emit();
      }
    };
  },
  undo: () => controls?.undo(),
  redo: () => controls?.redo(),
};

/** Text fields keep the browser's own undo, so the app shortcuts leave them alone. */
export function isTextEditing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return !['checkbox', 'radio', 'range', 'file', 'button', 'submit', 'color'].includes((el as HTMLInputElement).type);
}
