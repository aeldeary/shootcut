//! Shootcut: finds where a printed form expects answers by looking at a grey picture of the page,
//! the way a person would: empty cells of a table, dotted or underscore runs, plain ruled lines
//! and labels that end with a colon with free room beside them. Works on tables drawn as pictures
//! and on scans too. Right-to-left labels (Arabic, Hebrew) put the field on their left.
//!
//! Pure functions over a picture and the text boxes (pixels, y down); the engine converts the
//! result to PDF user space.

/// A piece of text on the page, in pixels (y down).
#[derive(Clone, Debug, PartialEq)]
pub struct Text {
    pub text: String,
    pub l: f32,
    pub t: f32,
    pub r: f32,
    pub b: f32,
}

/// A grey picture of the page: 0 black .. 255 white, row by row.
pub struct Gray<'a> {
    pub px: &'a [u8],
    pub w: usize,
    pub h: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Source {
    Cell,
    Blank,
    Line,
    Label,
}

/// A place for a field, in pixels (y down).
#[derive(Clone, Debug, PartialEq)]
pub struct Found {
    pub l: f32,
    pub t: f32,
    pub r: f32,
    pub b: f32,
    pub checkbox: bool,
    pub source: Source,
    /// Nearby text that says what the field is for (may be empty).
    pub label: String,
}

const INK: u8 = 170;

#[derive(Clone, Copy)]
struct Bx {
    l: f32,
    t: f32,
    r: f32,
    b: f32,
}

fn area(b: Bx) -> f32 {
    (b.r - b.l).max(0.0) * (b.b - b.t).max(0.0)
}

fn inter(a: Bx, b: Bx) -> f32 {
    area(Bx { l: a.l.max(b.l), t: a.t.max(b.t), r: a.r.min(b.r), b: a.b.min(b.b) })
}

fn tb(t: &Text) -> Bx {
    Bx { l: t.l, t: t.t, r: t.r, b: t.b }
}

/// True for a letter of a right-to-left script (Hebrew, Arabic and their presentation forms).
pub fn is_rtl_char(c: char) -> bool {
    matches!(c as u32, 0x0590..=0x08FF | 0xFB1D..=0xFDFF | 0xFE70..=0xFEFF)
}

/// True when the text's letters are right-to-left.
pub fn is_rtl_text(s: &str) -> bool {
    let mut rtl = 0;
    let mut other = 0;
    for c in s.chars().filter(|c| c.is_alphabetic()) {
        if is_rtl_char(c) {
            rtl += 1;
        } else {
            other += 1;
        }
    }
    rtl > 0 && rtl >= other
}

struct Area {
    b: Bx,
    n: usize,
}

/// Connected areas of white (4-neighbours): each one's box and size.
fn white_areas(g: &Gray) -> Vec<Area> {
    let (w, h) = (g.w, g.h);
    let mut seen = vec![false; w * h];
    let mut out = Vec::new();
    let mut stack: Vec<usize> = Vec::new();
    for start in 0..w * h {
        if seen[start] || g.px[start] < INK {
            continue;
        }
        let (mut l, mut t, mut r, mut b, mut n) = (w, h, 0usize, 0usize, 0usize);
        seen[start] = true;
        stack.push(start);
        while let Some(p) = stack.pop() {
            let x = p % w;
            let y = p / w;
            n += 1;
            l = l.min(x);
            r = r.max(x + 1);
            t = t.min(y);
            b = b.max(y + 1);
            let mut go = |q: usize| {
                if !seen[q] && g.px[q] >= INK {
                    seen[q] = true;
                    stack.push(q);
                }
            };
            if x > 0 {
                go(p - 1);
            }
            if x + 1 < w {
                go(p + 1);
            }
            if y > 0 {
                go(p - w);
            }
            if y + 1 < h {
                go(p + w);
            }
        }
        out.push(Area { b: Bx { l: l as f32, t: t as f32, r: r as f32, b: b as f32 }, n });
    }
    out
}

fn tidy(s: &str) -> String {
    let s = s.trim_end_matches(|c: char| matches!(c, ':' | '\u{FF1A}' | '_' | '.' | '\u{2026}') || c.is_whitespace());
    let s = s.trim_start_matches(|c: char| matches!(c, '_' | '.' | '\u{2026}') || c.is_whitespace());
    s.trim().chars().take(40).collect()
}

/// Text that says what a field is for: the neighbour on the same row, else the nearest text above.
fn label_for(field: Bx, texts: &[Text], pt: f32) -> String {
    let row_h = field.b - field.t;
    let mut same: Vec<(f32, &Text)> = texts
        .iter()
        .filter(|t| {
            let bx = tb(t);
            bx.b.min(field.b) - bx.t.max(field.t) > row_h.min(bx.b - bx.t) * 0.5
        })
        .map(|t| {
            let bx = tb(t);
            let gap = if bx.r < field.l {
                field.l - bx.r
            } else if bx.l > field.r {
                bx.l - field.r
            } else {
                f32::INFINITY
            };
            (gap, t)
        })
        .filter(|(g, _)| *g < 300.0 * pt)
        .collect();
    same.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut pick = same.first().map(|(_, t)| *t);
    if pick.is_none() {
        let mut above: Vec<&Text> = texts
            .iter()
            .filter(|t| {
                let bx = tb(t);
                bx.b <= field.t + 2.0 && bx.r.min(field.r) - bx.l.max(field.l) > 0.0 && field.t - bx.b < 40.0 * pt
            })
            .collect();
        above.sort_by(|a, b| b.b.total_cmp(&a.b));
        pick = above.first().copied();
    }
    pick.map(|t| tidy(&t.text)).unwrap_or_default()
}

struct Acc<'a> {
    found: Vec<(Found, u8)>,
    texts: &'a [Text],
    pt: f32,
}

impl Acc<'_> {
    fn add(&mut self, bx: Bx, checkbox: bool, multiline: bool, source: Source, rank: u8) {
        let _ = multiline;
        if self.found.iter().any(|(f, _)| {
            let fb = Bx { l: f.l, t: f.t, r: f.r, b: f.b };
            inter(fb, bx) > 0.3 * area(fb).min(area(bx))
        }) {
            return;
        }
        let label = label_for(bx, self.texts, self.pt);
        self.found.push((Found { l: bx.l, t: bx.t, r: bx.r, b: bx.b, checkbox, source, label }, rank));
    }
}

fn dark_in(g: &Gray, x0: usize, x1: usize, y0: usize, y1: usize, step: usize) -> usize {
    let mut dark = 0;
    for y in y0..y1.min(g.h) {
        let mut x = x0;
        while x < x1.min(g.w) {
            if g.px[y * g.w + x] < INK {
                dark += 1;
            }
            x += step;
        }
    }
    dark
}

/// The places on a page where fields probably belong. `pt` is pixels per point.
pub fn analyze(g: &Gray, texts: &[Text], pt: f32) -> Vec<Found> {
    let texts: Vec<Text> = texts.iter().filter(|t| !t.text.trim().is_empty()).cloned().collect();
    let mut acc = Acc { found: Vec::new(), texts: &texts, pt };
    let (w, h) = (g.w as f32, g.h as f32);

    // 1. bordered cells and boxes: white areas closed in by lines that hold nothing
    let page_area = w * h;
    for c in white_areas(g) {
        let b = c.b;
        let (cw, ch) = (b.r - b.l, b.b - b.t);
        if b.l <= 1.0 || b.t <= 1.0 || b.r >= w - 1.0 || b.b >= h - 1.0 {
            continue; // touches the paper edge: the background
        }
        if cw * ch > page_area * 0.6 {
            continue;
        }
        let fill = c.n as f32 / (cw * ch);
        if fill < 0.55 {
            continue;
        }
        let inside_text = texts.iter().any(|t| {
            let (cx, cy) = ((t.l + t.r) / 2.0, (t.t + t.b) / 2.0);
            cx > b.l && cx < b.r && cy > b.t && cy < b.b
        });
        let (wp, hp) = (cw / pt, ch / pt);
        let square = (6.0..=22.0).contains(&wp) && (6.0..=22.0).contains(&hp) && (wp - hp).abs() <= 3.0;
        if square {
            let glyph_hole = texts.iter().any(|t| b.l >= t.l - 1.0 && b.r <= t.r + 1.0 && b.t >= t.t - 1.0 && b.b <= t.b + 1.0);
            if !glyph_hole && fill >= 0.93 {
                acc.add(b, true, false, Source::Cell, 1);
            }
            continue;
        }
        if wp < 22.0 || hp < 9.0 {
            continue;
        }
        if inside_text || fill < 0.97 {
            continue;
        }
        let pad = 2.0f32.min(ch * 0.1);
        acc.add(Bx { l: b.l + pad, t: b.t + pad, r: b.r - pad, b: b.b - pad }, false, hp > 45.0 && wp > 120.0, Source::Cell, 0);
    }

    // 2. dotted or underscore runs in the text: "Name: ________"
    for t in &texts {
        let chars: Vec<char> = t.text.chars().collect();
        let is_run = |c: char| matches!(c, '_' | '.' | '\u{2026}' | '\u{B7}' | '-' | '\u{2013}');
        let mut i = 0;
        while i < chars.len() {
            if !is_run(chars[i]) {
                i += 1;
                continue;
            }
            let s = i;
            while i < chars.len() && is_run(chars[i]) {
                i += 1;
            }
            if i - s < 4 {
                continue;
            }
            // text that is a run of marks only; a word with letters in it is not a blank
            if chars.iter().any(|c| c.is_alphanumeric()) {
                continue;
            }
            let len = chars.len() as f32;
            let (mut a, mut b) = (s as f32 / len, i as f32 / len);
            if is_rtl_text(&t.text) {
                (a, b) = (1.0 - b, 1.0 - a);
            }
            let wbox = t.r - t.l;
            // underscores hang just below the baseline: the field goes on the line, a little above it
            acc.add(Bx { l: t.l + a * wbox, t: t.b - 14.0 * pt, r: t.l + b * wbox, b: t.b + 2.0 * pt }, false, false, Source::Blank, 2);
        }
    }

    // 3. plain ruled lines that are not the edge of a cell: a field sits on top of them
    let min_run = (50.0 * pt).round() as usize;
    let used: Vec<Bx> = acc.found.iter().map(|(f, _)| Bx { l: f.l, t: f.t, r: f.r, b: f.b }).collect();
    let (gw, gh) = (g.w, g.h);
    let below = (3.0 * pt).round() as usize;
    let rows_above = (8.0 * pt).round() as usize;
    let hgt = (18.0 * pt).round();
    for y in 2..gh.saturating_sub(2) {
        let mut x = 0;
        while x < gw {
            while x < gw && g.px[y * gw + x] >= INK {
                x += 1;
            }
            let x0 = x;
            while x < gw && g.px[y * gw + x] < INK {
                x += 1;
            }
            if x - x0 < min_run {
                continue;
            }
            // thin: nothing dark just below the line
            let mut thin = true;
            for k in below..=below + 1 {
                let yy = (y + k).min(gh - 1);
                let dark = (x0..x).filter(|xx| g.px[yy * gw + xx] < INK).count();
                if dark as f32 > (x - x0) as f32 * 0.5 {
                    thin = false;
                }
            }
            if !thin {
                continue;
            }
            let area_above = Bx { l: x0 as f32, t: y as f32 - hgt, r: x as f32, b: y as f32 };
            let text_on_top = texts.iter().any(|t| inter(tb(t), area_above) > area(tb(t)) * 0.35);
            let near_cell = used.iter().any(|u| ((u.b - y as f32).abs() < 4.0 * pt || (u.t - y as f32).abs() < 4.0 * pt) && u.r > x0 as f32 && u.l < x as f32);
            let ink_above = {
                let y0 = y.saturating_sub(rows_above);
                let dark = dark_in(g, x0, x, y0, y.saturating_sub(1), 2);
                dark as f32 > (x - x0) as f32 * rows_above as f32 * 0.01
            };
            if !text_on_top && !near_cell && !ink_above {
                acc.add(Bx { l: x0 as f32 + 2.0, t: y as f32 - hgt, r: x as f32 - 2.0, b: y as f32 - 1.0 }, false, false, Source::Line, 3);
            }
        }
    }

    // 4. "Name:" with free room next to it (on the left of a right-to-left label)
    for t in &texts {
        let trimmed = t.text.trim_end();
        if !(trimmed.ends_with(':') || trimmed.ends_with('\u{FF1A}')) || trimmed.chars().count() < 3 {
            continue;
        }
        let bx = tb(t);
        let line_h = (bx.b - bx.t).max(11.0 * pt);
        let width = 150.0 * pt;
        let mut field = if is_rtl_text(&t.text) {
            Bx { l: bx.l - 4.0 - width, t: bx.t - 2.0, r: bx.l - 4.0, b: bx.t + line_h + 2.0 }
        } else {
            Bx { l: bx.r + 4.0, t: bx.t - 2.0, r: bx.r + 4.0 + width, b: bx.t + line_h + 2.0 }
        };
        field.l = field.l.max(4.0);
        field.r = field.r.min(w - 4.0);
        if field.r - field.l < 40.0 * pt {
            continue;
        }
        let crowded = texts.iter().any(|o| !std::ptr::eq(o, t) && inter(tb(o), field) > 0.0);
        if crowded {
            continue;
        }
        let dark = dark_in(g, field.l.floor().max(0.0) as usize, field.r.ceil() as usize, field.t.floor().max(0.0) as usize, field.b.ceil() as usize, 2);
        if dark as f32 > area(field) * 0.01 {
            continue;
        }
        acc.add(field, false, false, Source::Label, 4);
    }

    let mut found = acc.found;
    found.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.t.total_cmp(&b.0.t)).then(a.0.l.total_cmp(&b.0.l)));
    found.into_iter().map(|(f, _)| f).collect()
}

/// A field name from a label, unique among `used` (which grows): "Name", "Name2", … or "Text1", "Check Box1".
pub fn unique_name(label: &str, checkbox: bool, used: &mut Vec<String>) -> String {
    let cleaned: String = label.chars().map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '/' { c } else { ' ' }).collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let base = if cleaned.is_empty() { (if checkbox { "Check Box" } else { "Text" }).to_string() } else { cleaned };
    let mut name = if base == "Text" || base == "Check Box" { format!("{base}1") } else { base.clone() };
    let mut n = 1;
    while used.contains(&name) {
        n += 1;
        name = format!("{base}{n}");
    }
    used.push(name.clone());
    name
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blank(w: usize, h: usize) -> Vec<u8> {
        vec![255; w * h]
    }

    fn hline(px: &mut [u8], w: usize, y: usize, x0: usize, x1: usize) {
        for x in x0..x1 {
            px[y * w + x] = 0;
        }
    }

    fn vline(px: &mut [u8], w: usize, x: usize, y0: usize, y1: usize) {
        for y in y0..y1 {
            px[y * w + x] = 0;
        }
    }

    fn rect(px: &mut [u8], w: usize, l: usize, t: usize, r: usize, b: usize) {
        hline(px, w, t, l, r + 1);
        hline(px, w, b, l, r + 1);
        vline(px, w, l, t, b + 1);
        vline(px, w, r, t, b + 1);
    }

    fn text(s: &str, l: f32, t: f32, r: f32, b: f32) -> Text {
        Text { text: s.into(), l, t, r, b }
    }

    #[test]
    fn empty_table_cells_become_fields_and_cells_with_text_do_not() {
        let (w, h) = (400, 200);
        let mut px = blank(w, h);
        // a 2 x 2 table: the left column holds labels, the right column is empty
        rect(&mut px, w, 20, 20, 120, 60);
        rect(&mut px, w, 120, 20, 300, 60);
        rect(&mut px, w, 20, 60, 120, 100);
        rect(&mut px, w, 120, 60, 300, 100);
        let texts = vec![text("Name", 40.0, 35.0, 80.0, 47.0), text("City", 40.0, 75.0, 80.0, 87.0)];
        let f = analyze(&Gray { px: &px, w, h }, &texts, 1.0);
        let cells: Vec<&Found> = f.iter().filter(|x| x.source == Source::Cell && !x.checkbox).collect();
        assert_eq!(cells.len(), 2, "{f:?}");
        assert!(cells.iter().all(|c| c.l > 120.0));
        assert_eq!(cells[0].label, "Name");
        assert_eq!(cells[1].label, "City");
    }

    #[test]
    fn a_small_empty_square_is_a_check_box() {
        let (w, h) = (200, 100);
        let mut px = blank(w, h);
        rect(&mut px, w, 20, 30, 34, 44);
        let f = analyze(&Gray { px: &px, w, h }, &[text("Agree", 40.0, 30.0, 80.0, 44.0)], 1.0);
        assert_eq!(f.len(), 1, "{f:?}");
        assert!(f[0].checkbox);
        assert_eq!(f[0].label, "Agree");
    }

    #[test]
    fn dotted_run_is_a_blank_and_text_with_letters_is_not() {
        let (w, h) = (400, 100);
        let px = blank(w, h);
        let texts = vec![text("Name:", 10.0, 40.0, 50.0, 52.0), text("..........", 60.0, 40.0, 160.0, 52.0), text("see....here", 200.0, 40.0, 280.0, 52.0)];
        let f = analyze(&Gray { px: &px, w, h }, &texts, 1.0);
        let blanks: Vec<&Found> = f.iter().filter(|x| x.source == Source::Blank).collect();
        assert_eq!(blanks.len(), 1, "{f:?}");
        assert!(blanks[0].l >= 60.0 && blanks[0].r <= 160.0);
    }

    #[test]
    fn a_ruled_line_is_a_blank_and_an_underline_of_text_is_not() {
        let (w, h) = (400, 120);
        let mut px = blank(w, h);
        hline(&mut px, w, 80, 100, 300);
        let f = analyze(&Gray { px: &px, w, h }, &[text("Signature", 20.0, 66.0, 90.0, 78.0)], 1.0);
        let lines: Vec<&Found> = f.iter().filter(|x| x.source == Source::Line).collect();
        assert_eq!(lines.len(), 1, "{f:?}");
        assert_eq!(lines[0].label, "Signature");
        // the same line right under a word is that word's underline
        let g = analyze(&Gray { px: &px, w, h }, &[text("Underlined heading text", 100.0, 66.0, 300.0, 79.0)], 1.0);
        assert!(g.iter().all(|x| x.source != Source::Line), "{g:?}");
    }

    #[test]
    fn a_colon_label_gets_room_on_its_right_or_on_the_left_when_it_is_arabic() {
        let (w, h) = (500, 100);
        let px = blank(w, h);
        let en = analyze(&Gray { px: &px, w, h }, &[text("Phone:", 20.0, 40.0, 70.0, 52.0)], 1.0);
        assert_eq!(en.len(), 1, "{en:?}");
        assert!(en[0].l > 70.0);
        let ar = analyze(&Gray { px: &px, w, h }, &[text("\u{627}\u{644}\u{627}\u{633}\u{645}:", 400.0, 40.0, 450.0, 52.0)], 1.0);
        assert_eq!(ar.len(), 1, "{ar:?}");
        assert!(ar[0].r < 400.0, "the field is on the left of an Arabic label: {ar:?}");
        assert_eq!(ar[0].label, "\u{627}\u{644}\u{627}\u{633}\u{645}");
    }

    #[test]
    fn dotted_run_of_arabic_form_is_found_from_the_right_side_of_the_text() {
        assert!(is_rtl_text("\u{627}\u{644}\u{627}\u{633}\u{645}"));
        assert!(!is_rtl_text("Name"));
        assert!(!is_rtl_text("....."));
    }

    #[test]
    fn names_are_unique_and_keep_arabic_letters() {
        let mut used = vec!["Name".to_string()];
        assert_eq!(unique_name("Name", false, &mut used), "Name2");
        assert_eq!(unique_name("", false, &mut used), "Text1");
        assert_eq!(unique_name("", false, &mut used), "Text2");
        assert_eq!(unique_name("", true, &mut used), "Check Box1");
        assert_eq!(unique_name("\u{627}\u{644}\u{627}\u{633}\u{645}", false, &mut used), "\u{627}\u{644}\u{627}\u{633}\u{645}");
    }

    #[test]
    fn a_page_with_nothing_to_fill_proposes_nothing() {
        let (w, h) = (300, 300);
        let px = blank(w, h);
        let f = analyze(&Gray { px: &px, w, h }, &[text("A paragraph of plain words.", 20.0, 20.0, 250.0, 32.0)], 1.0);
        assert!(f.is_empty(), "{f:?}");
    }
}
