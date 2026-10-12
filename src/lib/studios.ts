import { FileText, Palette, Clapperboard, AudioLines, DraftingCompass, type LucideIcon } from 'lucide-react';
import type { Key } from '../i18n';

export type StudioId = 'docs' | 'design' | 'film' | 'audio' | 'cad';

/** One embedded web app. `id` is the folder under public/studio and the id in .github/workflows/studios.yml. */
export interface StudioApp {
  id: string;
  /** repository under github.com/storytold that the app is built from, unmodified */
  repo: string;
  name: Key;
  desc: Key;
}

export interface Studio {
  id: StudioId;
  name: Key;
  desc: Key;
  icon: LucideIcon;
  apps: StudioApp[];
  /** Light version: ids of Shootcut tools (see lib/tools.ts) that cover the same job on any device. */
  light: string[];
}

export const STUDIOS: Studio[] = [
  {
    id: 'docs',
    name: 'studioDocs',
    desc: 'studioDocsDesc',
    icon: FileText,
    apps: [
      { id: 'word', repo: 'wordcraft', name: 'appWord', desc: 'appWordDesc' },
      { id: 'grid', repo: 'gridcraft', name: 'appGrid', desc: 'appGridDesc' },
      { id: 'deck', repo: 'deckcraft', name: 'appDeck', desc: 'appDeckDesc' },
    ],
    light: ['sheet', 'slides', 'create', 'convert'],
  },
  {
    id: 'design',
    name: 'studioDesign',
    desc: 'studioDesignDesc',
    icon: Palette,
    apps: [
      { id: 'photo', repo: 'photocraft', name: 'appPhoto', desc: 'appPhotoDesc' },
      { id: 'light', repo: 'lightcraft', name: 'appLight', desc: 'appLightDesc' },
      { id: 'vector', repo: 'vectorcraft', name: 'appVector', desc: 'appVectorDesc' },
      { id: 'design', repo: 'designcraft', name: 'appDesign', desc: 'appDesignDesc' },
    ],
    light: ['img-crop', 'img-resize', 'img-adjust', 'img-transparent', 'img-convert', 'img-social', 'img-watermark', 'img-blur'],
  },
  {
    id: 'film',
    name: 'studioFilm',
    desc: 'studioFilmDesc',
    icon: Clapperboard,
    apps: [
      { id: 'film', repo: 'filmcraft', name: 'appFilm', desc: 'appFilmDesc' },
      { id: 'effect', repo: 'effectcraft', name: 'appEffect', desc: 'appEffectDesc' },
    ],
    light: ['vid-trim', 'vid-merge', 'vid-crop', 'vid-speed', 'vid-compress', 'vid-convert', 'vid-gif'],
  },
  {
    id: 'audio',
    name: 'studioAudio',
    desc: 'studioAudioDesc',
    icon: AudioLines,
    apps: [{ id: 'sound', repo: 'soundcraft', name: 'appSound', desc: 'appSoundDesc' }],
    light: ['aud-trim', 'aud-convert', 'aud-merge', 'aud-polish', 'vid-audio'],
  },
  {
    id: 'cad',
    name: 'studioCad',
    desc: 'studioCadDesc',
    icon: DraftingCompass,
    apps: [{ id: 'cad', repo: 'cadcraft', name: 'appCad', desc: 'appCadDesc' }],
    light: [],
  },
];

export function findStudio(id: string): Studio | undefined {
  return STUDIOS.find((s) => s.id === id);
}

export function findStudioApp(studio: Studio, appId: string): StudioApp | undefined {
  return studio.apps.find((a) => a.id === appId);
}

export type StudioRoute = { studio: Studio; app: StudioApp | null } | null;

/** `studio/<id>` is a studio's page; `studio/<id>/<app>` opens one of its apps. */
export function parseStudioRoute(route: string): StudioRoute {
  const m = /^studio\/([a-z]+)(?:\/([a-z]+))?$/.exec(route);
  if (!m) return null;
  const studio = findStudio(m[1]);
  if (!studio) return null;
  if (!m[2]) return { studio, app: null };
  const app = findStudioApp(studio, m[2]);
  return app ? { studio, app } : null;
}

/** Where a built app lives, relative to the page (the site uses relative URLs so it works under any repository name). */
export const studioBase = (appId: string) => `./studio/${appId}/`;

export interface StudioBuild {
  repo: string;
  sha: string;
  builtAt: string;
  wasmBytes: number;
}

/** Reads build.json of a built app. Resolves null when the app is not published (a static host may answer 200 with the home page, so the JSON is checked). */
export async function probeStudio(app: StudioApp, fetcher: typeof fetch = fetch): Promise<StudioBuild | null> {
  try {
    const res = await fetcher(`${studioBase(app.id)}build.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<StudioBuild>;
    if (j.repo !== app.repo || typeof j.sha !== 'string') return null;
    return { repo: j.repo, sha: j.sha, builtAt: String(j.builtAt ?? ''), wasmBytes: Number(j.wasmBytes) || 0 };
  } catch {
    return null;
  }
}

/** True on phones and tablets: a narrow window or a touch screen as the main pointer. */
export function looksLikePhone(mq: (q: string) => { matches: boolean } = (q) => window.matchMedia(q)): boolean {
  try {
    return mq('(max-width: 820px)').matches || mq('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}
