import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Field } from './Fields';
import { canvasToBytes, createCanvas, decodeImage } from '../lib/pdf';
import { contentBounds } from '../lib/signature';

export interface SignatureImage {
  bytes: Uint8Array;
  mime: 'image/png';
  /** width / height */
  aspect: number;
}

type Tab = 'draw' | 'type' | 'image';
const W = 480;
const H = 180;

async function exportCanvas(src: HTMLCanvasElement): Promise<SignatureImage | null> {
  const ctx = src.getContext('2d');
  if (!ctx) return null;
  const b = contentBounds(ctx.getImageData(0, 0, src.width, src.height).data, src.width, src.height);
  if (!b) return null;
  const pad = 6;
  const out = createCanvas(b.width + pad * 2, b.height + pad * 2);
  out.getContext('2d').drawImage(src, b.x, b.y, b.width, b.height, pad, pad, b.width, b.height);
  return { bytes: await canvasToBytes(out, 'image/png'), mime: 'image/png', aspect: out.width / out.height };
}

/** Draw, type or upload a signature. It is only used for this document and never stored. */
export function SignaturePad({ onUse, onCancel }: { onUse: (s: SignatureImage) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('draw');
  const [typed, setTyped] = useState('');
  const [empty, setEmpty] = useState(true);
  const [error, setError] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const clear = () => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };

  useEffect(() => {
    clear();
    setTyped('');
  }, [tab]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / (r.width || W)) * W, ((e.clientY - r.top) / (r.height || H)) * H];
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const [x, y] = pos(e);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
    setEmpty(false);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => {
    drawing.current = false;
  };

  const renderTyped = (text: string) => {
    setTyped(text);
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!text.trim()) {
      setEmpty(true);
      return;
    }
    ctx.fillStyle = '#111827';
    ctx.font = 'italic 64px "Segoe Script", "Brush Script MT", "Snell Roundhand", "Lucida Handwriting", cursive, serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 20, H / 2, W - 40);
    setEmpty(false);
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setError(false);
    try {
      const source = await decodeImage(new Uint8Array(await file.arrayBuffer()));
      const c = canvas.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      const s = Math.min(W / source.width, H / source.height);
      ctx.drawImage(source as unknown as CanvasImageSource, 0, 0, source.width * s, source.height * s);
      // make a white scan background transparent so it does not hide the document
      const img = ctx.getImageData(0, 0, c.width, c.height);
      for (let p = 0; p < img.data.length; p += 4) {
        if (img.data[p + 3] > 0 && img.data[p] > 235 && img.data[p + 1] > 235 && img.data[p + 2] > 235) img.data[p + 3] = 0;
      }
      ctx.putImageData(img, 0, 0);
      setEmpty(false);
    } catch {
      setError(true);
    }
  };

  const use = async () => {
    if (!canvas.current) return;
    const sig = await exportCanvas(canvas.current);
    if (sig) onUse(sig);
    else setError(true);
  };

  return (
    <div className="panel">
      <div className="tabs" role="tablist">
        {(['draw', 'type', 'image'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' is-active' : ''}`} onClick={() => setTab(k)}>
            {t(k === 'draw' ? 'signDraw' : k === 'type' ? 'signType' : 'signImage')}
          </button>
        ))}
      </div>
      {tab === 'type' && (
        <Field label={t('signTypeLabel')}>
          {(id) => <input id={id} className="input" dir="auto" value={typed} onChange={(e) => renderTyped(e.target.value)} />}
        </Field>
      )}
      {tab === 'image' && (
        <Field label={t('signImageLabel')} hint={t('signImageHint')}>
          {(id) => <input id={id} className="input" type="file" accept="image/*" onChange={(e) => pickImage(e.target.files?.[0])} />}
        </Field>
      )}
      <canvas
        ref={canvas}
        className="sig-canvas"
        width={W}
        height={H}
        onPointerDown={tab === 'draw' ? down : undefined}
        onPointerMove={tab === 'draw' ? move : undefined}
        onPointerUp={up}
        onPointerLeave={up}
        aria-label={t('signArea')}
      />
      {error && <p className="notice notice-error" role="alert">{t('signError')}</p>}
      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={empty} onClick={use}>
          {t('signUse')}
        </button>
        {tab === 'draw' && (
          <button type="button" className="btn" onClick={clear}>
            {t('signClear')}
          </button>
        )}
        <button type="button" className="btn" onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}
