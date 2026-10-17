import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { textIn, useI18n, type Key, type Lang } from '../i18n';
import { TOOLS } from '../lib/tools';
import { STUDIOS } from '../lib/studios';
import { rankItems, type SearchItem } from '../lib/search';
import type { LucideIcon } from 'lucide-react';

/** The most results listed at once: more than this is a list to scroll, not an answer. */
export const SEARCH_LIMIT = 12;

interface Entry {
  key: string;
  href: string;
  icon: LucideIcon;
  name: Key;
  desc: Key;
}

/** Every ready tool and every visible studio: what the search looks through. */
function entries(): Entry[] {
  return [
    ...TOOLS.filter((x) => x.status === 'ready').map((x) => ({ key: `tool:${x.id}`, href: `#/${x.id}`, icon: x.icon, name: x.name, desc: x.desc })),
    ...STUDIOS.filter((s) => !s.hidden).map((s) => ({ key: `studio:${s.id}`, href: `#/studio/${s.id}`, icon: s.icon, name: s.name, desc: s.desc })),
  ];
}

/** The searchable text of an entry in both languages, so an English word finds a tool in the Arabic site and the other way round. */
function searchItem(e: Entry, lang: Lang): SearchItem {
  const other: Lang = lang === 'ar' ? 'en' : 'ar';
  return {
    id: e.key,
    name: textIn(lang, e.name),
    text: [textIn(lang, e.desc), textIn(other, e.name), textIn(other, e.desc)].join(' '),
  };
}

/** A box on the home page: type what you want to do, get the tools that do it. */
export function ToolSearch() {
  const { t, lang, dir } = useI18n();
  const [query, setQuery] = useState('');
  const all = useMemo(entries, []);
  const items = useMemo(() => all.map((e) => searchItem(e, lang)), [all, lang]);
  const q = query.trim();
  const ids = useMemo(() => rankItems(q, items), [q, items]);
  const hits = ids.slice(0, SEARCH_LIMIT).map((id) => all.find((e) => e.key === id)!);

  return (
    <div className="search" role="search">
      <label className="sr-only" htmlFor="tool-search">
        {t('searchLabel')}
      </label>
      <div className="search-box">
        <Search size={20} aria-hidden />
        <input
          id="tool-search"
          type="search"
          dir={query ? 'auto' : dir}
          autoComplete="off"
          enterKeyHint="go"
          placeholder={t('searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) window.location.hash = hits[0].href;
            else if (e.key === 'Escape') setQuery('');
          }}
        />
        {query && (
          <button type="button" className="icon-btn" aria-label={t('searchClear')} onClick={() => setQuery('')}>
            <X size={18} aria-hidden />
          </button>
        )}
      </div>
      {q && (
        <>
          <p className="muted small" role="status">
            {ids.length === 0
              ? t('searchNone').replace('{q}', q)
              : ids.length > SEARCH_LIMIT
                ? t('searchRefine').replace('{n}', String(SEARCH_LIMIT))
                : t('searchCount').replace('{n}', String(ids.length))}
          </p>
          {hits.length > 0 && (
            <div className="grid search-results">
              {hits.map((e) => {
                const Icon = e.icon;
                return (
                  <a key={e.key} className="card" href={e.href}>
                    <span className="card-icon">
                      <Icon size={22} aria-hidden />
                    </span>
                    <span className="card-text">
                      <span className="card-name" dir="auto">{t(e.name)}</span>
                      <span className="card-desc">{t(e.desc)}</span>
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
