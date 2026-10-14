//! Shootcut: automatic form-field detection that also reads the page as a picture, so empty table
//! cells, dotted blanks, ruled lines and labels ending with a colon get fields too (the built-in
//! detection covers underscores, rules, empty boxes and check boxes). Fields that come from a
//! right-to-left label are right-aligned, and no detected field has a frame or a fill.

use pdfcraft_forms::detect::{Candidate, Kind, Word};
use pdfcraft_forms::shootcut_detect as sd;
use pdfcraft_forms::{FieldProps, LookPatch};
use pdfcraft_render::{PageInfo, PageRenderer, RenderRequest, RequestKind};

use crate::Edit;

/// Pixels per point of the picture the page is read from.
const SCALE: f32 = 1.5;

fn overlaps(a: [f64; 4], b: [f64; 4]) -> bool {
    a[0] < b[2] - 1.0 && b[0] < a[2] - 1.0 && a[1] < b[3] - 1.0 && b[1] < a[3] - 1.0
}

/// Adds what the picture shows to `out` (the built-in detection's candidates for `page`).
pub(crate) fn extend(r: &mut PageRenderer, page: usize, info: &PageInfo, words: &[Word], existing: &[[f64; 4]], taken: &[String], out: &mut Vec<Candidate>) {
    let shot = r.render(RenderRequest { page, kind: RequestKind::Pixels, scale: SCALE, ..Default::default() });
    let (w, h) = (shot.width as usize, shot.height as usize);
    if shot.error.is_some() || w == 0 || h == 0 || shot.rgba.len() < w * h * 4 {
        return;
    }
    // Premultiplied RGBA over white paper, to grey.
    let mut grey = Vec::with_capacity(w * h);
    for p in shot.rgba.chunks_exact(4).take(w * h) {
        let lum = (p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000;
        grey.push((lum + (255 - p[3] as u32)).min(255) as u8);
    }
    let texts: Vec<sd::Text> = words
        .iter()
        .map(|wd| {
            let a = info.user_to_view(wd.rect[0] as f32, wd.rect[1] as f32);
            let b = info.user_to_view(wd.rect[2] as f32, wd.rect[3] as f32);
            sd::Text { text: wd.text.clone(), l: a[0].min(b[0]) * SCALE, t: a[1].min(b[1]) * SCALE, r: a[0].max(b[0]) * SCALE, b: a[1].max(b[1]) * SCALE }
        })
        .collect();
    let mut used: Vec<String> = taken.iter().cloned().chain(out.iter().map(|c| c.name.clone())).collect();
    for f in sd::analyze(&sd::Gray { px: &grey, w, h }, &texts, SCALE) {
        let v = info.view_rect_to_user([f.l / SCALE, f.t / SCALE, f.r / SCALE, f.b / SCALE]);
        let rect = [v[0] as f64, v[1] as f64, v[2] as f64, v[3] as f64];
        if rect[2] - rect[0] < 6.0 || rect[3] - rect[1] < 6.0 {
            continue;
        }
        if existing.iter().chain(out.iter().map(|c| &c.rect)).any(|e| overlaps(*e, rect)) {
            continue;
        }
        let name = sd::unique_name(&f.label, f.checkbox, &mut used);
        out.push(Candidate { kind: if f.checkbox { Kind::CheckBox } else { Kind::Text }, rect, name });
    }
}

/// Edits that follow the new fields: no frame, no fill, and the text starts at the right edge for a
/// field named after a right-to-left label.
pub(crate) fn style_edits(names: &[String]) -> Vec<Edit> {
    names
        .iter()
        .map(|n| {
            let look = LookPatch { border: Some(None), fill: Some(None), ..Default::default() };
            let props = FieldProps { appearance: Some(look), quadding: sd::is_rtl_text(n).then_some(2), ..Default::default() };
            Edit::SetFieldProps { name: n.clone(), props: Box::new(props) }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use crate::Session;

    /// A one-page PDF (letter size, Helvetica) with the given content stream.
    fn pdf(content: &str) -> Vec<u8> {
        let objs = [
            "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>".to_string(),
            format!("<< /Length {} >>\nstream\n{}\nendstream", content.len(), content),
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
        ];
        let mut out = b"%PDF-1.4\n".to_vec();
        let mut offs = Vec::new();
        for (i, o) in objs.iter().enumerate() {
            offs.push(out.len());
            out.extend(format!("{} 0 obj\n{}\nendobj\n", i + 1, o).as_bytes());
        }
        let xref = out.len();
        out.extend(format!("xref\n0 {}\n0000000000 65535 f \n", objs.len() + 1).as_bytes());
        for o in offs {
            out.extend(format!("{o:010} 00000 n \n").as_bytes());
        }
        out.extend(format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n", objs.len() + 1).as_bytes());
        out
    }

    #[test]
    fn a_form_drawn_as_a_table_gets_fields_without_frames() {
        let content = "0.5 w\n72 700 100 30 re S\n172 700 300 30 re S\n72 670 100 30 re S\n172 670 300 30 re S\n\
            BT /F1 12 Tf 80 712 Td (Name) Tj ET\nBT /F1 12 Tf 80 682 Td (City) Tj ET\n\
            BT /F1 12 Tf 72 600 Td (Phone:) Tj ET\n\
            BT /F1 12 Tf 72 560 Td (Address ................................) Tj ET\n\
            72 500 12 12 re S\nBT /F1 12 Tf 90 502 Td (I agree) Tj ET\n";
        let mut s = Session::new().with_clock(|| 1_700_000_000);
        let id = s.open("table.pdf", None, pdf(content), None).unwrap();
        let found = s.detect_fields(id, &[]);
        let names: Vec<&str> = found.iter().map(|(_, c)| c.name.as_str()).collect();
        for want in ["Name", "City", "Phone", "I agree"] {
            assert!(names.contains(&want), "{want} is missing from {names:?}");
        }
        // the empty cells are fields; the cells holding the labels are not
        let name = found.iter().find(|(_, c)| c.name == "Name").unwrap().1.rect;
        assert!(name[0] > 172.0 - 1.0, "{name:?}");
        assert_eq!(found.iter().filter(|(_, c)| matches!(c.kind, pdfcraft_forms::detect::Kind::CheckBox)).count(), 1);
        let added = s.auto_detect_fields(id, &[]).unwrap();
        assert!(added.len() >= 5, "{added:?}");
        let d = s.get(id).unwrap();
        assert!(d.form.len() >= 5);
        assert!(s.detect_fields(id, &[]).is_empty(), "nothing left to detect");
    }
}
