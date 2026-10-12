import { useI18n } from '../i18n';
import type { Rect } from '../lib/ops/textselect';
import { Field } from './Fields';

const MIN = 4;

/** Position and size of a box in points, for typing exact numbers. */
export function RectFields({ rect, onChange }: { rect: Rect; onChange: (rect: Rect) => void }) {
  const { t } = useI18n();
  const num = (key: keyof Rect, label: 'rectX' | 'rectY' | 'rectWidth' | 'rectHeight') => (
    <Field label={`${t(label)} (${t('rectUnit')})`}>
      {(id) => (
        <input
          id={id}
          className="input"
          type="number"
          dir="ltr"
          step={1}
          min={key === 'width' || key === 'height' ? MIN : undefined}
          value={Math.round(rect[key] * 10) / 10}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isNaN(v)) return;
            onChange({ ...rect, [key]: key === 'width' || key === 'height' ? Math.max(MIN, v) : v });
          }}
        />
      )}
    </Field>
  );
  return (
    <div className="grid-2 rect-fields">
      {num('width', 'rectWidth')}
      {num('height', 'rectHeight')}
      {num('x', 'rectX')}
      {num('y', 'rectY')}
    </div>
  );
}
