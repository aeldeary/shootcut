import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ExternalLink, Gauge, Maximize, RefreshCw, Smartphone, Monitor, Type } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { TOOLS, type SectionId } from '../lib/tools';
import { StudioFonts } from './StudioFonts';
import { autoImportOn, canListInstalled, importAllInstalled, installedFontsGranted, sendSaved } from '../lib/localFonts';
import {
  looksLikePhone,
  probeStudio,
  studioBase,
  studiosOfSection,
  type Studio,
  type StudioApp,
  type StudioBuild,
} from '../lib/studios';

/** The full programs that belong to a section (Images, Video and audio, Sheets and slides), shown at the end of its page. */
export function SectionStudios({ section }: { section: SectionId }) {
  const { t } = useI18n();
  const list = studiosOfSection(section);
  if (list.length === 0) return null;
  return (
    <section className="studios" aria-labelledby="studios-title">
      <h2 id="studios-title">{t('sectionStudiosTitle')}</h2>
      <p className="muted">{t('sectionStudiosDesc')}</p>
      <div className="studio-grid">
        {list.map((s) => {
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
              <span className="tag tag-new is-updated">{t('studioBeta')}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

type Version = 'full' | 'light';
const EDITION_KEY = 'shootcut-edition';

/** The edition the person chose last time, kept in this browser (one choice for every studio and for PDF). */
function readEdition(): Version | null {
  try {
    const v = localStorage.getItem(EDITION_KEY);
    return v === 'full' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function saveEdition(v: Version): void {
  try {
    localStorage.setItem(EDITION_KEY, v);
  } catch {
    /* storage blocked: the choice lasts until the page closes */
  }
}

/** Whether this browser can create a WebGL context, which the full apps need to draw. */
function hasGraphics(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    // A software renderer (SwiftShader, llvmpipe) draws on the processor: the full apps then freeze the whole browser.
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    return !/swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

/**
 * A studio's page. It opens at once on the edition that suits this device (or the one the person chose last time);
 * a switch at the top moves between Full and Light whenever they like. Nothing heavy loads until an app is opened.
 */
export function StudioPage({ studio, lightContent }: { studio: Studio; lightContent?: ReactNode }) {
  const { t } = useI18n();
  const phone = looksLikePhone();
  const [graphics] = useState(hasGraphics);
  const recommended: Version = phone || !graphics ? 'light' : 'full';
  const [version, setVersion] = useState<Version>(() => readEdition() ?? recommended);
  const Icon = studio.icon;
  const choose = (v: Version) => {
    setVersion(v);
    saveEdition(v);
  };

  return (
    <div className="container studio-page">
      <h1 className="section-title">
        <Icon size={28} aria-hidden /> <span dir="auto">{t(studio.name)}</span>
      </h1>
      <p className="muted lead">{t(studio.desc)}</p>

      <div className="edition-switch" role="group" aria-label={t('studioEdition')}>
        {(['full', 'light'] as const).map((v) => (
          <button key={v} type="button" className={`edition-btn${version === v ? ' is-on' : ''}`} data-version={v} aria-pressed={version === v} onClick={() => choose(v)}>
            {v === 'full' ? <Monitor size={18} aria-hidden /> : <Smartphone size={18} aria-hidden />}
            <span>{t(v === 'full' ? 'studioFull' : 'studioLight')}</span>
            {recommended === v && <span className="tag tag-new">{t('studioRecommended')}</span>}
          </button>
        ))}
      </div>
      <p className="muted small edition-hint">{t(version === 'full' ? 'studioFullDesc' : 'studioLightDesc')}</p>
      {!graphics && version === 'full' && (
        <p className="notice" role="note">
          {t('studioNoGraphics')}{' '}
          <button type="button" className="btn" onClick={() => choose('light')}>
            {t('studioUseLight')}
          </button>
        </p>
      )}

      {version === 'full' ? <FullList studio={studio} phone={phone} /> : (lightContent ?? <LightList studio={studio} />)}
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
        <li>{t(studio.id === 'docs' ? 'studioDocsLangNote' : 'studioEnglishNote')}</li>
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

/**
 * Full screen, and in browsers that support it (Chrome, Edge) the keys the browser normally keeps for itself
 * (Ctrl+T, Ctrl+N, Ctrl+W) are handed to the app, so Free Transform and the like work. Released when full screen ends.
 */
async function goFullscreen(el: HTMLElement | null): Promise<void> {
  if (!el?.requestFullscreen) return;
  try {
    await el.requestFullscreen();
  } catch {
    return;
  }
  const kb = (navigator as Navigator & { keyboard?: { lock?: (codes: string[]) => Promise<void>; unlock?: () => void } }).keyboard;
  try {
    await kb?.lock?.(['KeyT', 'KeyN', 'KeyW']);
  } catch {
    /* not supported here: full screen still works */
  }
  el.focus();
  const release = () => {
    if (!document.fullscreenElement) {
      kb?.unlock?.();
      document.removeEventListener('fullscreenchange', release);
    }
  };
  document.addEventListener('fullscreenchange', release);
}

/** The browser-reserved shortcuts each program really uses (from its own key table), named in the full-screen advice. */
const KEYS_BY_APP: Record<string, Key> = {
  word: 'studioKeys_word',
  grid: 'studioKeys_grid',
  deck: 'studioKeys_deck',
  photo: 'studioKeys_photo',
  light: 'studioKeys_light',
  vector: 'studioKeys_vector',
  design: 'studioKeys_design',
  film: 'studioKeys_film',
  effect: 'studioKeys_effect',
  sound: 'studioKeys_sound',
  cad: 'studioKeys_cad',
};

type ProgramLang = 'site' | 'ar' | 'en';
const PROGRAM_LANG_KEY = 'shootcut-program-lang';

function readProgramLang(): ProgramLang {
  try {
    const v = localStorage.getItem(PROGRAM_LANG_KEY);
    return v === 'ar' || v === 'en' ? v : 'site';
  } catch {
    return 'site';
  }
}

function saveProgramLang(v: ProgramLang): void {
  try {
    if (v === 'site') localStorage.removeItem(PROGRAM_LANG_KEY);
    else localStorage.setItem(PROGRAM_LANG_KEY, v);
  } catch {
    /* storage blocked: the choice lasts until the page closes */
  }
}

/** Runs one built app in a frame, with Shootcut's own toolbar and credit line around it. */
export function StudioLauncher({ studio, app }: { studio: Studio; app: StudioApp }) {
  const { t, lang } = useI18n();
  // WebGL is the default: WebGPU can hang the whole browser on some machines. The box switches it off.
  const [webgl, setWebgl] = useState(true);
  // the person's own choice of the program's language, kept in this browser; "site" follows the site's language
  const [choice, setChoice] = useState<ProgramLang>(readProgramLang);
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [fontsOpen, setFontsOpen] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const keys = t(KEYS_BY_APP[app.id] ?? 'studioKeysDefault');
  const lockHint = t('studioLockHint').replace('{keys}', keys);
  // the program opens in the chosen language (?lang=), else Shootcut's, with WebGL compatibility unless switched off
  // only Documents (and the PDF editor) are translated; the Design, Video editing, Audio and Engineering programs stay in English
  const translated = studio.id === 'docs' || studio.id === 'pdf';
  const programLang = !translated ? 'en' : choice === 'site' ? lang : choice;
  const src = `${studioBase(app.id)}index.html?lang=${programLang}${webgl ? '&webgl' : ''}`;

  return (
    <div className="studio-launcher">
      <div className="container launcher-bar">
        <a className="btn btn-ghost" href={`#/studio/${studio.id}`}>
          <ArrowLeft size={16} className="dir-flip" aria-hidden /> {t('studioBackTo')}
        </a>
        <strong dir="auto">{t(app.name)}</strong>
        <span className="launcher-actions">
          {translated && <label className="check">
            {t('studioLang')}
            <select
              value={choice}
              onChange={(e) => {
                const v = e.target.value as ProgramLang;
                setChoice(v);
                saveProgramLang(v);
                setLoaded(false);
              }}
            >
              <option value="site">{t('studioLangSite')}</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>}
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
          <button type="button" className="btn btn-ghost" aria-expanded={fontsOpen} onClick={() => setFontsOpen((v) => !v)}>
            <Type size={14} aria-hidden /> {t('fontsBtn')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setLoaded(false); setNonce((n) => n + 1); }}>
            <RefreshCw size={14} aria-hidden /> {t('studioReload')}
          </button>
          <button type="button" className="btn btn-primary fs-attn" onClick={() => void goFullscreen(frame.current)}>
            <Maximize size={14} aria-hidden /> {t('studioFullscreen')}
          </button>
          <a className="btn btn-ghost" href={src} target="_blank" rel="noopener">
            <ExternalLink size={14} aria-hidden /> {t('studioNewTab')}
          </a>
        </span>
      </div>
      <div className="container">
        <div className="fs-callout" role="note">
          <Maximize size={22} aria-hidden />
          <p>
            <strong>{t('studioLockTitle')}</strong> {lockHint}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void goFullscreen(frame.current)}>
            {t('studioFullscreen')}
          </button>
        </div>
      </div>
      {fontsOpen && <StudioFonts frame={frame} onClose={() => setFontsOpen(false)} />}
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
          onLoad={() => {
            setLoaded(true);
            const win = frame.current?.contentWindow;
            // keyboard shortcuts go to the program at once, not to the page around it
            try { win?.focus(); } catch { /* not allowed: the person clicks into it */ }
            void sendSaved(win);
            // Chosen once by the person: bring in every installed font, only if the browser already allows it (no question on open).
            if (autoImportOn() && canListInstalled()) {
              void installedFontsGranted().then((ok) => {
                if (ok) void importAllInstalled(win).catch(() => 0);
              });
            }
          }}
        />
      </div>
    </div>
  );
}
