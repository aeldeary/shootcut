import { useRef, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { dragBox, GRIPS, GRIP_CURSOR, type Box, type Grip } from '../lib/ops/boxedit';
import type { PageViewportInfo } from '../lib/pdf';
import type { Rect } from '../lib/ops/textselect';
import { pdfRectFromView, viewRect } from './marks';

interface Props {
  vp: PageViewportInfo;
  /** the box in PDF points */
  rect: Rect;
  selected: boolean;
  className?: string;
  /** smallest size in screen pixels */
  min?: number;
  onSelect: () => void;
  onChange: (rect: Rect) => void;
  onDelete?: () => void;
  label?: string;
  children?: ReactNode;
}

/**
 * A box on a page that can be selected, dragged and resized: drag the middle to move it, drag a handle on an edge or
 * corner to change its width and height. With the keyboard, arrows move it and Ctrl+arrows resize it (hold Shift for big steps).
 */
export function EditableBox({ vp, rect, selected, className = '', min = 8, onSelect, onChange, onDelete, label, children }: Props) {
  const drag = useRef<{ grip: Grip; x: number; y: number; box: Box} | null>(null);
  const style = viewRect(vp, rect);
  const box = (): Box => ({ left: Number(style.left), top: Number(style.top), width: Number(style.width), height: Number(style.height) });

  const commit = (b: Box) => onChange(pdfRectFromView(vp, [b.left, b.top], [b.left + b.width, b.top + b.height]));

  const start = (grip: Grip) => (e: RPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    onSelect();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is only a convenience */
    }
    drag.current = { grip, x: e.clientX, y: e.clientY, box: box() };
  };
  const move = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    commit(dragBox(d.box, d.grip, e.clientX - d.x, e.clientY - d.y, { width: vp.width, height: vp.height }, min));
  };
  const end = (e: RPointerEvent<HTMLElement>) => {
    if (drag.current) e.stopPropagation();
    drag.current = null;
  };

  const key = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (onDelete) {
        e.preventDefault();
        e.stopPropagation();
        onDelete();
      }
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = dirs[e.key];
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation();
    const b = box();
    const bounds = { width: vp.width, height: vp.height };
    // Ctrl: grow or shrink from the bottom-right corner; otherwise move
    commit(e.ctrlKey || e.metaKey ? dragBox(b, 'se', dir[0] * step, dir[1] * step, bounds, min) : dragBox(b, 'move', dir[0] * step, dir[1] * step, bounds, min));
  };

  return (
    <span
      className={`mark editable-box${selected ? ' is-selected' : ''} ${className}`}
      style={{ ...style, cursor: GRIP_CURSOR.move, touchAction: 'none' }}
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-pressed={selected}
      data-testid="editable-box"
      onPointerDown={start('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onFocus={onSelect}
      onKeyDown={key}
    >
      {children}
      {selected &&
        GRIPS.map((g) => (
          <span
            key={g}
            className={`grip grip-${g}`}
            data-grip={g}
            style={{ cursor: GRIP_CURSOR[g] }}
            onPointerDown={start(g)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        ))}
    </span>
  );
}
