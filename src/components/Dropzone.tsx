import { useRef, useState, type DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { useI18n } from '../i18n';
import { isPdf } from '../lib/pdf';

interface Props {
  /** what the zone accepts; default PDF */
  kind?: 'pdf' | 'image' | 'scan' | 'video';
  multiple?: boolean;
  compact?: boolean;
  onFiles: (files: File[]) => void;
  onRejected?: () => void;
}

export function Dropzone({ kind = 'pdf', multiple = false, compact = false, onFiles, onRejected }: Props) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  const accept = (list: FileList | File[] | null) => {
    if (!list) return;
    const all = Array.from(list);
    const isImg = (f: File) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name);
    const isVid = (f: File) => f.type.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv|avi|3gp|flv|wmv|mpg|mpeg|ts|mts)$/i.test(f.name);
    const pdfs = all.filter((f) => (kind === 'image' ? isImg(f) : kind === 'video' ? isVid(f) : kind === 'scan' ? isImg(f) || isPdf(f) : isPdf(f)));
    if (pdfs.length < all.length) onRejected?.();
    if (pdfs.length) onFiles(multiple ? pdfs : pdfs.slice(0, 1));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setActive(false);
    accept(e.dataTransfer.files);
  };

  return (
    <div
      className={`dropzone${active ? ' is-active' : ''}${compact ? ' is-compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={onDrop}
    >
      <Upload size={compact ? 20 : 32} aria-hidden />
      <p className="dropzone-title">{active ? t('dropActive') : kind === 'image' ? t('dropImages') : kind === 'video' ? t('dropVideos') : kind === 'scan' ? t('dropScan') : t('dropTitle')}</p>
      {!compact && <p className="muted">{t('dropOr')}</p>}
      <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
        {t('browse')}
      </button>
      <input
        ref={input}
        type="file"
        accept={kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*,.mkv,.avi,.flv,.wmv,.3gp,.ts,.mts' : kind === 'scan' ? 'application/pdf,.pdf,image/*' : 'application/pdf,.pdf'}
        multiple={multiple}
        hidden
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
