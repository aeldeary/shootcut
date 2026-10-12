import { Sparkles } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useI18n } from './i18n';
import { Header, PrivacyBadge } from './components/Shell';
import { GROUPS, SECTIONS, TOOLS, WHATS_NEW, findTool, sectionOfRoute, type SectionId } from './lib/tools';
import { FeaturesPage } from './components/FeaturesPage';
import { useShortcuts } from './hooks/useShortcuts';
import { holdFile } from './lib/handoff';
import { saveFile } from './lib/persist';
import { notify, useToast } from './lib/toast';
import { StudiosBlock, StudioPage, StudioLauncher } from './components/Studios';
import { parseStudioRoute } from './lib/studios';

const COMPONENTS: Record<string, ReturnType<typeof lazy>> = {
  'img-compress': lazy(() => import('./tools/ImageBatchTools').then((m) => ({ default: m.ImgCompressTool }))),
  'img-resize': lazy(() => import('./tools/ImageBatchTools').then((m) => ({ default: m.ImgResizeTool }))),
  'img-rotate': lazy(() => import('./tools/ImageBatchTools').then((m) => ({ default: m.ImgRotateTool }))),
  'img-adjust': lazy(() => import('./tools/ImageBatchTools').then((m) => ({ default: m.ImgAdjustTool }))),
  'img-convert': lazy(() => import('./tools/ImageBatchTools').then((m) => ({ default: m.ImgConvertTool }))),
  'img-social': lazy(() => import('./tools/ImageBatchTools').then((m) => ({ default: m.ImgSocialTool }))),
  'img-watermark': lazy(() => import('./tools/ImageBatchTools').then((m) => ({ default: m.ImgWatermarkTool }))),
  'img-upscale': lazy(() => import('./tools/ImageBatchTools').then((m) => ({ default: m.ImgUpscaleTool }))),
  'img-crop': lazy(() => import('./tools/ImageEditTools').then((m) => ({ default: m.ImgCropTool }))),
  'pdf-split': lazy(() => import('./tools/PdfPageTools').then((m) => ({ default: m.PdfSplitTool }))),
  'pdf-extract': lazy(() => import('./tools/PdfPageTools').then((m) => ({ default: m.PdfExtractTool }))),
  'pdf-crop': lazy(() => import('./tools/PdfPageTools').then((m) => ({ default: m.PdfCropTool }))),
  'pdf-layout': lazy(() => import('./tools/PdfExtraTools').then((m) => ({ default: m.PdfLayoutTool }))),
  'pdf-clean': lazy(() => import('./tools/PdfExtraTools').then((m) => ({ default: m.PdfCleanTool }))),
  'pdf-a11y': lazy(() => import('./tools/PdfExtraTools').then((m) => ({ default: m.PdfA11yTool }))),
  'pdf-repair': lazy(() => import('./tools/PdfPageTools').then((m) => ({ default: m.PdfRepairTool }))),
  'img-blur': lazy(() => import('./tools/ImageEditTools').then((m) => ({ default: m.ImgBlurTool }))),
  'vid-convert': lazy(() => import('./tools/VideoTools').then((m) => ({ default: m.VidConvertTool }))),
  'vid-compress': lazy(() => import('./tools/VideoTools').then((m) => ({ default: m.VidCompressTool }))),
  'vid-resize': lazy(() => import('./tools/VideoTools').then((m) => ({ default: m.VidResizeTool }))),
  'vid-trim': lazy(() => import('./tools/VideoTools').then((m) => ({ default: m.VidTrimTool }))),
  'vid-merge': lazy(() => import('./tools/VideoTools').then((m) => ({ default: m.VidMergeTool }))),
  'vid-crop': lazy(() => import('./tools/VideoTools').then((m) => ({ default: m.VidCropTool }))),
  'vid-rotate': lazy(() => import('./tools/VideoTools').then((m) => ({ default: m.VidRotateTool }))),
  'vid-speed': lazy(() => import('./tools/VideoTools').then((m) => ({ default: m.VidSpeedTool }))),
  sheet: lazy(() => import('./tools/SheetLight')),
  slides: lazy(() => import('./tools/SlidesLight')),
  'aud-trim': lazy(() => import('./tools/AudioTools').then((m) => ({ default: m.AudTrimTool }))),
  'aud-convert': lazy(() => import('./tools/AudioTools').then((m) => ({ default: m.AudConvertTool }))),
  'aud-merge': lazy(() => import('./tools/AudioTools').then((m) => ({ default: m.AudMergeTool }))),
  'aud-polish': lazy(() => import('./tools/AudioTools').then((m) => ({ default: m.AudPolishTool }))),
  'vid-audio': lazy(() => import('./tools/VideoTools').then((m) => ({ default: m.VidAudioTool }))),
  'vid-gif': lazy(() => import('./tools/VideoTools').then((m) => ({ default: m.VidGifTool }))),
  'vid-thumb': lazy(() => import('./tools/VideoExtraTools').then((m) => ({ default: m.VidThumbTool }))),
  'vid-info': lazy(() => import('./tools/VideoExtraTools').then((m) => ({ default: m.VidInfoTool }))),
  'img-meme': lazy(() => import('./tools/ImageEditTools').then((m) => ({ default: m.ImgMemeTool }))),
  'img-transparent': lazy(() => import('./tools/ImageEditTools').then((m) => ({ default: m.ImgTransparentTool }))),
  merge: lazy(() => import('./tools/Merge').then((m) => ({ default: m.MergeTool }))),
  organize: lazy(() => import('./tools/Organize').then((m) => ({ default: m.OrganizeTool }))),
  create: lazy(() => import('./tools/Create').then((m) => ({ default: m.CreateTool }))),
  export: lazy(() => import('./tools/Export').then((m) => ({ default: m.ExportTool }))),
  stamp: lazy(() => import('./tools/Stamp').then((m) => ({ default: m.StampTool }))),
  optimize: lazy(() => import('./tools/Optimize').then((m) => ({ default: m.OptimizeTool }))),
  protect: lazy(() => import('./tools/Protect').then((m) => ({ default: m.ProtectTool }))),
  comment: lazy(() => import('./tools/Comment').then((m) => ({ default: m.CommentTool }))),
  redact: lazy(() => import('./tools/Redact').then((m) => ({ default: m.RedactTool }))),
  measure: lazy(() => import('./tools/Measure').then((m) => ({ default: m.MeasureTool }))),
  'fill-sign': lazy(() => import('./tools/FillSign').then((m) => ({ default: m.FillSignTool }))),
  form: lazy(() => import('./tools/Form').then((m) => ({ default: m.FormTool }))),
  ocr: lazy(() => import('./tools/Ocr').then((m) => ({ default: m.OcrTool }))),
  inspect: lazy(() => import('./tools/Inspect').then((m) => ({ default: m.InspectTool }))),
  viewer: lazy(() => import('./tools/Viewer').then((m) => ({ default: m.ViewerTool }))),
  print: lazy(() => import('./tools/Print').then((m) => ({ default: m.PrintTool }))),
  share: lazy(() => import('./tools/Share').then((m) => ({ default: m.ShareTool }))),
  convert: lazy(() => import('./tools/Convert').then((m) => ({ default: m.ConvertTool }))),
  compare: lazy(() => import('./tools/Compare').then((m) => ({ default: m.CompareTool }))),
};

function useHashRoute(): string {
  const read = () => window.location.hash.replace(/^#\/?/, '');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

function ToolGrid({ section }: { section: SectionId }) {
  const { t } = useI18n();
  return (
    <>
      {GROUPS.filter((g) => g.section === section).map((g) => (
        <section key={g.id} className="group" aria-labelledby={`g-${g.id}`}>
          <h2 id={`g-${g.id}`}>{t(g.title)}</h2>
          <div className="grid">
            {TOOLS.filter((x) => x.group === g.id).map((tool) => {
              const Icon = tool.icon;
              const body = (
                <>
                  <span className="card-icon">
                    <Icon size={22} aria-hidden />
                  </span>
                  <span className="card-text">
                    <span className="card-name">{t(tool.name)}</span>
                    <span className="card-desc">{t(tool.desc)}</span>
                  </span>
                  {tool.status === 'soon' && <span className="tag">{t('soon')}</span>}
                  {WHATS_NEW.find((w) => w.id === tool.id) && <span className="tag tag-new">{t(WHATS_NEW.find((w) => w.id === tool.id)!.kind === 'new' ? 'badgeNew' : 'badgeUpdated')}</span>}
                </>
              );
              return tool.status === 'ready' ? (
                <a key={tool.id} className="card" href={`#/${tool.id}`}>
                  {body}
                </a>
              ) : (
                <div key={tool.id} className="card is-disabled" aria-disabled="true">
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

/** The home page: three choices, nothing else. */
function Home() {
  const { t } = useI18n();
  return (
    <>
      <section className="hero">
        <div className="container">
          <img className="hero-logo" src="./logo.svg" alt="" width={190} height={201} />
          <h1 dir="ltr" className="hero-title sr-only">
            {t('appName')}
          </h1>
          <p className="lead">{t('tagline')}</p>
          <PrivacyBadge />
        </div>
      </section>
      <div className="container">
        <nav className="sections" aria-label={t('sectionsNav')}>
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            return (
              <a key={sec.id} className="section-card" href={`#/${sec.id}`}>
                <span className="section-icon">
                  <Icon size={34} aria-hidden />
                </span>
                <span className="section-name">{t(sec.title)}</span>
                <span className="muted">{t(sec.desc)}</span>
              </a>
            );
          })}
        </nav>
        <StudiosBlock />
        <section className="whats-new" aria-labelledby="whats-new-title">
          <h2 id="whats-new-title">{t('whatsNew')}</h2>
          <ul>
            {WHATS_NEW.map((w) => {
              const tool = TOOLS.find((x) => x.id === w.id)!;
              return (
                <li key={w.id}>
                  <a href={`#/${w.id}`}>
                    <span className={`tag tag-new${w.kind === 'updated' ? ' is-updated' : ''}`}>{t(w.kind === 'new' ? 'badgeNew' : 'badgeUpdated')}</span>
                    <strong>{t(tool.name)}</strong>
                    <span className="muted"> — {t(w.note)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
        <a className="features-banner" href="#/features">
          <Sparkles size={26} aria-hidden />
          <span className="features-banner-text">
            <span className="section-name">{t('homeFeatures')}</span>
            <span className="muted">{t('homeFeaturesDesc')}</span>
          </span>
        </a>
      </div>
    </>
  );
}

function SectionPage({ section }: { section: SectionId }) {
  const { t } = useI18n();
  const sec = SECTIONS.find((x) => x.id === section)!;
  return (
    <div className="container">
      <h1 className="section-title">{t(sec.title)}</h1>
      <p className="muted lead">{t(sec.desc)}</p>
      <ToolGrid section={section} />
    </div>
  );
}

function go(id: string) {
  window.location.hash = `#/${id}`;
}

/** Open a PDF from anywhere: use the tool's own picker if there is one, else pick and hand it to Browse. */
function openFromAnywhere(): boolean {
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  if (input) {
    input.click();
    return true;
  }
  const pick = document.createElement('input');
  pick.type = 'file';
  pick.accept = 'application/pdf,.pdf';
  pick.onchange = () => {
    const f = pick.files?.[0];
    if (!f) return;
    holdFile(f);
    void saveFile(f);
    go('inspect');
  };
  pick.click();
  return true;
}

export default function App() {
  const route = useHashRoute();
  const toastText = useToast();
  useShortcuts(
    {
      open: openFromAnywhere,
      save: () => {
        const btn = document.querySelector<HTMLButtonElement>('button[data-save]:not(:disabled)');
        if (btn) btn.click();
        else notify('toastNothingToSave');
        return true; // never let the browser's "Save page" dialog open
      },
      print: () => {
        go('print');
        return true;
      },
      properties: () => {
        go('inspect');
        return true;
      },
      help: () => {
        go('shortcuts');
        return true;
      },
    },
    0,
  );
  const tool = findTool(route);
  const page = route === 'features' || route === 'shortcuts';
  const section = sectionOfRoute(route);
  const studioRoute = parseStudioRoute(route);
  const sectionPage = route === 'pdf' || route === 'image' || route === 'video' || route === 'office' ? route : null;
  const active = tool && tool.status === 'ready' ? tool.id : null;
  const Active = active ? COMPONENTS[active] : undefined;

  return (
    <>
      <Header showBack={active !== null || page || sectionPage !== null || studioRoute !== null} activeId={active} section={section} />
      <main>
        <Suspense fallback={null}>
          {studioRoute ? (
            studioRoute.app ? (
              <StudioLauncher key={studioRoute.app.id} studio={studioRoute.studio} app={studioRoute.app} />
            ) : (
              <StudioPage key={studioRoute.studio.id} studio={studioRoute.studio} />
            )
          ) : page ? (
            <FeaturesPage scrollTo={route === 'shortcuts' ? 'shortcuts' : undefined} />
          ) : sectionPage ? (
            <SectionPage section={sectionPage} />
          ) : Active ? (
            <Active key={active} />
          ) : (
            <Home />
          )}
        </Suspense>
      </main>
      {toastText && <div className="toast" role="status">{toastText}</div>}
    </>
  );
}
