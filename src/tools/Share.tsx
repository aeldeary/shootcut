import { useState } from 'react';
import { Download, Link2, Mail, MessageCircle, Send, Share2 } from 'lucide-react';
import { useI18n, type Key } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Field, FileBar } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { baseName, isPdf } from '../lib/pdf';
import { SHARE_TARGETS, canShareFile, siteLink, type ShareTarget } from '../lib/share';
import { useHistory } from '../hooks/useHistory';
import { useReopenKept } from '../hooks/useReopenKept';
import { saveFile } from '../lib/persist';

const LABEL: Record<ShareTarget['id'], Key> = {
  whatsapp: 'shareWhatsapp',
  telegram: 'shareTelegram',
  email: 'shareEmail',
  facebook: 'shareFacebook',
  x: 'shareX',
  linkedin: 'shareLinkedin',
};

const ICON = { whatsapp: MessageCircle, telegram: Send, email: Mail, facebook: Share2, x: Share2, linkedin: Share2 } as const;

export function ShareTool() {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'shared' | 'cancelled' | 'failed' | 'copied' | 'downloaded' | null>(null);
  useHistory({ file }, (s) => { setFile(s.file); setStatus(null); });

  const open = (files: File[], remember = true) => {
    const f = files.find(isPdf);
    if (!f) return;
    setFile(f);
    setMessage(baseName(f.name));
    setStatus(null);
    if (remember) void saveFile(f);
  };
  useReopenKept((f) => open([f], false));

  const nativeShare = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: baseName(file.name), text: message });
      setStatus('shared');
    } catch (e) {
      setStatus((e as { name?: string })?.name === 'AbortError' ? 'cancelled' : 'failed');
    }
  };

  const download = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setStatus('downloaded');
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  const go = (target: ShareTarget, withLink: boolean) => {
    window.open(target.url(message, withLink ? siteLink() : '', message), '_blank', 'noopener,noreferrer');
  };

  const nativeOk = file ? canShareFile(file) : false;

  return (
    <ToolPage title={t('toolShare')} desc={t('toolShareDesc')}>
      {!file && <Dropzone onFiles={open} />}
      {file && (
        <div className="panel">
          <FileBar name={file.name} size={file.size} onReset={() => { setFile(null); setStatus(null); }} />

          <h2 className="panel-title">{t('shareFileTitle')}</h2>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled={!nativeOk} onClick={nativeShare}>
              <Share2 size={16} aria-hidden /> {t('shareNative')}
            </button>
            <button type="button" className="btn" onClick={download}>
              <Download size={16} aria-hidden /> {t('shareDownload')}
            </button>
          </div>
          {!nativeOk && <Notice kind="info">{t('shareNoNative')}</Notice>}

          <h2 className="panel-title">{t('shareMessageTitle')}</h2>
          <Field label={t('shareMessage')} hint={t('shareMessageHint')}>
            {(id) => <textarea id={id} className="input" rows={2} dir="auto" value={message} onChange={(e) => setMessage(e.target.value)} />}
          </Field>
          <div className="actions">
            {SHARE_TARGETS.filter((s) => s.id === 'whatsapp' || s.id === 'telegram' || s.id === 'email').map((s) => {
              const Icon = ICON[s.id];
              return (
                <button key={s.id} type="button" className="btn" onClick={() => go(s, false)}>
                  <Icon size={16} aria-hidden /> {t(LABEL[s.id])}
                </button>
              );
            })}
          </div>
          <Notice kind="info">{t('shareAttachNote')}</Notice>

          <h2 className="panel-title">{t('shareLinkTitle')}</h2>
          <p className="muted">{t('shareLinkWhy')}</p>

          <h2 className="panel-title">{t('shareSiteTitle')}</h2>
          <div className="actions">
            {SHARE_TARGETS.map((s) => {
              const Icon = ICON[s.id];
              return (
                <button key={s.id} type="button" className="btn" onClick={() => go(s, true)}>
                  <Icon size={16} aria-hidden /> {t(LABEL[s.id])}
                </button>
              );
            })}
            <button type="button" className="btn" onClick={() => copy(siteLink())}>
              <Link2 size={16} aria-hidden /> {t('shareCopyLink')}
            </button>
          </div>
          <p className="muted">{t('shareNoUpload')}</p>

          {status && (
            <Notice kind={status === 'failed' ? 'error' : 'success'}>
              {t(status === 'shared' ? 'shareDone' : status === 'copied' ? 'copied' : status === 'downloaded' ? 'shareDownloaded' : status === 'cancelled' ? 'shareCancelled' : 'errGeneric')}
            </Notice>
          )}
        </div>
      )}
    </ToolPage>
  );
}
