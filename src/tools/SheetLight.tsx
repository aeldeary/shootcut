import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { FilePlus2, FileSpreadsheet, Upload } from 'lucide-react';
import { useI18n } from '../i18n';
import { ToolPage, Notice } from '../components/Shell';
import { useHistory } from '../hooks/useHistory';
import { MAX_COLS, MAX_ROWS, Sheet, SheetError, cellKey, colName, display, type Cells } from '../lib/sheet/engine';
import { extent, fromXlsx, parseCsv, toCsv, toXlsx } from '../lib/sheet/io';
import { baseName, downloadBytes } from '../lib/pdf';

const STORAGE = 'shootcut:sheet';
/** A key that types text: one character, or an Arabic ligature such as "لا"; named keys (Shift, Home …) are ASCII words. */
const isPrintable = (key: string): boolean => [...key].length === 1 || (key.length > 1 && /[^\x00-\x7f]/.test(key));
const touchScreen = () => {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};
const loadSaved = (): Cells => {
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as Cells) : {};
  } catch {
    return {};
  }
};

/** A light spreadsheet: type values and formulas, import and export CSV and XLSX. Saved in this browser as you type. */
export default function SheetLight() {
  const { t, lang } = useI18n();
  const [cells, setCells] = useState<Cells>(loadSaved);
  const [sel, setSel] = useState({ c: 0, r: 0 });
  const [draft, setDraft] = useState<string | null>(null);
  const [name, setName] = useState('sheet');
  const [notice, setNotice] = useState<'clipped' | 'badFile' | null>(null);
  const bar = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  useHistory({ cells }, (s) => { setCells(s.cells); setDraft(null); });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(cells));
    } catch {
      /* storage blocked or full: the sheet only lives on this page */
    }
  }, [cells]);

  const sheet = useMemo(() => new Sheet(cells), [cells]);
  const key = cellKey(sel.c, sel.r);
  const shown = draft ?? cells[key] ?? '';

  const commit = (value: string, at = key) => {
    setCells((prev) => {
      if ((prev[at] ?? '') === value) return prev;
      const next = { ...prev };
      if (value === '') delete next[at];
      else next[at] = value;
      return next;
    });
  };
  const finish = (dc: number, dr: number) => {
    if (draft !== null) commit(draft);
    setDraft(null);
    move(dc, dr);
    grid.current?.focus();
  };
  const move = (dc: number, dr: number) => setSel((s) => ({ c: Math.min(MAX_COLS - 1, Math.max(0, s.c + dc)), r: Math.min(MAX_ROWS - 1, Math.max(0, s.r + dr)) }));

  const onGridKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], Tab: [e.shiftKey ? -1 : 1, 0], Enter: [0, 1] };
    const rtl = lang === 'ar';
    if (e.key in arrows && e.key !== 'Enter') {
      e.preventDefault();
      const [dc, dr] = arrows[e.key];
      move(rtl && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? -dc : dc, dr);
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      setDraft(cells[key] ?? '');
      bar.current?.focus();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      commit('');
    } else if (isPrintable(e.key)) {
      // typing on a selected cell starts a new entry
      e.preventDefault();
      setDraft(e.key);
      bar.current?.focus();
    }
  };

  const importFile = async (file: File) => {
    setNotice(null);
    try {
      const isXlsx = /\.xlsx$/i.test(file.name);
      const r = isXlsx ? fromXlsx(new Uint8Array(await file.arrayBuffer())) : parseCsv(await file.text());
      setCells(r.cells);
      setName(baseName(file.name) || 'sheet');
      setSel({ c: 0, r: 0 });
      setDraft(null);
      if (r.clipped) setNotice('clipped');
    } catch {
      setNotice('badFile');
    }
  };

  const used = extent(cells);
  const rowsShown = Math.min(MAX_ROWS, Math.max(30, used.rows + 10));
  const colsShown = Math.min(MAX_COLS, Math.max(10, used.cols + 2));

  return (
    <ToolPage title={t('toolSheet')} desc={t('toolSheetDesc')}>
      <div className="sheet-toolbar">
        <button type="button" className="btn" onClick={() => { if (Object.keys(cells).length === 0 || window.confirm(t('sheetNewConfirm'))) { setCells({}); setName('sheet'); setDraft(null); setNotice(null); } }}>
          <FilePlus2 size={16} aria-hidden /> {t('sheetNew')}
        </button>
        <label className="btn">
          <Upload size={16} aria-hidden /> {t('sheetImport')}
          <input type="file" hidden accept=".csv,.tsv,.txt,.xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        </label>
        <button type="button" className="btn btn-primary" data-save disabled={used.rows === 0} onClick={() => downloadBytes(toXlsx(cells, { rtl: lang === 'ar', sheetName: name }), `${name}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}>
          <FileSpreadsheet size={16} aria-hidden /> {t('sheetExportXlsx')}
        </button>
        <button type="button" className="btn" disabled={used.rows === 0} onClick={() => downloadBytes(new TextEncoder().encode(toCsv(cells)), `${name}.csv`, 'text/csv;charset=utf-8')}>
          {t('sheetExportCsv')}
        </button>
      </div>
      {notice === 'clipped' && <Notice kind="info">{t('sheetClipped')}</Notice>}
      {notice === 'badFile' && <Notice kind="error">{t('sheetBadFile')}</Notice>}

      <div className="formula-bar">
        <span className="formula-name" dir="ltr">{key}</span>
        <input
          ref={bar}
          className="input"
          dir="auto"
          aria-label={t('sheetFormulaBar')}
          value={shown}
          placeholder="=SUM(A1:A3)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              finish(0, 1);
            } else if (e.key === 'Tab') {
              e.preventDefault();
              finish(e.shiftKey ? -1 : 1, 0);
            } else if (e.key === 'Escape') {
              setDraft(null);
              grid.current?.focus();
            }
          }}
          onBlur={() => {
            if (draft !== null) commit(draft);
            setDraft(null);
          }}
        />
      </div>

      <div className="sheet-wrap" ref={grid} tabIndex={0} onKeyDown={onGridKey} role="grid" aria-label={t('toolSheet')} data-testid="sheet-grid">
        <table className="sheet">
          <thead>
            <tr>
              <th className="corner" />
              {Array.from({ length: colsShown }, (_, c) => (
                <th key={c} className={c === sel.c ? 'is-sel' : ''} dir="ltr">{colName(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowsShown }, (_, r) => (
              <tr key={r}>
                <th className={r === sel.r ? 'is-sel' : ''} dir="ltr">{r + 1}</th>
                {Array.from({ length: colsShown }, (_, c) => {
                  const k = cellKey(c, r);
                  const raw = cells[k];
                  const v = raw === undefined ? '' : sheet.get(k);
                  const text = draft !== null && c === sel.c && r === sel.r ? draft : raw === undefined ? '' : display(v);
                  return (
                    <td
                      key={c}
                      role="gridcell"
                      aria-selected={c === sel.c && r === sel.r}
                      data-cell={k}
                      className={`${c === sel.c && r === sel.r ? 'is-sel' : ''}${typeof v === 'number' ? ' is-num' : ''}${v instanceof SheetError ? ' is-err' : ''}`}
                      dir="auto"
                      onMouseDown={() => { if (draft !== null) commit(draft); setDraft(null); setSel({ c, r }); }}
                      onClick={() => { if (touchScreen()) { setDraft(cells[k] ?? ''); setTimeout(() => bar.current?.focus(), 0); } }}
                      onDoubleClick={() => { setDraft(cells[k] ?? ''); setTimeout(() => bar.current?.focus(), 0); }}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">{t('sheetHint')}</p>
    </ToolPage>
  );
}
