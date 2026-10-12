import { useId, type ReactNode } from 'react';
import { FileText, Trash2, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { formatBytes } from '../lib/pdf';
import { parsePageRange } from '../lib/range';
import { useSavedFile } from '../hooks/useSavedFile';

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

/**
 * The file currently being worked on, with a way to pick another one.
 * Unless `keepable` is false, it also says the file is kept on this device and lets the person
 * stop that or delete the saved copy.
 */
export function FileBar({
  name,
  pages,
  size,
  onReset,
  keepable = true,
}: {
  name: string;
  pages?: number;
  size: number;
  onReset: () => void;
  keepable?: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="filebar">
        <FileText size={20} aria-hidden />
        <div className="row-main">
          <div className="row-name" dir="auto" title={name}>
            {name}
          </div>
          <div className="row-meta">
            {pages !== undefined && (
              <>
                {pages} {pages === 1 ? t('pageSingular') : t('pagePlural')} ·{' '}
              </>
            )}
            {formatBytes(size)}
          </div>
        </div>
        <button type="button" className="icon-btn" title={t('changeFile')} aria-label={t('changeFile')} onClick={onReset}>
          <X size={16} aria-hidden />
        </button>
      </div>
      {keepable && <KeepBar name={name} size={size} onDeleted={onReset} />}
    </>
  );
}

/** "Kept on this device only": a switch to stop keeping files, and a button that deletes the saved copy. */
export function KeepBar({ name, size, onDeleted }: { name: string; size: number; onDeleted: () => void }) {
  const { t } = useI18n();
  const { meta, keep, setKeep, forget } = useSavedFile();
  const id = useId();
  const saved = keep && meta !== null && meta.name === name && meta.size === size;
  return (
    <div className="keepbar">
      <label htmlFor={id} className="keepbar-switch">
        <input id={id} type="checkbox" checked={keep} onChange={(e) => void setKeep(e.target.checked)} />
        {t('keepFile')}
      </label>
      {saved && (
        <>
          <span className="muted">{t('keepSaved')}</span>
          <button
            type="button"
            className="btn btn-ghost keepbar-delete"
            onClick={() => {
              void forget();
              onDeleted();
            }}
          >
            <Trash2 size={14} aria-hidden /> {t('keepDelete')}
          </button>
        </>
      )}
    </div>
  );
}

/** Text input for "1-3, 5, 8-"; empty means all pages. */
export function PageRangeField({ value, onChange, total, label }: { value: string; onChange: (v: string) => void; total: number; label?: string }) {
  const { t } = useI18n();
  const valid = parsePageRange(value, total) !== null;
  return (
    <Field label={label ?? t('pagesRange')} hint={`${t('pagesRangeHint')} (1–${total})`}>
      {(id) => (
        <>
          <input
            id={id}
            className={`input${valid ? '' : ' is-invalid'}`}
            dir="ltr"
            inputMode="numeric"
            value={value}
            placeholder={t('allPages')}
            aria-invalid={!valid}
            onChange={(e) => onChange(e.target.value)}
          />
          {!valid && (
            <p className="notice notice-error" role="alert">
              {t('pagesRangeInvalid')}
            </p>
          )}
        </>
      )}
    </Field>
  );
}

export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
