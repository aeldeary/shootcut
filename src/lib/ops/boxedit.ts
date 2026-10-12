/** Moving and resizing a box with the mouse. Boxes are in screen pixels: left, top, width, height. */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Which part of the box is held: the middle moves it, an edge or corner resizes it. */
export type Grip = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const GRIPS: Exclude<Grip, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * The box after the pointer moved by (dx, dy) from where it was grabbed. The box never gets smaller than
 * `min` and never leaves the page (`bounds`).
 */
export function dragBox(start: Box, grip: Grip, dx: number, dy: number, bounds: { width: number; height: number }, min = 8): Box {
  if (grip === 'move') {
    const left = Math.min(Math.max(start.left + dx, 0), Math.max(0, bounds.width - start.width));
    const top = Math.min(Math.max(start.top + dy, 0), Math.max(0, bounds.height - start.height));
    return { left, top, width: start.width, height: start.height };
  }
  let x0 = start.left;
  let y0 = start.top;
  let x1 = start.left + start.width;
  let y1 = start.top + start.height;
  if (grip.includes('w')) x0 = Math.min(Math.max(x0 + dx, 0), x1 - min);
  if (grip.includes('e')) x1 = Math.max(Math.min(x1 + dx, bounds.width), x0 + min);
  if (grip.includes('n')) y0 = Math.min(Math.max(y0 + dy, 0), y1 - min);
  if (grip.includes('s')) y1 = Math.max(Math.min(y1 + dy, bounds.height), y0 + min);
  return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
}

/** The cursor that suits each grip. */
export const GRIP_CURSOR: Record<Grip, string> = {
  move: 'move',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};
