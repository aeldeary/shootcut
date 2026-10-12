import { useEffect } from 'react';
import { useI18n } from '../i18n';
import { GENERAL_FEATURES, TOOL_FEATURES } from '../lib/features';
import { GROUPS, TOOLS } from '../lib/tools';
import { Notice } from './Shell';
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

/** What the site can do and the keyboard shortcuts. The data lives in lib/features.ts and lib/shortcuts.ts. */
export function FeaturesPage({ scrollTo }: { scrollTo?: 'shortcuts' }) {
  const { t, lang } = useI18n();
  const mac = isMacPlatform();

  useEffect(() => {
    if (scrollTo === 'shortcuts') document.getElementById('shortcuts')?.scrollIntoView?.({ block: 'start' });
    else window.scrollTo?.(0, 0);
  }, [scrollTo]);

  return (
    <section className="container tool-page features">
      <h1>{t('featuresTitle')}</h1>
      <p className="muted lead">{t('featuresLead')}</p>
      <Notice kind="info">{t('featuresNotice')}</Notice>

      <h2 className="features-h">{t('featuresGeneral')}</h2>
      <div className="grid">
        {GENERAL_FEATURES.map((g) => (
          <div key={g.title.en} className="card feature-card">
            <h3>{g.title[lang]}</h3>
            <p className="muted">{g.text[lang]}</p>
          </div>
        ))}
      </div>

      <h2 className="features-h">{t('featuresTools')}</h2>
      {GROUPS.map((g) => {
        const tools = TOOLS.filter((x) => x.group === g.id && x.status === 'ready');
        if (tools.length === 0) return null;
        return (
          <section key={g.id} className="group" aria-labelledby={`f-${g.id}`}>
            <h3 id={`f-${g.id}`} className="features-group">
              {t(g.title)}
            </h3>
            <div className="grid">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <article key={tool.id} className="card feature-card" id={`feature-${tool.id}`}>
                    <h4 className="feature-tool">
                      <span className="card-icon">
                        <Icon size={20} aria-hidden />
                      </span>
                      {t(tool.name)}
                    </h4>
                    <ul className="feature-list">
                      {(TOOL_FEATURES[tool.id] ?? []).map((f) => (
                        <li key={f.en}>{f[lang]}</li>
                      ))}
                    </ul>
                    <a className="btn btn-small" href={`#/${tool.id}`}>
                      {t('featuresOpen')}
                    </a>
                  </article>
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
      {SHORTCUT_GROUPS.map((g) => {
        const rows = SHORTCUTS.filter((s) => s.group === g.id);
        if (rows.length === 0) return null;
        return (
          <div key={g.id} className="shortcut-group">
            <h3 className="features-group">{g.label[lang]}</h3>
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
                      <td data-label={t('featuresAction')}>
                        {s.label[lang]}
                      </td>
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
          </div>
        );
      })}
      {mac && <p className="hint">{t('featuresMacNote')}</p>}
    </section>
  );
}
