import type { PDFPage } from 'pdf-lib';

/** Size of the page as the viewer shows it (rotation applied). */
export function viewSize(page: PDFPage): { width: number; height: number; rotation: number } {
  const { width, height } = page.getSize();
  const rotation = (((page.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  return rotation === 90 || rotation === 270 ? { width: height, height: width, rotation } : { width, height, rotation };
}

/**
 * Converts a point given in the page as the viewer shows it (origin bottom-left, y up) into the
 * page's own coordinate space, which is what the drawing functions use.
 */
export function viewToUser(page: PDFPage, vx: number, vy: number): [number, number] {
  const { width: W, height: H } = page.getSize();
  switch (viewSize(page).rotation) {
    case 90:
      return [W - vy, vx];
    case 180:
      return [W - vx, H - vy];
    case 270:
      return [vy, H - vx];
    default:
      return [vx, vy];
  }
}

/** Angle (degrees, counter-clockwise) to draw in page space so it looks like `viewAngle` in the viewer. */
export function viewAngleToUser(page: PDFPage, viewAngle: number): number {
  return viewAngle + viewSize(page).rotation;
}
