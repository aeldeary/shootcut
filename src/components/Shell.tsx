import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, Languages, Redo2, ShieldCheck, Sparkles, Undo2 } from 'lucide-react';
import { historyStore } from '../lib/history';
import { useI18n } from '../i18n';
import { GROUPS, SECTIONS, TOOLS, type GroupId, type SectionId } from '../lib/tools';

export function Header({ showBack, activeId, section }: { showBack: boolean; activeId?: string | null; section?: SectionId | null }) {
  const { t, toggle } = useI18n();
  return (
    <header className="header">
      <div className="container header-row">
        <a className="brand" href="#/" aria-label={t('appName')}>
          <img src="./favicon.svg" alt="" width={32} height={32} />
          <span dir="ltr">{t('appName')}</span>
        </a>
        <div className="header-actions">
          {showBack && (
            <a className="btn btn-ghost" href="#/" aria-label={t('back')}>
              <ArrowLeft size={16} className="dir-flip" aria-hidden />
              <span className="back-label">{t('back')}</span>
            </a>
          )}
          <a className="btn btn-ghost" href="#/features" aria-label={t('navFeatures')}>
            <Sparkles size={16} aria-hidden />
            <span className="nav-features-label">{t('navFeatures')}</span>
          </a>
          <button type="button" className="btn btn-ghost" onClick={toggle} aria-label={t('switchLangLabel')}>
            <Languages size={16} aria-hidden />
            {t('switchLang')}
          </button>
        </div>
      </div>
      {(showBack || section) && <ToolNav activeId={activeId ?? null} section={section ?? null} />}
    </header>
  );
}

/**
 * The tool groups as short headings under the header; each opens a menu with its tools, so switching tools
 * never needs a trip back to the home page and the bar stays one slim row.
 */
function ToolNav({ activeId, section }: { activeId: string | null; section: SectionId | null }) {
  const { t } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<{ id: GroupId; left: number } | null>(null);

  // a new route (a tool was picked) closes the menu
  useEffect(() => setOpen(null), [activeId]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const toggle = (id: GroupId, btn: HTMLElement) => {
    if (open?.id === id) return setOpen(null);
    const w = wrap.current?.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    // line the menu up with its heading, kept inside the screen
    const width = Math.min(280, (w?.width ?? 280) - 24);
    const left = w ? Math.min(Math.max(b.left - w.left, 12), Math.max(12, w.width - width - 12)) : 12;
    setOpen({ id, left });
  };

  const focusItem = (dir: 1 | -1 | 'first') => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('a') ?? [])];
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[dir === 'first' ? 0 : (at + dir + items.length) % items.length]?.focus();
  };

  const groups = GROUPS.filter((g) => g.section === section).map((g) => ({ ...g, tools: TOOLS.filter((x) => x.group === g.id && x.status === 'ready') })).filter((g) => g.tools.length > 0);

  return (
    <div className="toolnav-wrap" ref={wrap}>
      <nav className="toolnav" aria-label={t('toolsNav')}>
        {SECTIONS.map((sec) => (
          <a key={sec.id} href={`#/${sec.id}`} className={`toolnav-sec${sec.id === section ? ' is-here' : ''}`} aria-current={sec.id === section ? 'true' : undefined}>
            {t(sec.title)}
          </a>
        ))}
        {groups.length > 0 && <span className="toolnav-sep" aria-hidden />}
        {groups.map((g) => {
          const here = g.tools.some((x) => x.id === activeId);
          const isOpen = open?.id === g.id;
          return (
            <button
              key={g.id}
              type="button"
              id={`toolnav-${g.id}`}
              className={`toolnav-btn${here ? ' is-here' : ''}${isOpen ? ' is-open' : ''}`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              aria-controls={isOpen ? 'toolnav-menu' : undefined}
              onClick={(e) => toggle(g.id, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (!isOpen) toggle(g.id, e.currentTarget);
                  setTimeout(() => focusItem('first'), 0);
                }
              }}
            >
              {t(g.title)}
              <ChevronDown size={14} aria-hidden className="toolnav-chev" />
            </button>
          );
        })}
      </nav>
      {open && (
        <div
          id="toolnav-menu"
          ref={menu}
          className="toolnav-menu"
          role="menu"
          aria-labelledby={`toolnav-${open.id}`}
          style={{ left: open.left }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), focusItem(1));
            else if (e.key === 'ArrowUp') (e.preventDefault(), focusItem(-1));
            else if (e.key === 'Escape') {
              setOpen(null);
              document.getElementById(`toolnav-${open.id}`)?.focus();
            }
          }}
        >
          {groups
            .find((g) => g.id === open.id)
            ?.tools.map((tool) => {
              const Icon = tool.icon;
              const on = tool.id === activeId;
              return (
                <a key={tool.id} role="menuitem" href={`#/${tool.id}`} className={`toolnav-item${on ? ' is-active' : ''}`} aria-current={on ? 'page' : undefined} onClick={() => setOpen(null)}>
                  <Icon size={16} aria-hidden />
                  <span>{t(tool.name)}</span>
                </a>
              );
            })}
        </div>
      )}
    </div>
  );
}

export function PrivacyBadge() {
  const { t } = useI18n();
  return (
    <p className="badge">
      <ShieldCheck size={16} aria-hidden />
      {t('privacyBadge')}
    </p>
  );
}

/** Undo and redo for whichever tool is open (the shortcuts are Ctrl+Z and Ctrl+Y). */
function UndoRedo() {
  const { t } = useI18n();
  const { canUndo, canRedo } = useSyncExternalStore(historyStore.subscribe, historyStore.getStatus);
  return (
    <div className="history-bar" role="group" aria-label={t('historyGroup')}>
      <button type="button" className="icon-btn" aria-label={t('undo')} title={`${t('undo')} (Ctrl+Z)`} disabled={!canUndo} onClick={() => historyStore.undo()}>
        <Undo2 size={20} className="dir-flip" aria-hidden />
      </button>
      <button type="button" className="icon-btn" aria-label={t('redo')} title={`${t('redo')} (Ctrl+Y)`} disabled={!canRedo} onClick={() => historyStore.redo()}>
        <Redo2 size={20} className="dir-flip" aria-hidden />
      </button>
    </div>
  );
}

export function ToolPage({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="container tool-page">
      <div className="tool-head">
        <h1>{title}</h1>
        <UndoRedo />
      </div>
      <p className="muted lead">{desc}</p>
      {children}
    </section>
  );
}

export function Notice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <p className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
