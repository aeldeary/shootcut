import { Bold, Italic, Underline } from 'lucide-react';
import { useRef } from 'react';
import { useI18n } from '../i18n';
import { Checkbox, Field } from './Fields';
import type { BoxMode, BoxStyle } from '../lib/ops/fillboxes';

export interface AddedFont {
  id: string;
  name: string;
}

interface Props {
  style: BoxStyle;
  all: boolean;
  fonts: AddedFont[];
  error: string | null;
  onAll: (v: boolean) => void;
  onChange: (patch: Partial<BoxStyle>) => void;
  onAddFont: (file: File) => void;
}

const MODES: { id: BoxMode; label: 'fillDirAuto' | 'fillDirRtl' | 'fillDirLtr' | 'fillDirCenter' }[] = [
  { id: 'auto', label: 'fillDirAuto' },
  { id: 'rtl', label: 'fillDirRtl' },
  { id: 'ltr', label: 'fillDirLtr' },
  { id: 'center', label: 'fillDirCenter' },
];

/** Font, weight, colour, direction and size of the text typed in the boxes. */
export function FillStyle({ style, all, fonts, error, onAll, onChange, onAddFont }: Props) {
  const { t } = useI18n();
  const pick = useRef<HTMLInputElement>(null);
  return (
    <div className="panel">
      <p className="panel-title">{t('fillStyleTitle')}</p>
      <Checkbox checked={all} onChange={onAll}>{t('fillAll')}</Checkbox>
      <Field label={t('fillFont')}>
        {(id) => (
          <select id={id} className="input" value={style.font} onChange={(e) => (e.target.value === '__add' ? pick.current?.click() : onChange({ font: e.target.value }))}>
            <option value="plain">{t('fillFontPlain')}</option>
            {fonts.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
            <option value="__add">{t('fillFontAdd')}</option>
          </select>
        )}
      </Field>
      <input
        ref={pick}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAddFont(f);
          e.target.value = '';
        }}
      />
      {error && <p className="muted" role="alert">{error}</p>}
      <div className="mode-bar" role="group" aria-label={t('fillStyleTitle')}>
        <button type="button" className="mode-btn" aria-pressed={style.bold} onClick={() => onChange({ bold: !style.bold })} title={t('fillBold')}>
          <Bold size={16} aria-hidden /> {t('fillBold')}
        </button>
        <button type="button" className="mode-btn" aria-pressed={style.italic} onClick={() => onChange({ italic: !style.italic })} title={t('fillItalic')}>
          <Italic size={16} aria-hidden /> {t('fillItalic')}
        </button>
        <button type="button" className="mode-btn" aria-pressed={style.underline} onClick={() => onChange({ underline: !style.underline })} title={t('fillUnderline')}>
          <Underline size={16} aria-hidden /> {t('fillUnderline')}
        </button>
      </div>
      <Field label={t('fillColor')}>
        {(id) => <input id={id} type="color" className="input" value={style.color} onChange={(e) => onChange({ color: e.target.value })} />}
      </Field>
      <p className="panel-title">{t('fillDir')}</p>
      <div className="mode-bar" role="group" aria-label={t('fillDir')}>
        {MODES.map((m) => (
          <button key={m.id} type="button" className="mode-btn" aria-pressed={style.mode === m.id} onClick={() => onChange({ mode: m.id })}>
            {t(m.label)}
          </button>
        ))}
      </div>
      <Field label={t('fillSize')}>
        {(id) => (
          <input id={id} type="number" min={0} max={72} step={1} className="input" dir="ltr" value={style.size} onChange={(e) => onChange({ size: Math.max(0, Math.min(72, Number(e.target.value) || 0)) })} />
        )}
      </Field>
    </div>
  );
}
