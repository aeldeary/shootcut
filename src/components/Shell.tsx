import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, Languages, Redo2, ShieldCheck, Sparkles, Undo2, type LucideIcon } from 'lucide-react';
import { historyStore } from '../lib/history';
import { useI18n } from '../i18n';
import { GROUPS, SECTIONS, TOOLS, type SectionId } from '../lib/tools';
import { studiosOfSection } from '../lib/studios';

export function Header({ showBack, activeId, section }: { showBack: boolean; activeId?: string | null; section?: SectionId | null }) {
  const { t, toggle } = useI18n();
  return (
    <header className="header">
      <div className="container header-row">
        <a className="brand" href="#/" aria-label={t('appName')}>
          <img src="./logo.svg" alt={t('appName')} width={46} height={49} />
        </a>
        <div className="header-actions">
          {showBack && (
            <a className="btn btn-ghost" href="#/" aria-label={t('back')}>
              <ArrowLeft size={16} className="dir-flip" aria-hidden />
              <span className="back-label">{t('back')}</span>
            </a>
          )}
          <a className="btn btn-ghost nav-features" href="#/features" aria-label={t('navFeatures')}>
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

type MenuId = 'section' | 'tools' | 'studios';

/**
 * One slim row under the header with at most three menus: the section (to move to another), the tools of this
 * section (every group in one panel) and the full programs of this section. Switching tools or sections never
 * needs a trip back to the home page.
 */
function ToolNav({ activeId, section }: { activeId: string | null; section: SectionId | null }) {
  const { t } = useI18n();
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<{ id: MenuId; left: number } | null>(null);

  // a new route (a tool or a section was picked) closes the menu
  useEffect(() => setOpen(null), [activeId, section]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const toggle = (id: MenuId, btn: HTMLElement) => {
    if (open?.id === id) return setOpen(null);
    const w = wrap.current?.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    // a small menu lines up with its button, kept inside the screen (the tools panel spans the bar instead)
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

  const current = SECTIONS.find((x) => x.id === section);
  const groups = GROUPS.filter((g) => g.section === section)
    .map((g) => ({ ...g, tools: TOOLS.filter((x) => x.group === g.id && x.status === 'ready') }))
    .filter((g) => g.tools.length > 0);
  const studios = section ? studiosOfSection(section) : [];

  const trigger = (id: MenuId, label: string, extra = '') => {
    const isOpen = open?.id === id;
    return (
      <button
        type="button"
        id={`toolnav-${id}`}
        className={`toolnav-btn toolnav-${id}${extra}${isOpen ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? 'toolnav-menu' : undefined}
        onClick={(e) => toggle(id, e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!isOpen) toggle(id, e.currentTarget);
            setTimeout(() => focusItem('first'), 0);
          }
        }}
      >
        {label}
        <ChevronDown size={14} aria-hidden className="toolnav-chev" />
      </button>
    );
  };

  const close = () => setOpen(null);
  const link = (key: string, href: string, Icon: LucideIcon, label: string, on = false) => (
    <a key={key} role="menuitem" href={href} className={`toolnav-item${on ? ' is-active' : ''}`} aria-current={on ? 'page' : undefined} onClick={close}>
      <Icon size={16} aria-hidden />
      <span dir="auto">{label}</span>
    </a>
  );

  return (
    <div className="toolnav-wrap" ref={wrap}>
      <nav className="toolnav" aria-label={t('toolsNav')}>
        {trigger('section', current ? t(current.title) : t('sectionsNav'))}
        {groups.length > 0 && trigger('tools', t('navTools'), activeId ? ' is-here' : '')}
        {studios.length > 0 && trigger('studios', t('navStudios'))}
      </nav>
      {open && (
        <div
          id="toolnav-menu"
          ref={menu}
          className={`toolnav-menu${open.id === 'tools' ? ' toolnav-panel' : ''}`}
          role="menu"
          aria-labelledby={`toolnav-${open.id}`}
          style={open.id === 'tools' ? undefined : { left: open.left }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), focusItem(1));
            else if (e.key === 'ArrowUp') (e.preventDefault(), focusItem(-1));
            else if (e.key === 'Escape') {
              setOpen(null);
              document.getElementById(`toolnav-${open.id}`)?.focus();
            }
          }}
        >
          {open.id === 'section' && SECTIONS.map((sec) => link(sec.id, `#/${sec.id}`, sec.icon, t(sec.title), sec.id === section))}
          {open.id === 'studios' && studios.map((s) => link(s.id, `#/studio/${s.id}`, s.icon, t(s.name)))}
          {open.id === 'tools' &&
            groups.map((g) => (
              <div key={g.id} role="group" aria-labelledby={`toolnav-g-${g.id}`} className="toolnav-col">
                <p id={`toolnav-g-${g.id}`} className="toolnav-group">
                  {t(g.title)}
                </p>
                {g.tools.map((tool) => link(tool.id, `#/${tool.id}`, tool.icon, t(tool.name), tool.id === activeId))}
              </div>
            ))}
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
    <>
      <header className="page-head tool-band">
        <div className="container tool-head">
          <div className="tool-titles">
            <h1 className="section-title">{title}</h1>
            <p className="lead">{desc}</p>
          </div>
          <UndoRedo />
        </div>
      </header>
      <section className="container tool-page">{children}</section>
    </>
  );
}

export function Notice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <p className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
