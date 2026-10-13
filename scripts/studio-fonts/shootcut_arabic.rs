//! Added by Shootcut: an Arabic face for the interface, so Arabic names (layers, files, text) are not drawn as boxes.
//! It sits last in every font family, so nothing that already has a glyph changes. IBM Plex Sans Arabic, SIL OFL 1.1.
use egui::{FontData, FontDefinitions};

const ARABIC: &[u8] = include_bytes!("shootcut_arabic.ttf");

pub fn add(fonts: &mut FontDefinitions) {
    const NAME: &str = "shootcut-arabic";
    if fonts.font_data.contains_key(NAME) {
        return;
    }
    fonts.font_data.insert(NAME.to_owned(), FontData::from_static(ARABIC).into());
    for family in fonts.families.values_mut() {
        if !family.iter().any(|n| n == NAME) {
            family.push(NAME.to_owned());
        }
    }
}
