import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFPage,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
  PDFButton,
  degrees,
} from 'pdf-lib';
import { embedFonts } from '../fonts';
import { drawLine, layoutLine } from '../text';
import { viewAngleToUser } from './geometry';
import { hexToRgb } from './stamp';

export type FieldKind = 'text' | 'checkbox' | 'dropdown' | 'list' | 'radio' | 'button' | 'signature';

export interface FormFieldInfo {
  name: string;
  kind: FieldKind;
  value: string | boolean;
  options?: string[];
  multiline?: boolean;
  readOnly: boolean;
  /** 0-based page of the first widget, or -1 */
  page: number;
}

/** Plain-text marks the person places on a page: typed text, a check mark, a signature image. */
export type FillMark =
  | { kind: 'text'; page: number; x: number; y: number; text: string; size: number; color: string }
  | { kind: 'check'; page: number; x: number; y: number; size: number; color: string }
  | { kind: 'image'; page: number; x: number; y: number; width: number; height: number; image: { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' } };

function pageIndexOfWidget(doc: PDFDocument, widgetDict: object): number {
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const annots = pages[i].node.Annots();
    if (!annots) continue;
    for (let k = 0; k < annots.size(); k++) {
      if (doc.context.lookup(annots.get(k)) === widgetDict) return i;
    }
  }
  return -1;
}

export async function listFormFields(bytes: Uint8Array): Promise<FormFieldInfo[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const out: FormFieldInfo[] = [];
  for (const f of doc.getForm().getFields()) {
    const widgets = f.acroField.getWidgets();
    const page = widgets.length ? pageIndexOfWidget(doc, widgets[0].dict) : -1;
    const base = { name: f.getName(), readOnly: f.isReadOnly(), page };
    if (f instanceof PDFTextField) out.push({ ...base, kind: 'text', value: f.getText() ?? '', multiline: f.isMultiline() });
    else if (f instanceof PDFCheckBox) out.push({ ...base, kind: 'checkbox', value: f.isChecked() });
    else if (f instanceof PDFDropdown) out.push({ ...base, kind: 'dropdown', value: f.getSelected()[0] ?? '', options: f.getOptions() });
    else if (f instanceof PDFOptionList) out.push({ ...base, kind: 'list', value: f.getSelected()[0] ?? '', options: f.getOptions() });
    else if (f instanceof PDFRadioGroup) out.push({ ...base, kind: 'radio', value: f.getSelected() ?? '', options: f.getOptions() });
    else if (f instanceof PDFSignature) out.push({ ...base, kind: 'signature', value: '' });
    else if (f instanceof PDFButton) out.push({ ...base, kind: 'button', value: '' });
  }
  return out;
}

/** The built-in form font only covers Western European letters. */
export const isWinAnsiText = (s: string): boolean => /^[\u0009\u000A\u000D -~ -ÿ–—‘’“”•€]*$/.test(s);

export interface FillOptions {
  /** field name -> new value */
  values?: Record<string, string | boolean>;
  marks?: FillMark[];
  /** turn the filled fields into plain page content (not editable afterwards) */
  flatten?: boolean;
}

export async function fillPdf(bytes: Uint8Array, o: FillOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = doc.getForm();
  const needsFonts = (o.marks ?? []).some((m) => m.kind === 'text') || Object.values(o.values ?? {}).some((v) => typeof v === 'string' && !isWinAnsiText(v));
  const fonts = needsFonts ? await embedFonts(doc) : null;
  const toDraw: { page: PDFPage; rect: { x: number; y: number; width: number; height: number }; text: string; multiline: boolean }[] = [];

  for (const [name, value] of Object.entries(o.values ?? {})) {
    const field = form.getFieldMaybe(name);
    if (!field) continue;
    if (field instanceof PDFTextField && typeof value === 'string') {
      if (isWinAnsiText(value)) {
        field.setText(value || undefined);
      } else {
        // Arabic and other scripts: the form's font cannot show them, so the text is written onto the page
        // with our own fonts and the field itself is removed.
        for (const w of field.acroField.getWidgets()) {
          const idx = pageIndexOfWidget(doc, w.dict);
          if (idx >= 0) toDraw.push({ page: doc.getPage(idx), rect: w.getRectangle(), text: value, multiline: field.isMultiline() });
        }
        form.removeField(field);
      }
    } else if (field instanceof PDFCheckBox && typeof value === 'boolean') {
      if (value) field.check();
      else field.uncheck();
    } else if (field instanceof PDFDropdown && typeof value === 'string') {
      if (value) field.select(value);
      else field.clear();
    } else if (field instanceof PDFOptionList && typeof value === 'string') {
      if (value) field.select(value);
      else field.clear();
    } else if (field instanceof PDFRadioGroup && typeof value === 'string') {
      if (value) field.select(value);
      else field.clear();
    }
  }

  if (toDraw.length && fonts) {
    for (const t of toDraw) {
      const size = Math.max(6, Math.min(12, t.rect.height * 0.7));
      const rtl = layoutLine(t.text, fonts, size).rtl;
      const baseline = t.rect.y + (t.rect.height - size) / 2 + size * 0.2;
      const lines = t.multiline ? t.text.split('\n') : [t.text.replace(/\s*\n\s*/g, ' ')];
      lines.forEach((ln, i) => {
        drawLine(t.page, ln, {
          x: rtl ? t.rect.x + t.rect.width - 2 : t.rect.x + 2,
          y: t.multiline ? t.rect.y + t.rect.height - size - 2 - i * size * 1.3 : baseline,
          size,
          fonts,
          align: rtl ? 'right' : 'left',
          rotate: viewAngleToUser(t.page, 0),
        });
      });
    }
  }

  if (o.flatten) {
    form.updateFieldAppearances();
    form.flatten();
  }

  for (const m of o.marks ?? []) {
    const page = doc.getPage(m.page);
    const angle = viewAngleToUser(page, 0);
    if (m.kind === 'text' && fonts) {
      drawLine(page, m.text, { x: m.x, y: m.y, size: m.size, fonts, color: hexToRgb(m.color), rotate: angle, align: 'left' });
    } else if (m.kind === 'check') {
      const c = hexToRgb(m.color);
      const s = m.size;
      page.drawSvgPath(`M ${s * 0.12} ${s * 0.55} L ${s * 0.4} ${s * 0.88} L ${s * 0.9} ${s * 0.12}`, {
        x: m.x,
        y: m.y + s,
        borderColor: c,
        borderWidth: Math.max(1.2, s / 8),
        rotate: degrees(angle),
        color: undefined,
      });
    } else if (m.kind === 'image') {
      const img = m.image.mime === 'image/png' ? await doc.embedPng(m.image.bytes) : await doc.embedJpg(m.image.bytes);
      page.drawImage(img, { x: m.x, y: m.y, width: m.width, height: m.height, rotate: degrees(angle) });
    }
  }
  return doc.save();
}
