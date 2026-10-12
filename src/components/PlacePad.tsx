import { useRef, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';

interface Props {
  /** the chosen spot, as fractions (0 to 1) from the left and the top */
  value: { x: number; y: number };
  onChange: (v: { x: number; y: number }) => void;
  label: string;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** A small picture-shaped area: click or drag in it to choose where something goes. Arrow keys nudge the spot. */
export function PlacePad({ value, onChange, label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const down = useRef(false);
  const set = (e: RPointerEvent<HTMLDivElement>) => {
    const r = box.current!.getBoundingClientRect();
    onChange({ x: clamp((e.clientX - r.left) / (r.width || 1)), y: clamp((e.clientY - r.top) / (r.height || 1)) });
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.1 : 0.02;
    onChange({ x: clamp(value.x + d[0] * step), y: clamp(value.y + d[1] * step) });
  };
  return (
    <div
      ref={box}
      className="place-pad"
      dir="ltr"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={`${Math.round(value.x * 100)}%, ${Math.round(value.y * 100)}%`}
      aria-valuenow={Math.round(value.x * 100)}
      data-testid="place-pad"
      onPointerDown={(e) => {
        down.current = true;
        try {
          e.currentTarget.setPointerCapture?.(e.pointerId);
        } catch {
          /* capture is only a convenience */
        }
        set(e);
      }}
      onPointerMove={(e) => down.current && set(e)}
      onPointerUp={() => (down.current = false)}
      onPointerCancel={() => (down.current = false)}
      onKeyDown={key}
    >
      <span className="dot" style={{ left: `${value.x * 100}%`, top: `${value.y * 100}%` }} />
    </div>
  );
}
