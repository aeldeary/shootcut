import { useState } from 'react';
import { useI18n } from '../i18n';
import { Dropzone } from '../components/Dropzone';
import { Checkbox, Field, FileBar } from '../components/Fields';
import { Notice, ToolPage } from '../components/Shell';
import { usePdfFile } from '../hooks/usePdfFile';
import { baseName, downloadBytes } from '../lib/pdf';
import { protectPdf } from '../lib/ops/protect';
import { useHistory } from '../hooks/useHistory';

export function ProtectTool() {
  const { t } = useI18n();
  const { pdf, error, loading, load, reset, passwordPrompt } = usePdfFile({ preview: false });
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [owner, setOwner] = useState('');
  const [print, setPrint] = useState(true);
  const [copy, setCopy] = useState(true);
  const [edit, setEdit] = useState(true);
  const [annotate, setAnnotate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'add' | 'remove' | null>(null);
  const [failed, setFailed] = useState(false);
  useHistory({ mode, print, copy, edit, annotate }, (s) => { setMode(s.mode); setPrint(s.print); setCopy(s.copy); setEdit(s.edit); setAnnotate(s.annotate); setDone(null); }, pdf);

  const mismatch = pw !== '' && pw !== pw2;
  const nothing = pw === '' && print && copy && edit && annotate;

  const run = async () => {
    if (!pdf) return;
    setBusy(true);
    setFailed(false);
    setDone(null);
    try {
      if (mode === 'add') {
        const bytes = await protectPdf(pdf.bytes, {
          userPassword: pw || undefined,
          ownerPassword: owner || undefined,
          allowPrinting: print,
          allowCopying: copy,
          allowEditing: edit,
          allowAnnotating: annotate,
        });
        downloadBytes(bytes, `${baseName(pdf.file.name)}${t('protectSuffix')}.pdf`);
      } else {
        downloadBytes(pdf.bytes, `${baseName(pdf.file.name)}${t('unlockSuffix')}.pdf`);
      }
      setDone(mode);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolPage title={t('toolProtect')} desc={t('toolProtectDesc')}>
      <div className="tabs" role="tablist">
        {(['add', 'remove'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={`tab${mode === m ? ' is-active' : ''}`} onClick={() => { setMode(m); setDone(null); }}>
            {t(m === 'add' ? 'protectAdd' : 'protectRemove')}
          </button>
        ))}
      </div>
      {!pdf && <Dropzone onFiles={(f) => load(f[0])} />}
      {passwordPrompt}
      {error && <Notice kind="error">{t(error)}</Notice>}
      {loading && <p className="muted">{t('processing')}</p>}
      {pdf && (
        <div className="panel">
          <FileBar name={pdf.file.name} pages={pdf.numPages} size={pdf.file.size} onReset={() => { reset(); setDone(null); }} />
          {mode === 'add' ? (
            <>
              <div className="grid-2">
                <Field label={t('protectOpenPw')} hint={t('protectOpenPwHint')}>
                  {(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}
                </Field>
                <Field label={t('protectConfirm')}>
                  {(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} disabled={pw === ''} />}
                </Field>
              </div>
              {mismatch && <Notice kind="error">{t('protectMismatch')}</Notice>}
              <Field label={t('protectOwnerPw')} hint={t('protectOwnerPwHint')}>
                {(id) => <input id={id} className="input" type="password" autoComplete="new-password" value={owner} onChange={(e) => setOwner(e.target.value)} />}
              </Field>
              <fieldset className="choices">
                <legend>{t('protectAllow')}</legend>
                <Checkbox checked={print} onChange={setPrint}>{t('protectPrint')}</Checkbox>
                <Checkbox checked={copy} onChange={setCopy}>{t('protectCopy')}</Checkbox>
                <Checkbox checked={edit} onChange={setEdit}>{t('protectEdit')}</Checkbox>
                <Checkbox checked={annotate} onChange={setAnnotate}>{t('protectAnnotate')}</Checkbox>
              </fieldset>
              <Notice kind="info">{t('protectWarn')}</Notice>
              {nothing && <p className="muted">{t('protectNothing')}</p>}
            </>
          ) : (
            <Notice kind="info">{pdf.wasEncrypted ? t('protectRemoveReady') : t('protectNoPassword')}</Notice>
          )}
          <div className="actions">
            <button type="button" className="btn btn-primary" data-save disabled={busy || (mode === 'add' ? mismatch || nothing : !pdf.wasEncrypted)} onClick={run}>
              {busy ? t('processing') : t(mode === 'add' ? 'protectAction' : 'unlockAction')}
            </button>
          </div>
          {done && <Notice kind="success">{t(done === 'add' ? 'protectDone' : 'unlockDone')}</Notice>}
          {failed && <Notice kind="error">{t('errGeneric')}</Notice>}
        </div>
      )}
    </ToolPage>
  );
}
