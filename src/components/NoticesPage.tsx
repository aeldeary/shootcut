import { useI18n } from '../i18n';
import { STUDIOS, studioBase } from '../lib/studios';

/** The licence texts that must stay with the open-source apps of the Studios; kept out of the apps' own screens. */
export function NoticesPage() {
  const { t } = useI18n();
  return (
    <section className="container tool-page notices-page">
      <div className="tool-head">
        <h1>{t('noticesTitle')}</h1>
      </div>
      <p className="muted lead">{t('noticesIntro')}</p>
      <ul className="notice-list">
        {STUDIOS.flatMap((s) => s.apps).map((a) => (
          <li key={a.id} data-app={a.id}>
            <strong>{t(a.name)}</strong>
            <span>
              <a href={`${studioBase(a.id)}LICENSE-MIT`} target="_blank" rel="noopener">MIT</a>
              {' · '}
              <a href={`${studioBase(a.id)}LICENSE-APACHE`} target="_blank" rel="noopener">Apache-2.0</a>
              {' · '}
              <a href={`${studioBase(a.id)}NOTICE`} target="_blank" rel="noopener">NOTICE</a>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
