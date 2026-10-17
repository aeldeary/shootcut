import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '../i18n';
import { GENERAL_FEATURES, TOOL_FEATURES } from '../lib/features';
import { GROUPS, SECTIONS, TOOLS } from '../lib/tools';
import { SHORTCUTS, SHORTCUT_GROUPS, formatCombo, isMacPlatform } from '../lib/shortcuts';

/** "Ctrl + Shift + N" as key caps, always left to right even inside Arabic text */
function Keys({ combos, mac }: { combos: Parameters<typeof formatCombo>[0][]; mac: boolean }) {
  return (
    <>
      {combos.map((c, i) => (
        <span key={i}>
          {i > 0 && <span className="muted"> / </span>}
          <bdi dir="ltr" className="keys">
            {formatCombo(c, mac)
              .split(' + ')
              .map((k, j) => (
                <kbd key={j}>{k}</kbd>
              ))}
          </bdi>
        </span>
      ))}
    </>
  );
}

/** the first sentence of a longer text, and whatever follows it */
function splitFirst(text: string): [string, string] {
  const m = text.match(/^(.+?[.!؟?])\s+(.+)$/s);
  return m ? [m[1], m[2]] : [text, ''];
}

/** What the site can do and the keyboard shortcuts. The data lives in lib/features.ts and lib/shortcuts.ts. */
export function FeaturesPage({ scrollTo }: { scrollTo?: 'shortcuts' }) {
  const { t, lang } = useI18n();
  const mac = isMacPlatform();
  const [tab, setTab] = useState<string>('all');

  useEffect(() => {
    if (scrollTo === 'shortcuts') document.getElementById('shortcuts')?.scrollIntoView?.({ block: 'start' });
    else window.scrollTo?.(0, 0);
  }, [scrollTo]);

  const sections = SECTIONS.filter((sec) => tab === 'all' || sec.id === tab);

  return (
    <>
      <header className="page-head section-head">
        <div className="container features-head">
          <h1 className="section-title">{t('featuresTitle')}</h1>
          <p className="lead">{t('featuresLead')}</p>
          <nav className="features-jump" aria-label={t('featuresTitle')}>
            <a href="#/features" onClick={(e) => (e.preventDefault(), document.getElementById('f-general')?.scrollIntoView?.({ block: 'start' }))}>
              {t('featuresGeneral')}
            </a>
            <a href="#/features" onClick={(e) => (e.preventDefault(), document.getElementById('f-tools')?.scrollIntoView?.({ block: 'start' }))}>
              {t('featuresTools')}
            </a>
            <a href="#/shortcuts">{t('featuresShortcuts')}</a>
          </nav>
        </div>
      </header>
      <section className="container tool-page features">
        <h2 className="features-h" id="f-general">
          {t('featuresGeneral')}
        </h2>
        <div className="features-general">
          {GENERAL_FEATURES.map((g) => {
            const [first, rest] = splitFirst(g.text[lang]);
            return (
              <details key={g.title.en} className="card feature-card feature-general">
                <summary>
                  <span className="feature-title">{g.title[lang]}</span>
                  <span className="muted feature-teaser">{first}</span>
                  {rest && <ChevronDown size={18} className="feature-chev" aria-hidden />}
                </summary>
                {rest && <p className="muted feature-rest">{rest}</p>}
              </details>
            );
          })}
        </div>

        <h2 className="features-h" id="f-tools">
          {t('featuresTools')}
        </h2>
        <div className="group-tabs" role="tablist" aria-label={t('featuresTools')}>
          {[{ id: 'all', title: 'tabAll' as const }, ...SECTIONS].map((sec) => (
            <button key={sec.id} type="button" role="tab" aria-selected={tab === sec.id} className={`group-tab${tab === sec.id ? ' is-active' : ''}`} onClick={() => setTab(sec.id)}>
              {t(sec.title)}
            </button>
          ))}
        </div>
        {sections.map((sec) => {
          const groupIds = GROUPS.filter((g) => g.section === sec.id).map((g) => g.id);
          const tools = TOOLS.filter((x) => x.status === 'ready' && groupIds.includes(x.group));
          if (tools.length === 0) return null;
          const SecIcon = sec.icon;
          return (
            <section key={sec.id} className="features-section" data-section={sec.id} aria-labelledby={`f-${sec.id}`}>
              <h3 id={`f-${sec.id}`} className="features-group">
                <SecIcon size={18} aria-hidden /> {t(sec.title)}
                <span className="group-tab-n">{tools.length}</span>
              </h3>
              <div className="features-tools">
                {tools.map((tool) => {
                  const Icon = tool.icon;
                  const list = TOOL_FEATURES[tool.id] ?? [];
                  return (
                    <details key={tool.id} className="card feature-card feature-tool-card" id={`feature-${tool.id}`}>
                      <summary>
                        <span className="card-icon">
                          <Icon size={20} aria-hidden />
                        </span>
                        <span className="feature-tool-text">
                          <span className="feature-title">{t(tool.name)}</span>
                          <span className="muted feature-teaser">{list[0]?.[lang] ?? ''}</span>
                        </span>
                        <ChevronDown size={18} className="feature-chev" aria-hidden />
                      </summary>
                      <ul className="feature-list">
                        {list.map((f) => (
                          <li key={f.en}>{f[lang]}</li>
                        ))}
                      </ul>
                      <a className="btn btn-small btn-primary" href={`#/${tool.id}`}>
                        {t('featuresOpen')}
                      </a>
                    </details>
                  );
                })}
              </div>
            </section>
          );
        })}

        <h2 className="features-h" id="shortcuts">
          {t('featuresShortcuts')}
        </h2>
        <p className="muted">{t('featuresShortcutsLead')}</p>
        {SHORTCUT_GROUPS.map((g, gi) => {
          const rows = SHORTCUTS.filter((s) => s.group === g.id);
          if (rows.length === 0) return null;
          return (
            <details key={g.id} className="shortcut-group card" open={gi === 0 || scrollTo === 'shortcuts'}>
              <summary>
                <span className="feature-title">{g.label[lang]}</span>
                <span className="group-tab-n">{rows.length}</span>
                <ChevronDown size={18} className="feature-chev" aria-hidden />
              </summary>
              <div className="table-scroll">
                <table className="shortcut-table">
                  <thead>
                    <tr>
                      <th>{t('featuresAction')}</th>
                      <th>{t('featuresWindows')}</th>
                      <th>{t('featuresMac')}</th>
                      <th>{t('featuresWhere')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.id}>
                        <td data-label={t('featuresAction')}>{s.label[lang]}</td>
                        <td data-label={t('featuresWindows')}>
                          <Keys combos={s.combos} mac={false} />
                        </td>
                        <td data-label={t('featuresMac')}>
                          <Keys combos={s.combos} mac />
                        </td>
                        <td data-label={t('featuresWhere')} className="muted">
                          {s.where[lang]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
        {mac && <p className="hint">{t('featuresMacNote')}</p>}
      </section>
    </>
  );
}
