import { PDFDocument, PDFHexString, PDFName, rgb, TextAlignment } from 'pdf-lib';
import type { Rect } from './textselect';

export type NewFieldKind = 'text' | 'multiline' | 'checkbox' | 'dropdown' | 'radio' | 'list';

export interface NewField {
  kind: NewFieldKind;
  /** unique field name; radio buttons that share a name form one group */
  name: string;
  page: number;
  /** PDF user space */
  rect: Rect;
  /** dropdown / list entries; for radio, the single value this button stands for */
  options?: string[];
  defaultValue?: string;
  required?: boolean;
  /** hint shown when hovering in most viewers */
  tooltip?: string;
  /** where typing starts in a text field: the right edge suits Arabic, the middle centres it */
  align?: 'left' | 'center' | 'right';
}

/** Adds fillable fields. Names must not clash with fields that already exist (radio buttons may share one). */
export async function addFormFields(bytes: Uint8Array, fields: NewField[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = doc.getForm();
  const existing = new Set(form.getFields().map((f) => f.getName()));
  const radios = new Map<string, ReturnType<typeof form.createRadioGroup>>();
  // no frame and no fill: the page looks exactly as it did; readers still highlight the fields when asked
  const style = { borderWidth: 0, borderColor: undefined };

  for (const f of fields) {
    const name = f.name.trim();
    if (!name) throw new Error('Every field needs a name');
    const page = doc.getPage(f.page);
    const box = { x: f.rect.x, y: f.rect.y, width: Math.max(8, f.rect.width), height: Math.max(8, f.rect.height), ...style };

    if (f.kind === 'radio') {
      let group = radios.get(name);
      if (!group) {
        if (existing.has(name)) throw new Error(`A field named "${name}" already exists`);
        group = form.createRadioGroup(name);
        radios.set(name, group);
      }
      group.addOptionToPage(f.options?.[0]?.trim() || String(group.getOptions().length + 1), page, { ...box, borderWidth: 1, borderColor: rgb(0.2, 0.2, 0.2) });
      if (f.required) group.enableRequired();
      continue;
    }
    if (existing.has(name)) throw new Error(`A field named "${name}" already exists`);
    existing.add(name);

    let acro;
    if (f.kind === 'text' || f.kind === 'multiline') {
      const field = form.createTextField(name);
      if (f.kind === 'multiline') field.enableMultiline();
      if (f.align) field.setAlignment(f.align === 'right' ? TextAlignment.Right : f.align === 'center' ? TextAlignment.Center : TextAlignment.Left);
      if (f.defaultValue) field.setText(f.defaultValue);
      field.addToPage(page, { ...box, textColor: rgb(0, 0, 0) });
      if (f.required) field.enableRequired();
      acro = field.acroField;
    } else if (f.kind === 'checkbox') {
      const field = form.createCheckBox(name);
      field.addToPage(page, { ...box, width: Math.min(box.width, box.height), height: Math.min(box.width, box.height) });
      if (f.defaultValue === 'checked') field.check();
      if (f.required) field.enableRequired();
      acro = field.acroField;
    } else {
      const options = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) throw new Error(`"${name}" needs at least one option`);
      const field = f.kind === 'dropdown' ? form.createDropdown(name) : form.createOptionList(name);
      field.addOptions(options);
      if (f.defaultValue && options.includes(f.defaultValue)) field.select(f.defaultValue);
      field.addToPage(page, { ...box, textColor: rgb(0, 0, 0) });
      if (f.required) field.enableRequired();
      acro = field.acroField;
    }
    if (f.tooltip?.trim()) acro.dict.set(PDFName.of('TU'), PDFHexString.fromText(f.tooltip.trim()));
  }
  form.updateFieldAppearances();
  return doc.save();
}
