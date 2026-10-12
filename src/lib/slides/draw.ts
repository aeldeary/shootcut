import { H, W, bodyLines, layoutBoxes, slideIsRtl, wrapText, type Slide, type Theme } from './model';

const FONT = '"IBM Plex Sans Arabic", Inter, system-ui, sans-serif';

/** Draws one slide on a 1280×720 canvas context. `img` is the decoded picture of the slide, when it has one. */
export function drawSlide(ctx: CanvasRenderingContext2D, slide: Slide, theme: Theme, img?: CanvasImageSource & { width: number; height: number } | null): void {
  const rtl = slideIsRtl(slide);
  const boxes = layoutBoxes(slide.layout);
  ctx.save();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textBaseline = 'top';
  const centered = slide.layout === 'title';
  ctx.textAlign = centered ? 'center' : rtl ? 'right' : 'left';
  const anchorX = (b: { x: number; w: number }) => (centered ? b.x + b.w / 2 : rtl ? b.x + b.w : b.x);

  // accent bar on the reading side
  ctx.fillStyle = theme.accent;
  if (centered) ctx.fillRect(W / 2 - 60, 196, 120, 8);
  else ctx.fillRect(rtl ? W - 36 : 0, 0, 36, H);

  const text = (value: string, box: { x: number; y: number; w: number; h: number }, size: number, weight: number, color: string, lineGap = 1.3, bullets = false) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    const measure = (s: string) => ctx.measureText(s).width;
    const indent = bullets ? size * 1.1 : 0;
    const items = bullets ? bodyLines(value) : [value];
    let y = box.y;
    const gap = size * lineGap;
    for (const item of items) {
      const lines = wrapText(measure, item, box.w - indent);
      lines.forEach((ln, i) => {
        if (y + gap > box.y + box.h + gap * 0.5) return;
        const x = anchorX(box);
        if (bullets && i === 0) {
          ctx.save();
          ctx.fillStyle = theme.accent;
          const bx = rtl ? box.x + box.w - size * 0.3 : box.x + size * 0.3;
          ctx.beginPath();
          ctx.arc(bx, y + size * 0.62, size * 0.14, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillText(ln, bullets ? (rtl ? x - indent : x + indent) : x, y);
        y += gap;
      });
      if (bullets) y += size * 0.35;
    }
  };

  const titleSize = slide.layout === 'title' ? 72 : 52;
  if (slide.title) text(slide.title, boxes.title, titleSize, 700, theme.fg, 1.2);
  if (slide.body) {
    if (slide.layout === 'bullets') text(slide.body, boxes.body, 34, 400, theme.fg, 1.3, true);
    else if (slide.layout === 'title') text(slide.body, boxes.body, 36, 400, theme.muted, 1.3);
    else text(slide.body, boxes.body, slide.layout === 'image' ? 28 : 34, 400, theme.fg, 1.4);
  }
  if (slide.layout === 'image' && boxes.image) {
    const b = boxes.image;
    if (img && img.width > 0) {
      // fit inside the frame without cropping
      const k = Math.min(b.w / img.width, b.h / img.height);
      const w = img.width * k;
      const h = img.height * k;
      ctx.drawImage(img, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
    } else {
      ctx.strokeStyle = theme.muted;
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
  }
  ctx.restore();
}
