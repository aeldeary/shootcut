/** Links that open a messaging app or social site with a ready message. Nothing is sent from this site. */
export interface ShareTarget {
  id: 'whatsapp' | 'telegram' | 'email' | 'facebook' | 'x' | 'linkedin';
  url: (text: string, link: string, subject: string) => string;
}

const q = encodeURIComponent;

export const SHARE_TARGETS: ShareTarget[] = [
  { id: 'whatsapp', url: (text, link) => `https://wa.me/?text=${q(link ? `${text}\n${link}` : text)}` },
  { id: 'telegram', url: (text, link) => `https://t.me/share/url?url=${q(link || ' ')}&text=${q(text)}` },
  { id: 'email', url: (text, link, subject) => `mailto:?subject=${q(subject)}&body=${q(link ? `${text}\n\n${link}` : text)}` },
  { id: 'facebook', url: (_t, link) => `https://www.facebook.com/sharer/sharer.php?u=${q(link)}` },
  { id: 'x', url: (text, link) => `https://x.com/intent/post?text=${q(text)}&url=${q(link)}` },
  { id: 'linkedin', url: (_t, link) => `https://www.linkedin.com/sharing/share-offsite/?url=${q(link)}` },
];

/** True when this browser can hand a file to the system share sheet (WhatsApp, Mail, AirDrop, ...). */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** The address of this app without hash or query, for sharing the site itself. */
export function siteLink(): string {
  if (typeof location === 'undefined') return '';
  return `${location.origin}${location.pathname}`;
}
