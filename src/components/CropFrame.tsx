import { useRef, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { dragBox, GRIPS, GRIP_CURSOR, type Box, type Grip } from '../lib/ops/boxedit';

/** A frame in fractions of the picture it sits on: 0 to 1 from the left and the top. */
export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  box: FrameBox;
  onChange: (box: FrameBox) => void;
  /** false: the frame can only be moved (its shape is fixed); true: its edges and corners can be dragged too */
  resizable?: boolean;
  label?: string;
}

/**
 * The area to keep, drawn over a video or a page. Drag the middle to move it; drag a handle to change its size
 * (when `resizable`). Arrow keys move it, Ctrl+arrows resize it. It must sit inside a `position: relative` box
 * that has the same size as the picture.
 */
export function CropFrame({ box, onChange, resizable = false, label }: Props) {
  const drag = useRef<{ grip: Grip; x: number; y: number; start: Box; stage: { width: number; height: number } } | null>(null);

  const frame = useRef<HTMLDivElement>(null);
  const stageSize = (_el?: HTMLElement) => {
    const r = frame.current!.parentElement!.getBoundingClientRect();
    return { width: r.width || 1, height: r.height || 1 };
  };
  const toPx = (s: { width: number; height: number }): Box => ({ left: box.x * s.width, top: box.y * s.height, width: box.w * s.width, height: box.h * s.height });
  const emit = (b: Box, s: { width: number; height: number }) => onChange({ x: b.left / s.width, y: b.top / s.height, w: b.width / s.width, h: b.height / s.height });

  const start = (grip: Grip) => (e: RPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* capture is only a convenience */
    }
    const stage = stageSize(e.currentTarget);
    drag.current = { grip, x: e.clientX, y: e.clientY, start: toPx(stage), stage };
  };
  const move = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    e.stopPropagation();
    emit(dragBox(d.start, d.grip, e.clientX - d.x, e.clientY - d.y, d.stage, 12), d.stage);
  };
  const end = () => {
    drag.current = null;
  };
  const key = (e: KeyboardEvent<HTMLElement>) => {
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = dirs[e.key];
    if (!dir) return;
    e.preventDefault();
    const s = stageSize(e.currentTarget);
    const step = (e.shiftKey ? 0.05 : 0.01) * s.width;
    const grip: Grip = (e.ctrlKey || e.metaKey) && resizable ? 'se' : 'move';
    emit(dragBox(toPx(s), grip, dir[0] * step, dir[1] * step, s, 12), s);
  };

  return (
    <div
      ref={frame}
      className="vid-crop crop-frame"
      data-testid="crop-frame"
      role="group"
      tabIndex={0}
      aria-label={label}
      style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, cursor: GRIP_CURSOR.move, touchAction: 'none' }}
      onPointerDown={start('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={key}
    >
      {resizable &&
        GRIPS.map((g) => (
          <span key={g} className={`grip grip-${g}`} data-grip={g} style={{ cursor: GRIP_CURSOR[g] }} onPointerDown={start(g)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
        ))}
    </div>
  );
}
