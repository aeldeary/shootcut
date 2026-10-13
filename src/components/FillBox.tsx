import type { KeyboardEvent } from 'react';
import type { PageViewportInfo } from '../lib/pdf';
import type { Rect } from '../lib/ops/textselect';
import { alignOf, autoSize, baseOf, type BoxStyle } from '../lib/ops/fillboxes';
import { viewRect } from './marks';

interface Props {
  id: string;
  vp: PageViewportInfo;
  rect: Rect;
  value: string;
  multiline: boolean;
  style: BoxStyle;
  /** the CSS family of an added font file, if the style uses one */
  family?: string;
  label: string;
  selected: boolean;
  onChange: (value: string) => void;
  onFocus: () => void;
  /** Tab / Shift+Tab (and Enter in a one-line box) ask to move: +1 next, -1 previous */
  onMove: (delta: 1 | -1) => void;
}

/** A box on the page that is typed into right where it is, drawn the way it will come out in the saved file. */
export function FillBox({ id, vp, rect, value, multiline, style, family, label, selected, onChange, onFocus, onMove }: Props) {
  const box = viewRect(vp, rect);
  const pt = style.size || (multiline ? Math.min(12, autoSize(Math.min(rect.height, 22))) : autoSize(rect.height));
  const align = alignOf(style.mode);
  const css = {
    ...box,
    fontSize: pt * vp.scale,
    fontFamily: family ? `"${family}", sans-serif` : '"Inter", "IBM Plex Sans Arabic", system-ui, sans-serif',
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    color: style.color,
    textAlign: align === 'start' ? ('start' as const) : align,
  };
  const props = {
    className: `fill-input${selected ? ' is-selected' : ''}`,
    style: css,
    value,
    dir: baseOf(style.mode),
    'data-fill-id': id,
    'aria-label': label,
    onFocus,
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onPointerUp: (e: React.PointerEvent) => e.stopPropagation(),
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      onMove(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      onMove(e.shiftKey ? -1 : 1);
    }
  };
  return multiline ? <textarea {...props} onKeyDown={key} /> : <input type="text" {...props} onKeyDown={key} />;
}
