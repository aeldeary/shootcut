
/// Shootcut: the Arabic character controls of the Character panel (Character Direction, Kashidas,
/// Diacritic Positioning with its offsets). Shown for Arabic and Hebrew text, right-to-left
/// paragraphs, or once one of them is set.
fn shootcut_arabic_block(app: &mut DesignApp, ui: &mut egui::Ui, c: &Value, a: &Value) {
    let lang = c["language"].as_str().unwrap_or("");
    let dir = c["characterDirection"].as_str().unwrap_or("default").to_string();
    let dpos = c["diacriticPosition"].as_str().unwrap_or("default").to_string();
    let no_kashidas = c["allowKashidas"].as_bool() == Some(false);
    let used = dir != "default" || dpos != "default" || no_kashidas;
    if !(used || matches!(lang, "Arabic" | "Hebrew") || a["para"]["direction"].as_str() == Some("rightToLeft")) {
        return;
    }
    let lg = app.ui.language.clone();
    let pick = |app: &mut DesignApp, ui: &mut egui::Ui, id: &str, field: &str, cur: &str, opts: &[(&str, &str)]| {
        let shown = opts.iter().find(|o| o.0 == cur).map_or(opts[0].1, |o| o.1);
        egui::ComboBox::from_id_salt(id)
            .selected_text(crate::rtl::widget(ui, crate::i18n::tr(&lg, shown)))
            .width(150.0)
            .show_ui(ui, |ui| {
                for (k, l) in opts {
                    if ui.selectable_label(*k == cur, crate::rtl::widget(ui, crate::i18n::tr(&lg, l))).clicked() {
                        let _ = app.run("type.char", json!({"attrs": {field: k}}));
                    }
                }
            });
    };
    ui.horizontal(|ui| {
        caption(ui, crate::i18n::tr(&lg, "Character Direction"));
        pick(app, ui, "char_direction", "characterDirection", &dir, &[("default", "Default"), ("leftToRight", "Left-to-Right"), ("rightToLeft", "Right-to-Left")]);
    });
    let mut kashidas = !no_kashidas;
    if ui.checkbox(&mut kashidas, crate::rtl::widget(ui, crate::i18n::tr(&lg, "Kashidas"))).changed() {
        let _ = app.run("type.char", json!({"attrs": {"allowKashidas": kashidas}}));
    }
    ui.horizontal(|ui| {
        caption(ui, crate::i18n::tr(&lg, "Diacritic Positioning"));
        pick(
            app,
            ui,
            "char_diacritic",
            "diacriticPosition",
            &dpos,
            &[("default", "Default"), ("openType", "OpenType"), ("openTypeFromBaseline", "OpenType from Baseline"), ("loose", "Loose"), ("medium", "Medium"), ("tight", "Tight")],
        );
    });
    egui::Grid::new("chardiacritic").num_columns(4).spacing(vec2(6.0, 4.0)).show(ui, |ui| {
        caption(ui, "X");
        if let Some(v) = number(ui, "pcdx", c["diacriticXOffset"].as_f64().or(Some(0.0)), "", 60.0, 0) {
            let _ = app.run("type.char", json!({"attrs": {"diacriticXOffset": v}}));
        }
        caption(ui, "Y");
        if let Some(v) = number(ui, "pcdy", c["diacriticYOffset"].as_f64().or(Some(0.0)), "", 60.0, 0) {
            let _ = app.run("type.char", json!({"attrs": {"diacriticYOffset": v}}));
        }
        ui.end_row();
    });
}
