import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Gauge, Maximize, RefreshCw, Smartphone, Monitor } from 'lucide-react';
import { useI18n } from '../i18n';
import { TOOLS } from '../lib/tools';
import {
  STUDIOS,
  looksLikePhone,
  probeStudio,
  studioBase,
  type Studio,
  type StudioApp,
  type StudioBuild,
} from '../lib/studios';

/** The Studios block on the home page. */
export function StudiosBlock() {
  const { t } = useI18n();
  return (
    <section className="studios" aria-labelledby="studios-title">
      <h2 id="studios-title">{t('studiosTitle')}</h2>
      <p className="muted">{t('studiosDesc')}</p>
      <div className="studio-grid">
        {STUDIOS.map((s) => {
          const Icon = s.icon;
          return (
            <a key={s.id} className="section-card studio-card" href={`#/studio/${s.id}`} data-studio={s.id}>
              <span className="section-icon">
                <Icon size={30} aria-hidden />
              </span>
              <span className="section-name" dir="auto">
                {t(s.name)}
              </span>
              <span className="muted">{t(s.desc)}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

type Version = 'full' | 'light';

/** A studio's page. The person picks the full or the light version first; nothing opens before that. */
export function StudioPage({ studio }: { studio: Studio }) {
  const { t } = useI18n();
  const [version, setVersion] = useState<Version | null>(null);
  const phone = looksLikePhone();
  const recommended: Version = phone ? 'light' : 'full';
  const Icon = studio.icon;

  return (
    <div className="container studio-page">
      <h1 className="section-title">
        <Icon size={28} aria-hidden /> <span dir="auto">{t(studio.name)}</span>
      </h1>
      <p className="muted lead">{t(studio.desc)}</p>

      {version === null ? (
        <section aria-labelledby="studio-choose">
          <h2 id="studio-choose">{t('studioChoose')}</h2>
          {phone && <p className="notice" role="note">{t('studioPhoneWarn')}</p>}
          <div className="version-grid">
            {(['full', 'light'] as const).map((v) => (
              <button key={v} type="button" className="section-card version-card" data-version={v} onClick={() => setVersion(v)}>
                <span className="section-icon">{v === 'full' ? <Monitor size={30} aria-hidden /> : <Smartphone size={30} aria-hidden />}</span>
                <span className="section-name">{t(v === 'full' ? 'studioFull' : 'studioLight')}</span>
                <span className="muted">{t(v === 'full' ? 'studioFullDesc' : 'studioLightDesc')}</span>
                {recommended === v && <span className="tag tag-new">{t('studioRecommended')}</span>}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <p>
            <button type="button" className="btn btn-ghost" onClick={() => setVersion(null)}>
              {t('studioChange')}
            </button>{' '}
            <strong>{t(version === 'full' ? 'studioFull' : 'studioLight')}</strong>
          </p>
          {version === 'full' ? <FullList studio={studio} phone={phone} /> : <LightList studio={studio} />}
        </>
      )}
    </div>
  );
}

function FullList({ studio, phone }: { studio: Studio; phone: boolean }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="studio-apps">
      <h2 id="studio-apps">{t('studioApps')}</h2>
      {phone && <p className="notice" role="note">{t('studioPhoneWarn')}</p>}
      <ul className="notes">
        <li>{t('studioEnglishNote')}</li>
        <li>{t('studioAlphaNote')}</li>
        <li>{t('studioLocalNote')}</li>
      </ul>
      <div className="grid">
        {studio.apps.map((a) => (
          <AppCard key={a.id} studio={studio} app={a} />
        ))}
      </div>
    </section>
  );
}

function AppCard({ studio, app }: { studio: Studio; app: StudioApp }) {
  const { t } = useI18n();
  const [build, setBuild] = useState<StudioBuild | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void probeStudio(app).then((b) => live && setBuild(b));
    return () => {
      live = false;
    };
  }, [app]);
  const mb = build ? Math.max(1, Math.round(build.wasmBytes / 1e6)) : 0;
  return (
    <div className="card app-card" data-app={app.id}>
      <h3 dir="auto">{t(app.name)}</h3>
      <p className="muted">{t(app.desc)}</p>
      <p className="muted small" dir="auto">
        {build === undefined ? t('studioChecking') : build === null ? t('studioNotReady') : `${t('studioDownload')} ${mb} MB`}
      </p>
      {build ? (
        <a className="btn btn-primary" href={`#/studio/${studio.id}/${app.id}`}>
          {t('studioOpen')}
        </a>
      ) : (
        <button type="button" className="btn btn-primary" disabled>
          {t('studioOpen')}
        </button>
      )}
    </div>
  );
}

function LightList({ studio }: { studio: Studio }) {
  const { t } = useI18n();
  const tools = studio.light.map((id) => TOOLS.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x && x.status === 'ready');
  return (
    <section aria-labelledby="studio-light">
      <h2 id="studio-light">{t('studioLightTools')}</h2>
      {tools.length === 0 ? (
        <p className="notice" role="note">{t('studioLightEmpty')}</p>
      ) : (
        <div className="grid">
          {tools.map((tool) => {
            const I = tool.icon;
            return (
              <a key={tool.id} className="card" href={`#/${tool.id}`}>
                <span className="card-icon">
                  <I size={22} aria-hidden />
                </span>
                <span className="card-text">
                  <span className="card-name">{t(tool.name)}</span>
                  <span className="card-desc">{t(tool.desc)}</span>
                </span>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Runs one built app in a frame, with Shootcut's own toolbar and credit line around it. */
export function StudioLauncher({ studio, app }: { studio: Studio; app: StudioApp }) {
  const { t } = useI18n();
  const [webgl, setWebgl] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const src = `${studioBase(app.id)}index.html${webgl ? '?webgl' : ''}`;

  return (
    <div className="studio-launcher">
      <div className="container launcher-bar">
        <a className="btn btn-ghost" href={`#/studio/${studio.id}`}>
          <ArrowLeft size={16} className="dir-flip" aria-hidden /> {t('studioBackTo')}
        </a>
        <strong dir="auto">{t(app.name)}</strong>
        <span className="launcher-actions">
          <label className="check">
            <input
              type="checkbox"
              checked={webgl}
              onChange={(e) => {
                setWebgl(e.target.checked);
                setLoaded(false);
              }}
            />
            <Gauge size={14} aria-hidden /> {t('studioWebgl')}
          </label>
          <button type="button" className="btn btn-ghost" onClick={() => { setLoaded(false); setNonce((n) => n + 1); }}>
            <RefreshCw size={14} aria-hidden /> {t('studioReload')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void frame.current?.requestFullscreen?.()}>
            <Maximize size={14} aria-hidden /> {t('studioFullscreen')}
          </button>
          <a className="btn btn-ghost" href={src} target="_blank" rel="noopener">
            <ExternalLink size={14} aria-hidden /> {t('studioNewTab')}
          </a>
        </span>
      </div>
      <div className="frame-wrap">
        {!loaded && <p className="muted frame-loading" role="status">{t('studioLoading')}</p>}
        <iframe
          key={`${src}#${nonce}`}
          ref={frame}
          className="studio-frame"
          title={`${t('studioFrameTitle')}: ${t(app.name)}`}
          src={src}
          sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-modals"
          allow="fullscreen; clipboard-read; clipboard-write; autoplay"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}
