/**
 * Keyboard shortcuts, modelled on Adobe Acrobat DC. One list drives both the behaviour (tools register
 * handlers for the ids they support) and the table on the Features page, so the two cannot drift apart.
 *
 * Keys are matched by `KeyboardEvent.code`, so they work with any keyboard layout (an Arabic layout
 * included). "Mod" is Ctrl on Windows and Linux, Command on a Mac.
 */
export type ShortcutId =
  | 'open' | 'save' | 'print' | 'properties' | 'help' | 'undo' | 'redo'
  | 'nextPage' | 'prevPage' | 'firstPage' | 'lastPage' | 'nextScreen' | 'prevScreen' | 'goToPage'
  | 'zoomIn' | 'zoomOut' | 'fitPage' | 'fitWidth' | 'actualSize' | 'rotateCw' | 'rotateCcw' | 'fullScreen' | 'readingMode'
  | 'find' | 'findNext' | 'findPrev' | 'readAloud' | 'readStop'
  | 'commentNote' | 'commentHighlight' | 'commentCycle' | 'formText' | 'formCycle';

export type ShortcutGroup = 'file' | 'navigate' | 'view' | 'search' | 'read' | 'comment' | 'form' | 'edit';

export interface Combo {
  /** KeyboardEvent.code */
  code: string;
  /** Ctrl (Windows) or Command (Mac) */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface ShortcutDef {
  id: ShortcutId;
  group: ShortcutGroup;
  combos: Combo[];
  label: { en: string; ar: string };
  /** where it works, shown on the Features page */
  where: { en: string; ar: string };
  /** handled somewhere else (undo and redo have their own listener); listed here for the table only */
  external?: boolean;
  /** how sure we are of it: 'adobe' = on Adobe's published list, 'common' = the usual Acrobat key, not on the page we checked */
  source: 'adobe' | 'common';
}

const m = (code: string, extra: Partial<Combo> = {}): Combo => ({ code, mod: true, ...extra });
const k = (code: string, extra: Partial<Combo> = {}): Combo => ({ code, ...extra });

const ANY = { en: 'Every tool', ar: 'كل الأدوات' };
const READER = { en: 'View & find', ar: 'العرض والبحث' };
const PAGES = { en: 'View & find, and the page tools', ar: 'العرض والبحث وأدوات الصفحة' };

export const SHORTCUTS: ShortcutDef[] = [
  { id: 'open', group: 'file', combos: [m('KeyO')], label: { en: 'Open a file', ar: 'فتح ملف' }, where: ANY, source: 'common' },
  { id: 'save', group: 'file', combos: [m('KeyS')], label: { en: 'Save (run the main action and download)', ar: 'حفظ (تنفيذ الإجراء الأساسي وتنزيل الملف)' }, where: ANY, source: 'common' },
  { id: 'print', group: 'file', combos: [m('KeyP')], label: { en: 'Print', ar: 'طباعة' }, where: ANY, source: 'common' },
  { id: 'properties', group: 'file', combos: [m('KeyD')], label: { en: 'Document properties', ar: 'خصائص المستند' }, where: ANY, source: 'adobe' },
  { id: 'help', group: 'file', combos: [k('F1')], label: { en: 'Features and shortcuts', ar: 'المميزات والاختصارات' }, where: ANY, source: 'common' },

  { id: 'undo', group: 'edit', combos: [m('KeyZ')], label: { en: 'Undo', ar: 'تراجع' }, where: ANY, external: true, source: 'common' },
  { id: 'redo', group: 'edit', combos: [m('KeyZ', { shift: true }), m('KeyY')], label: { en: 'Redo', ar: 'إعادة' }, where: ANY, external: true, source: 'common' },

  { id: 'nextPage', group: 'navigate', combos: [k('ArrowRight'), m('PageDown')], label: { en: 'Next page', ar: 'الصفحة التالية' }, where: PAGES, source: 'adobe' },
  { id: 'prevPage', group: 'navigate', combos: [k('ArrowLeft'), m('PageUp')], label: { en: 'Previous page', ar: 'الصفحة السابقة' }, where: PAGES, source: 'adobe' },
  { id: 'firstPage', group: 'navigate', combos: [k('Home'), m('PageUp', { shift: true }), m('ArrowUp', { shift: true })], label: { en: 'First page', ar: 'أول صفحة' }, where: PAGES, source: 'adobe' },
  { id: 'lastPage', group: 'navigate', combos: [k('End'), m('PageDown', { shift: true }), m('ArrowDown', { shift: true })], label: { en: 'Last page', ar: 'آخر صفحة' }, where: PAGES, source: 'adobe' },
  { id: 'nextScreen', group: 'navigate', combos: [k('PageDown')], label: { en: 'Next screen', ar: 'الشاشة التالية' }, where: READER, source: 'adobe' },
  { id: 'prevScreen', group: 'navigate', combos: [k('PageUp')], label: { en: 'Previous screen', ar: 'الشاشة السابقة' }, where: READER, source: 'adobe' },
  { id: 'goToPage', group: 'navigate', combos: [m('KeyN', { shift: true })], label: { en: 'Go to page', ar: 'الذهاب إلى صفحة' }, where: READER, source: 'adobe' },

  { id: 'zoomIn', group: 'view', combos: [m('Equal'), m('NumpadAdd')], label: { en: 'Zoom in', ar: 'تكبير' }, where: PAGES, source: 'adobe' },
  { id: 'zoomOut', group: 'view', combos: [m('Minus'), m('NumpadSubtract')], label: { en: 'Zoom out', ar: 'تصغير' }, where: PAGES, source: 'adobe' },
  { id: 'fitPage', group: 'view', combos: [m('Digit0'), m('Numpad0')], label: { en: 'Fit the whole page', ar: 'ملاءمة الصفحة كاملة' }, where: PAGES, source: 'adobe' },
  { id: 'actualSize', group: 'view', combos: [m('Digit1'), m('Numpad1')], label: { en: 'Actual size (100%)', ar: 'الحجم الفعلي (100%)' }, where: PAGES, source: 'adobe' },
  { id: 'fitWidth', group: 'view', combos: [m('Digit2'), m('Numpad2')], label: { en: 'Fit the page width', ar: 'ملاءمة عرض الصفحة' }, where: PAGES, source: 'common' },
  { id: 'rotateCw', group: 'view', combos: [m('Equal', { shift: true }), m('NumpadAdd', { shift: true })], label: { en: 'Rotate the view clockwise', ar: 'تدوير العرض مع عقارب الساعة' }, where: READER, source: 'adobe' },
  { id: 'rotateCcw', group: 'view', combos: [m('Minus', { shift: true }), m('NumpadSubtract', { shift: true })], label: { en: 'Rotate the view counter-clockwise', ar: 'تدوير العرض عكس عقارب الساعة' }, where: READER, source: 'adobe' },
  { id: 'fullScreen', group: 'view', combos: [m('KeyL')], label: { en: 'Full screen (Esc leaves it)', ar: 'ملء الشاشة (Esc للخروج)' }, where: READER, source: 'adobe' },
  { id: 'readingMode', group: 'view', combos: [m('KeyH')], label: { en: 'Reading mode', ar: 'وضع القراءة' }, where: READER, source: 'common' },

  { id: 'find', group: 'search', combos: [m('KeyF')], label: { en: 'Find in the document', ar: 'بحث في المستند' }, where: READER, source: 'adobe' },
  { id: 'findNext', group: 'search', combos: [k('F3'), m('KeyG')], label: { en: 'Next result', ar: 'النتيجة التالية' }, where: READER, source: 'adobe' },
  { id: 'findPrev', group: 'search', combos: [k('F3', { shift: true }), m('KeyG', { shift: true })], label: { en: 'Previous result', ar: 'النتيجة السابقة' }, where: READER, source: 'adobe' },

  { id: 'readAloud', group: 'read', combos: [m('KeyY', { shift: true })], label: { en: 'Start or stop Read Out Loud', ar: 'تشغيل أو إيقاف القراءة بصوت عالٍ' }, where: READER, source: 'adobe' },
  { id: 'readStop', group: 'read', combos: [m('KeyE', { shift: true })], label: { en: 'Stop reading', ar: 'إيقاف القراءة' }, where: READER, source: 'adobe' },

  { id: 'commentNote', group: 'comment', combos: [k('KeyS')], label: { en: 'Sticky note tool', ar: 'أداة الملاحظة' }, where: { en: 'Comment & highlight', ar: 'التعليق والتحديد' }, source: 'adobe' },
  { id: 'commentHighlight', group: 'comment', combos: [k('KeyU')], label: { en: 'Highlight tool', ar: 'أداة التظليل' }, where: { en: 'Comment & highlight', ar: 'التعليق والتحديد' }, source: 'adobe' },
  { id: 'commentCycle', group: 'comment', combos: [k('KeyU', { shift: true })], label: { en: 'Cycle highlight, underline, strike-out', ar: 'التنقل بين التظليل والتسطير والشطب' }, where: { en: 'Comment & highlight', ar: 'التعليق والتحديد' }, source: 'adobe' },

  { id: 'formText', group: 'form', combos: [k('KeyF')], label: { en: 'Text field tool', ar: 'أداة حقل النص' }, where: { en: 'Prepare form', ar: 'تجهيز نموذج' }, source: 'adobe' },
  { id: 'formCycle', group: 'form', combos: [k('KeyF', { shift: true })], label: { en: 'Cycle the form field tools', ar: 'التنقل بين أدوات حقول النموذج' }, where: { en: 'Prepare form', ar: 'تجهيز نموذج' }, source: 'adobe' },
];

export const SHORTCUT_GROUPS: { id: ShortcutGroup; label: { en: string; ar: string } }[] = [
  { id: 'file', label: { en: 'File', ar: 'الملف' } },
  { id: 'edit', label: { en: 'Edit', ar: 'التحرير' } },
  { id: 'navigate', label: { en: 'Moving between pages', ar: 'التنقل بين الصفحات' } },
  { id: 'view', label: { en: 'View', ar: 'العرض' } },
  { id: 'search', label: { en: 'Find', ar: 'البحث' } },
  { id: 'read', label: { en: 'Read Out Loud', ar: 'القراءة بصوت عالٍ' } },
  { id: 'comment', label: { en: 'Commenting', ar: 'التعليق' } },
  { id: 'form', label: { en: 'Forms', ar: 'النماذج' } },
];

export function isMacPlatform(nav: Pick<Navigator, 'platform' | 'userAgent'> | undefined = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad|iPod/i.test(nav.platform || '') || /Macintosh/i.test(nav.userAgent || '');
}

export function matches(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>, c: Combo, mac: boolean): boolean {
  if (e.code !== c.code) return false;
  const primary = mac ? e.metaKey : e.ctrlKey;
  const other = mac ? e.ctrlKey : e.metaKey;
  return !!c.mod === primary && !other && !!c.shift === e.shiftKey && !!c.alt === e.altKey;
}

const KEY_NAMES: Record<string, string> = {
  Equal: '=', Minus: '-', NumpadAdd: 'Num +', NumpadSubtract: 'Num -', ArrowRight: 'Right Arrow', ArrowLeft: 'Left Arrow',
  ArrowUp: 'Up Arrow', ArrowDown: 'Down Arrow', PageUp: 'Page Up', PageDown: 'Page Down',
};

function keyName(code: string): string {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return code;
}

/** "Ctrl + Shift + N" on Windows, "⌘ + ⇧ + N" on a Mac */
export function formatCombo(c: Combo, mac: boolean): string {
  const parts: string[] = [];
  if (c.mod) parts.push(mac ? '⌘' : 'Ctrl');
  if (c.shift) parts.push(mac ? '⇧' : 'Shift');
  if (c.alt) parts.push(mac ? '⌥' : 'Alt');
  parts.push(keyName(c.code));
  return parts.join(' + ');
}

export function formatCombos(def: ShortcutDef, mac: boolean): string[] {
  return def.combos.map((c) => formatCombo(c, mac));
}

/** typing in a field: plain keys (no Ctrl or Command) must stay with the field */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(type) || type === 'range';
  }
  return !!el.closest?.('[role="menu"]');
}

/** the box handles use the arrow keys themselves */
function insideEditableBox(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('.editable-box');
}

/** return false from a handler when the key was not used, so the browser keeps its own behaviour */
export type Handler = (e: KeyboardEvent) => boolean | void;

interface Entry {
  get: (id: ShortcutId) => Handler | undefined;
  priority: number;
  seq: number;
}

const entries = new Set<Entry>();
let seq = 0;
let installed = false;

export function register(get: Entry['get'], priority = 1): () => void {
  const entry: Entry = { get, priority, seq: seq++ };
  entries.add(entry);
  ensureListener();
  return () => {
    entries.delete(entry);
  };
}

function find(id: ShortcutId): Handler[] {
  return [...entries]
    .sort((a, b) => b.priority - a.priority || b.seq - a.seq)
    .map((en) => en.get(id))
    .filter((h): h is Handler => !!h);
}

/** Runs the handler of the first shortcut that matches. Returns true when a handler used the key. */
export function dispatch(e: KeyboardEvent, mac = isMacPlatform()): boolean {
  if (e.defaultPrevented || e.isComposing) return false;
  for (const def of SHORTCUTS) {
    if (def.external) continue;
    const hit = def.combos.find((c) => matches(e, c, mac));
    if (!hit) continue;
    if (!hit.mod) {
      // plain keys stay with text fields, and with the resize handles on a box
      if (isTypingTarget(e.target)) continue;
      if (insideEditableBox(e.target)) continue;
    }
    for (const h of find(def.id)) {
      if (h(e) === false) continue;
      e.preventDefault();
      return true;
    }
  }
  return false;
}

function ensureListener(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', (e) => void dispatch(e));
}
