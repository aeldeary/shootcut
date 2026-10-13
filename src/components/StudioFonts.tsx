import { useEffect, useMemo, useState } from 'react';
import { Type, Trash2, X, Plus } from 'lucide-react';
import { useI18n } from '../i18n';
import {
  FONT_ACCEPT,
  canListInstalled,
  families,
  autoImportOn,
  importAllInstalled,
  setAutoImport,
  isFontFile,
  listInstalled,
  removeFont,
  saveFont,
  savedFonts,
  sendFonts,
  type InstalledFace,
  type SavedFont,
} from '../lib/localFonts';

interface LibFamily {
  family: string;
  arabic: boolean;
  copyright: string;
  files: { file: string; style: string; size: number }[];
}

const LIB = `${import.meta.env.BASE_URL}fonts/library/`;

/** The device-fonts panel of a Studios app: font files, or installed fonts where the browser allows it. */
export function StudioFonts({ frame, onClose }: { frame: React.RefObject<HTMLIFrameElement | null>; onClose: () => void }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState<SavedFont[]>([]);
  const [installed, setInstalled] = useState<InstalledFace[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [auto, setAuto] = useState(autoImportOn());
  const [lib, setLib] = useState<LibFamily[] | null>(null);

  useEffect(() => {
    void savedFonts().then(setSaved);
    fetch(`${LIB}manifest.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((l: LibFamily[]) => setLib(l))
      .catch(() => setLib([]));
  }, []);

  const addFamily = async (f: LibFamily) => {
    setBusy(true);
    try {
      const items: { name: string; bytes: ArrayBuffer }[] = [];
      for (const x of f.files) {
        const r = await fetch(`${LIB}${x.file}`);
        if (!r.ok) throw new Error('font');
        items.push({ name: x.file, bytes: await r.arrayBuffer() });
      }
      await give(items);
    } catch {
      setMessage(t('fontsLibFail'));
    } finally {
      setBusy(false);
    }
  };

  const give = async (items: { name: string; bytes: ArrayBuffer }[]) => {
    const kept: SavedFont[] = [];
    for (const it of items) kept.push(await saveFont(it.name, it.bytes));
    sendFonts(frame.current?.contentWindow, items.map((i) => i.bytes));
    setSaved(await savedFonts());
    setMessage(t('fontsAdded').replace('{n}', String(items.length)));
    return kept;
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    try {
      const ok = [...files].filter((f) => isFontFile(f.name));
      if (!ok.length) {
        setMessage(t('fontsNotFont'));
        return;
      }
      await give(await Promise.all(ok.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() }))));
    } finally {
      setBusy(false);
    }
  };

  const importAll = async () => {
    setBusy(true);
    setMessage('');
    try {
      const n = await importAllInstalled(frame.current?.contentWindow, (d, m) =>
        setMessage(t('fontsAllProgress').replace('{n}', String(d)).replace('{m}', String(m))),
      );
      setMessage(t('fontsAllDone').replace('{n}', String(n)));
    } catch {
      setMessage(t('fontsDenied'));
    } finally {
      setBusy(false);
    }
  };

  const loadInstalled = async () => {
    setBusy(true);
    setMessage('');
    try {
      setInstalled(await listInstalled());
    } catch {
      setMessage(t('fontsDenied'));
    } finally {
      setBusy(false);
    }
  };

  const addPicked = async () => {
    if (!installed) return;
    setBusy(true);
    try {
      const faces = installed.filter((f) => picked.has(f.family));
      const items: { name: string; bytes: ArrayBuffer }[] = [];
      for (const f of faces) items.push({ name: f.fullName || `${f.family} ${f.style}`, bytes: await f.load() });
      await give(items);
      setPicked(new Set());
    } catch {
      setMessage(t('fontsDenied'));
    } finally {
      setBusy(false);
    }
  };

  const names = useMemo(() => (installed ? families(installed) : []), [installed]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? names.filter((n) => n.toLowerCase().includes(q)) : names).slice(0, 300);
  }, [names, query]);

  return (
    <div className="fonts-panel container" role="dialog" aria-label={t('fontsTitle')}>
      <div className="fonts-head">
        <strong>
          <Type size={16} aria-hidden /> {t('fontsTitle')}
        </strong>
        <button type="button" className="btn btn-ghost" onClick={onClose} aria-label={t('fontsClose')}>
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className="muted small">{t('fontsIntro')}</p>
      <div className="fonts-actions">
        <label className="btn btn-primary">
          {t('fontsAddFiles')}
          <input type="file" multiple accept={FONT_ACCEPT} hidden disabled={busy} onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
        </label>
        {canListInstalled() ? (
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void importAll()}>
              {t('fontsAll')}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => void loadInstalled()}>
              {t('fontsInstalled')}
            </button>
          </>
        ) : (
          <span className="muted small">{t('fontsNoQuery')}</span>
        )}
      </div>
      <h4>{t('fontsLibTitle')}</h4>
      <p className="muted small">{t('fontsLibIntro')}</p>
      {lib === null ? (
        <p className="muted small">{t('fontsLibLoading')}</p>
      ) : (
        <ul className="fonts-list" data-testid="font-library">
          {lib.map((f) => (
            <li key={f.family}>
              <span dir="auto">{f.family}</span> <span className="muted small">({f.files.length})</span>{' '}
              <button type="button" className="btn btn-ghost" disabled={busy} aria-label={`${t('fontsLibAdd')}: ${f.family}`} onClick={() => void addFamily(f)}>
                <Plus size={14} aria-hidden /> {t('fontsLibAdd')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {canListInstalled() && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked);
                setAutoImport(e.target.checked);
                if (e.target.checked) void importAll();
              }}
            />{' '}
            {t('fontsAllAuto')}
          </label>
          <p className="muted small">{t('fontsAllNote')}</p>
        </>
      )}
      {installed && (
        <div className="fonts-installed">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('fontsSearch')} aria-label={t('fontsSearch')} />
          <ul className="fonts-list" role="listbox" aria-multiselectable="true">
            {shown.map((n) => (
              <li key={n}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={picked.has(n)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(n);
                      else next.delete(n);
                      setPicked(next);
                    }}
                  />{' '}
                  <span dir="auto">{n}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary" disabled={busy || !picked.size} onClick={() => void addPicked()}>
            {t('fontsAddSelected').replace('{n}', String(picked.size))}
          </button>
        </div>
      )}
      {message && <p role="status" className="small">{message}</p>}
      <h4>{t('fontsSaved')}</h4>
      {saved.length ? (
        <ul className="fonts-list">
          {saved.map((f) => (
            <li key={f.id}>
              <span dir="auto">{f.name}</span>{' '}
              <button type="button" className="btn btn-ghost" aria-label={`${t('fontsRemove')}: ${f.name}`} onClick={() => void removeFont(f.id).then(() => savedFonts().then(setSaved))}>
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">{t('fontsNone')}</p>
      )}
      {saved.length > 0 && <p className="muted small">{t('fontsRemoveNote')}</p>}
    </div>
  );
}
