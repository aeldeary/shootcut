#!/usr/bin/env python3
"""Gives an upstream app Shootcut's identity before it is compiled.

  usage: scripts/patch-studio.py source <source-dir> <repo>     (before the build: Rust sources + catalogs)
         scripts/patch-studio.py dist   <dist-dir>  <repo> [lang]  (after the build: loading page, icon, title)
         scripts/patch-studio.py report <dir>                    (lists what is left of the old identity)

Only text the person can see is touched: string literals in Rust, the translation catalogs and the web page.
Identifiers, file extensions and saved-file magic keep their names, so nothing is lost. The licence files stay
in the build (MIT / Apache-2.0 require it) and are listed on Shootcut's "open-source notices" page.
"""
import json, os, re, shutil, sys

PRODUCT = {
    'Word': 'Docs', 'Grid': 'Sheets', 'Deck': 'Slides', 'Photo': 'Photo', 'Light': 'Photo Editor', 'Vector': 'Vector',
    'Design': 'Design', 'Fig': 'UI Design', 'Film': 'Film', 'Effect': 'Effects', 'Sound': 'Sound', 'CAD': 'CAD', 'Cad': 'CAD', 'PDF': 'PDF', 'Pdf': 'PDF',
}
NAME_RE = re.compile(r'(?:(?<=\\n)|\b)(Word|Grid|Deck|Photo|Light|Vector|Design|Fig|Film|Effect|Sound|CAD|Cad|PDF|Pdf)[Cc]raft(?![A-Za-z_])')
ART_RE = re.compile(r'(?:(?<=\\n)|\b)Art[Cc]raft(?![A-Za-z_])')
LITERAL = re.compile(r'"(?:[^"\\\n]|\\.)*"')

# sentences that only advertise the upstream project: dropped whole (inside literals and catalogs)
DROP_PHRASES = [
    r'\\nPart of the Crafting Apps from the ArtCraft team\.',
    r'One of the Crafting Apps by the ArtCraft team and community\.',
    r' ?Part of the Crafting Apps from the ArtCraft team\.',
]
COPYRIGHT_RE = re.compile(r'(MIT OR Apache-2\.0\.? ?)?Copyright \(c\) 2026 ArtCraft Team and the \w+ contributors\.( MIT OR Apache-2\.0\.)?')

GETART_RE = re.compile(r'getartcraft\.com(?:/[\w/.-]*)?')
DEAD_URL_RE = re.compile(r'https?://(discord\.gg/\S*?|(www\.)?getartcraft\.com\S*?|github\.com/storytold\S*?)(?=["\s)\]]|$)')


def clean_text(s: str) -> str:
    s = s.replace('WordCraft User', 'Shootcut User')
    for p in DROP_PHRASES:
        s = re.sub(p, '', s)
    s = COPYRIGHT_RE.sub('Part of Shootcut. See the open-source notices.', s)
    s = NAME_RE.sub(lambda m: 'Shootcut ' + PRODUCT[m.group(1)], s)
    s = ART_RE.sub('Shootcut', s)
    s = GETART_RE.sub('the Shootcut site', s)
    return s


def is_test_file(path: str) -> bool:
    b = os.path.basename(path)
    return b.startswith('tests') or b.endswith('_tests.rs') or '/tests/' in path or '/target/' in path


def rs_files(root):
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in ('target', '.git', 'node_modules', 'dist')]
        for f in files:
            if f.endswith('.rs'):
                yield os.path.join(d, f)


# whole statements / list entries that open the community pages: removed so no dead button is left
LINE_DROP = [
    re.compile(r'^\s*ui\.hyperlink_to\(.*(?:iscord|getartcraft|storytold|links::(?:DISCORD|APP_PAGE|WEBSITE|GITHUB|ISSUES|APPS)|DISCORD).*\);\s*$'),
    re.compile(r'^\s*big\(ui, app, "discord",.*\);\s*$'),
    re.compile(r'^\s*"ui:help\.(?:discord|website|appPage|github|app|issues)",\s*$'),
    re.compile(r'^\s*ui\.checkbox\(&mut app\.ui\.show_discord,.*\);\s*$'),
    re.compile(r'^\s*link\(ui, "(?:discord|website|appPage|github|issues)".*\);\s*$'),
    re.compile(r'^\s*uic!\("help\.(?:discord|website|appPage|github|issues|app)".*$'),
    re.compile(r'^\s*\("discord", Icon::Chat,.*\),\s*$'),
    re.compile(r'^\s*\("app\.(?:discord|website|github|artcraft)",.*\),\s*$'),
    re.compile(r'^\s*\("help\.(?:discord|website|appPage|github|issues|app)",[^=]*\),\s*$'),
    re.compile(r'^\s*\(Icon::\w+, "[^"]*",[^\n]*"help\.(?:discord|website|appPage|github|issues)"\),\s*$'),
    re.compile(r'^\s*\("app\.links", "Community Links".*$'),
    re.compile(r'^\s*"app\.(?:discord|website|github|artcraft)",\s*$'),
    re.compile(r'^.*\| help\.(?:discord|website|appPage|github|issues|app)\s*$'),
    re.compile(r'^\s*ui\.label\(egui::RichText::new\(tl!\("Community"\)\).*$'),
    re.compile(r'^\s*c\("help\.(?:discord|app_page|github|website|check_updates)",.*$'),
    re.compile(r'^\s*Link \{ command: "help\.(?:discord|app_page|github|website)",.*$'),
    re.compile(r'^\s*crate::links::(?:discord_button\(app, ui, [\d.]+\)|link_row\(app, ui\));\s*$'),
]
ENTRY_DROP = [
    re.compile(r',?\s*\bc\("[^"]*",\s*"(?:ui|help)\.(?:discord|website|appPage|github|issues)"\)'),
    re.compile(r'\b[cd]\("[^"]*",\s*"(?:ui|help)\.(?:discord|website|appPage|github|issues)"\),?\s*'),
]

# (file suffix, regex, replacement): each must match, or the build stops instead of leaving a Discord button behind
EDITS = {
    'deckcraft': [
        ('fonts/build.rs', r'if wasm && !matches!\(', 'if wasm && !scripts.split(\',\').any(|s| s.trim() == "Arab") && !matches!('),
        # Arabic interface: labels go through crate::ar (table, COPIES), widgets translate their own labels
        ('src/lib.rs', r'pub mod backstage;', 'pub mod backstage;\nmod ar;\nmod bidi;'),
        ('src/widgets.rs', r'(pub fn big_button_ex\([^)]*\) -> [^{]*\{\n)', r'\1    let label = crate::ar::tb(label);\n'),
        ('src/widgets.rs', r'(pub fn small_button_ex\([^)]*\) -> [^{]*\{\n)', r'\1    let label = crate::ar::t(label);\n'),
        ('src/ribbon.rs', r'(fn tip\(id: &str, label: &str\) -> String \{\n)', r'\1    let label = crate::ar::t(label);\n'),
        ('src/ribbon.rs', r'layout_no_wrap\("File"\.to_string\(\)', 'layout_no_wrap(crate::ar::t("File").to_string()'),
        ('src/ribbon.rs', r'Align2::CENTER_CENTER, "File", theme::font', 'Align2::CENTER_CENTER, crate::ar::t("File"), theme::font'),
        ('src/ribbon.rs', r'layout_no_wrap\(name\.to_string\(\), font\.clone\(\), t\.text\)', 'layout_no_wrap(crate::ar::t(name).to_string(), font.clone(), t.text)'),
        ('src/ribbon.rs', r'Align2::CENTER_CENTER, name, f, col\)', 'Align2::CENTER_CENTER, crate::ar::t(name), f, col)'),
        ('src/dialogs.rs', r'egui::Window::new\(title\(&d\.id\)\)', 'egui::Window::new(crate::ar::t(title(&d.id)))'),
        ('src/status.rs', r'format!\("Slide \{\} of \{\}", ([^;]*?), n\)', r'crate::ar::slide_of(\1, n)'),
        ('src/status.rs', r'"Slide Master"\.to_string\(\)', 'crate::ar::t("Slide Master").to_string()'),
        ('src/status.rs', r'Align2::LEFT_CENTER, "English \(United States\)"', 'Align2::LEFT_CENTER, crate::ar::t("English (United States)")'),
    ],
    'wordcraft': [
        # Arabic: the craft-fonts Arabic face is a document font too (it was only the interface's), so Arabic text has glyphs
        ('fonts/src/fontdb.rs', r'\.chain\(crate::chinese_fonts\(\)\)\.map\(\|f\| f\.bytes\);', '.chain(crate::chinese_fonts()).chain(crate::CRAFT_FONTS.iter().filter(|f| f.scripts.contains(&"Arab"))).map(|f| f.bytes);'),
        ('fonts/build.rs', r'if wasm && !\(\*family == "BIZ UDPGothic" && \*style == "Regular"\) \{', 'if wasm && !(*family == "BIZ UDPGothic" && *style == "Regular") && !scripts.split(\',\').any(|s| s.trim() == "Arab") {'),
        ('src/backstage.rs', r',\s*\("Discord community", "discord"\)', ''),
        # Arabic interface: the catalog (COPIES), the registry row, and display order for right-to-left text
        ('src/backstage.rs', r'"Good morning"', 'tl!("Good morning")'),
        ('src/backstage.rs', r'"Good afternoon"', 'tl!("Good afternoon")'),
        ('src/backstage.rs', r'"Good evening"', 'tl!("Good evening")'),
        ('src/lib.rs', r'pub mod a11y;', 'pub mod a11y;\npub mod bidi;'),
        ('src/i18n/mod.rs', r'LANGUAGES: \[LangInfo; 19\]', 'LANGUAGES: [LangInfo; 20]'),
        ('src/i18n/mod.rs', r'(code: "bg",.*?catalog: OnceLock::new\(\),?\s*\},\s*)\];',
         r'\1LangInfo { code: "ar", name: "العربية", source: include_str!("ar.tsv"), prefer_hans: false, editing_lang: None, catalog: OnceLock::new() },\n];'),
        ('src/i18n/mod.rs', r'let \(catalog, errors\) = Catalog::parse\(self\.source\);',
         'let (mut catalog, errors) = Catalog::parse(self.source);\n            if self.code == "ar" {\n                catalog.map_translations(crate::bidi::display_rtl);\n            }'),
        ('src/i18n/catalog.rs', r'    pub fn plain\(&self, s: &str\)',
         '    /// Rewrite every translation, e.g. into display order for a right-to-left language.\n    pub fn map_translations(&mut self, f: impl Fn(&str) -> String) {\n        for translation in self.plain.values_mut().chain(self.contextual.values_mut()) {\n            *translation = f(translation);\n        }\n    }\n\n    pub fn plain(&self, s: &str)'),
    ],
    'gridcraft': [
        # Arabic interface: the table (COPIES), the language, and display order for right-to-left text
        ('src/ribbon.rs', r'RichText::new\("AutoSave"\)', 'RichText::new(app.ui.language.tr("AutoSave"))'),
        ('src/ribbon.rs', r'on_hover_text\("AutoSave: save after every change \(workbooks saved to a file\)"\)', 'on_hover_text(app.ui.language.tr("AutoSave: save after every change (workbooks saved to a file)"))'),
        ('src/lib.rs', r'pub mod backstage;', 'pub mod backstage;\npub mod bidi;'),
        ('src/i18n.rs', r'\nmod cs;', '\nmod ar;\nmod cs;'),
        ('src/i18n.rs', r'    Sr,\n\}', '    Sr,\n    Ar,\n}'),
        ('src/i18n.rs', r'ALL: \[Self; 11\] = (\[.*?)Self::Sr\];', r'ALL: [Self; 12] = \1Self::Sr, Self::Ar];'),
        ('src/i18n.rs', r'(Self::Sr => "Srpski",)', r'\1\n            Self::Ar => "العربية",'),
        ('src/i18n.rs', r'(Self::Sr => "sr",)', r'\1\n            Self::Ar => "ar",'),
        ('src/i18n.rs', r'("sr" => Some\(Self::Sr\),)', r'\1\n            "ar" => Some(Self::Ar),'),
        ('src/i18n.rs', r'(Self::Sr => sr::translate\(text\),)', r'\1\n            Self::Ar => ar::translate(text),'),
    ],
    'photocraft': [
        ('src/panels.rs', r'const DISCORD_ROOM: f32 = [\d.]+;', 'const DISCORD_ROOM: f32 = 1.0e9;'),
    ],
    'lightcraft': [
        ('panels/dialogs.rs', r'let discord = egui::Button::new\(.*?\n\s*if r\.clicked\(\) \{\n.*?\n\s*\}\n', ''),
        ('panels/dialogs.rs', r'for \(label, url\) in \[\n\s*\("LightCraft website".*?\n\s*\] \{\n.*?\n\s*\}\n\s*\}\n', ''),
    ],
    'vectorcraft': [
        ('text/build.rs', r'if wasm && !\(\*family == WEB_FONT\.0 && \*style == WEB_FONT\.1\) \{', 'if wasm && !(*family == WEB_FONT.0 && *style == WEB_FONT.1) && !scripts.split(\',\').any(|s| s.trim() == "Arab") {'),
        ('src/chrome.rs', r'let discord = search &&', 'let discord = false &&'),
        ('src/community.rs', r'(pub fn links\(app: &mut VectorcraftApp, ui: &mut Ui\) \{\n).*?(\n\}\n)', r'\1    let _ = (app, ui);\2'),
    ],
    'designcraft': [
        # Glyph fallback on by default: a character the font lacks (Arabic, say) is set in a font that has it instead of a box
        ('doc/src/lib.rs', r'(track_changes: false,\n\s*)glyph_fallback: false,', r'\1glyph_fallback: true,'),
        ('doc/src/build.rs', r'glyph_fallback: false,', 'glyph_fallback: true,'),
        ('format/src/lib.rs', r'pub const MIME: &str = "application/vnd\.designcraft\+zip";', 'pub const MIME: &str = "application/octet-stream";'),
        # Arabic controls of the Character panel (Character Direction, Kashidas, Diacritic Positioning)
        ('panels/properties.rs', r'(\n    // Underline / Strikethrough Options\.\n)', '\n    shootcut_arabic_block(app, ui, &c, &a);\\1'),
        ('panels/properties.rs', r'if digits != "default" \|\| a\["para"\]\["direction"\]\.as_str\(\) == Some\("rightToLeft"\) \{', 'if digits != "default" || matches!(lang.as_str(), "Arabic" | "Hebrew") || a["para"]["direction"].as_str() == Some("rightToLeft") {'),
        # Arabic: the craft-fonts Arabic face is a document font too (it was only the interface's), so Arabic text has glyphs
        ('fonts/src/fontdb.rs', r'let craft = crate::japanese_document_fonts\(\)\.into_iter\(\)\.map\(\|f\| f\.bytes\);', 'let craft = crate::japanese_document_fonts().into_iter().chain(crate::CRAFT_FONTS.iter().filter(|f| f.scripts.contains(&"Arab"))).map(|f| f.bytes);'),
        # Saved files carry Shootcut's extension (Windows shows "<EXT> File"); the old extension still opens.
        # A fourth item means: replace every match.
        ('ui-egui/src/menus.rs', r'(format!\("[^"]*)\.designcraft"', r'\1.shootcut"', 'all'),
        ('doc/src/vars.rs', r'(format!\("[^"]*)\.designcraft"', r'\1.shootcut"', 'all'),
        ('ui-egui/src/lib.rs', r'\[".designcraft", ".idml"\]', '[".shootcut", ".designcraft", ".idml"]'),
        ('cmd/file.rs', r'lname\.ends_with\("\.idml"\) \|\| lname\.ends_with\("\.designcraft"\)', 'lname.ends_with(".idml") || lname.ends_with(".designcraft") || lname.ends_with(".shootcut")'),
        ('designcraft-web/src/web.rs', r'const DOC_EXTS: &\[&str\] = &\["designcraft", "idml"\];', 'const DOC_EXTS: &[&str] = &["shootcut", "designcraft", "idml"];'),
        ('designcraft-web/src/web.rs', r'(\n    )"designcraft",(\n\];)', r'\1"designcraft",\1"shootcut",\2'),
        ('designcraft-web/src/browser_policy.rs', r'Some\("designcraft"\) =>', 'Some("designcraft" | "shootcut") =>'),
        ('fonts/build.rs', r'if wasm && !\(\*family == "BIZ UDPGothic" && \*style == "Regular"\) \{', 'if wasm && !(*family == "BIZ UDPGothic" && *style == "Regular") && !scripts.split(\',\').any(|s| s.trim() == "Arab") {'),
        ('src/about.rs', r'(pub const SIBLINGS: &\[[^\n]*\] = &\[)\n.*?\n\];', r'\1];'),
        ('src/about.rs', r'\n\s*ui\.add_space\(4\.0\);\n\s*ui\.label\(crate::rtl::widget\(\n\s*ui,\n\s*egui::RichText::new\(crate::i18n::tr\(&app\.ui\.language, "discord\.gg/artcraft[^\n]*\n[^\n]*\n[^\n]*\n\s*\)\);', ''),
        ('src/about.rs', r'\n\s*ui\.separator\(\);\n\s*ui\.add_space\(6\.0\);\n\s*ui\.label\(crate::rtl::widget\(\n\s*ui,\n\s*egui::RichText::new\(crate::i18n::tr\(&app\.ui\.language, "More ArtCraft apps".*?(?=\n\s*ui\.add_space\(12\.0\);\n\s*ui\.label\(crate::rtl::widget\(\n\s*ui,\n\s*egui::RichText::new\(crate::i18n::tr\(&app\.ui\.language, "Open source)', ''),
        ('src/about.rs', r'(pub fn discord_button\(ui: &mut egui::Ui, label: &str, size: egui::Vec2\) -> bool \{\n).*?(\n\}\n)', r'\1    let _ = (ui, label, size);\n    false\2'),
        ('src/chrome.rs', r'(fn community_card\(app: &mut DesignApp, ui: &mut egui::Ui\) \{\n).*?(\n\}\n)', r'\1    let _ = (app, ui);\2'),
        ('src/about.rs', r'\n\s*ui\.add_space\(14\.0\);\n\s*ui\.horizontal\(\|ui\| \{\n\s*// Centre the row of links\..*?\n\s*\}\);\n(?=\s*ui\.add_space\(16\.0\);)', '\n'),
    ],
    'figcraft': [
        # Arabic: the craft-fonts Arabic face is let into the web build (it only carried Inter), so Arabic text has glyphs
        ('text/build.rs', r'if wasm && \*family != "Inter" && !cjk \{', 'if wasm && *family != "Inter" && !cjk && !scripts.split(\',\').any(|s| s.trim() == "Arab") {'),
        # About: no community links, no "part of ArtCraft"
        ('ui-egui/src/dialogs.rs', r', part of the ArtCraft Crafting Apps\.', '.'),
        ('ui-egui/src/dialogs.rs', r'Dual-licensed MIT OR Apache-2\.0\. Made by the ArtCraft team and community\.', 'Open source (MIT OR Apache-2.0). See the open-source notices.'),
        ('ui-egui/src/dialogs.rs', r'trf\("If it keeps happening, please report it at \{link\} with this message\.", &\[\("link", &ISSUES\)\]\)', 'tr("If it keeps happening, please report it with this message.").to_string()'),
        ('ui-egui/src/dialogs.rs', r'const ISSUES: &str = "[^"]*";\n', ''),
        # The Help page opened the upstream's site: the menu entry and its command go
        ('ui-egui/src/lib.rs', r'"open\.help" => self\.services\.open_url\("[^"]*"\),', '"open.help" => {}'),
        ('engine/src/catalog.rs', r'\n\s*m!\("Help", "Help page", "help\.page"\),', ''),
        # The app's own mark (the chameleon's tail, drawn in code) becomes a Shootcut "S"
        ('ui-egui/src/icons.rs', r'(        Logo => \{\n)\s*// FigCraft\'s own mark:.*?p\.dot\(7\.25, 6\.5, 0\.85\);\n', "\\1            // Shootcut's mark: an S of two bowls, one stroke\n            let mut s: Vec<(f32, f32)> = arc_pts(7.25, 5.5, 2.75, FRAC_PI_2, 11.0 * PI / 6.0).collect();\n            s.reverse();\n            s.extend(arc_pts(7.25, 11.0, 2.75, 3.0 * FRAC_PI_2, 17.0 * PI / 6.0));\n            let v: Vec<Pos2> = s.iter().map(|&(x, y)| p.raw(x, y)).collect();\n            p.painter.add(Shape::line(v, Stroke::new(1.9 * p.s, p.color)));\n"),
        # Make the web runner's first module declaration a clean one, where the font bridge is declared
        ('figcraft-web/src/main.rs', r'#\[cfg\(target_arch = "wasm32"\)\]\nmod web;\n', ''),
        ('figcraft-web/src/main.rs', r'(#\[cfg\(any\(target_arch = "wasm32", test\)\)\]\nmod query;)', '#[cfg(target_arch = "wasm32")]\nmod web;\n\\1'),
    ],
    'pdfcraft': [
        # Choosing Prepare a form from All tools detects the fields at once (a file without fields), as the command does
        ('ui-egui/src/panels.rs', r'(if tool_row\(ui, t, g\)\.clicked\(\) \{\s*app\.select_tool\(g\.id\);)', r'\1\n                if g.id == "form" {\n                    app.execute("form.prepare");\n                }'),
        ('engine/src/catalog.rs', r'(item\("Detect form fields", "scan", "form\.detect", Ready\),)', r'\1\n                    item("Convert to fillable PDF", "text-cursor-input", "form.convert", Ready),'),
        # One click: open Prepare a form and detect the fields, whether or not the file already has some
        ('engine/src/commands.rs', r'(c\("form\.detect", "Detect form fields", None, None, Modification, "scan"\),)', r'\1\n    c("form.convert", "Convert to fillable PDF (detect the fields automatically)", None, None, Modification, "text-cursor-input"),'),
        ('ui-egui/src/commands.rs', r'"form\.detect" => self\.detect_fields\(\),', '"form.detect" => self.detect_fields(),\n            "form.convert" => {\n                self.left = crate::LeftPanel::Tool("form");\n                self.reveal_tools();\n                self.choose_right_panel(Some(RightPanel::Fields));\n                self.detect_fields();\n            }'),
        # The web build opens in the browser's language (Shootcut hands its own over as ?lang=, which the page turns into navigator.language)
        ('ui-egui/src/i18n/mod.rs', r'(#\[cfg\(target_arch = "wasm32"\)\]\nfn detect_system_lang\(\) -> Lang \{\n)    Lang::EN\n\}',
         r'\1    let nav = web_sys::window().map(wasm_bindgen::JsValue::from).and_then(|w| js_sys::Reflect::get(&w, &"navigator".into()).ok());\n    let tag = nav.and_then(|n| js_sys::Reflect::get(&n, &"language".into()).ok()).and_then(|v| v.as_string());\n    tag.as_deref().and_then(lang_from_tag).unwrap_or(Lang::EN)\n}'),
        # Acrobat DC: Ctrl+Y also redoes, and Alt+Left / Alt+Right are Previous / Next view
        ('ui-egui/src/canvas.rs', r'(if pressed\(cmd\(Key::CloseBracket\)\) \{\s*view\.view_history\(true\);\s*\})',
         r'\1\n    if pressed(KeyboardShortcut::new(Modifiers::ALT, Key::ArrowLeft)) {\n        view.view_history(false);\n    }\n    if pressed(KeyboardShortcut::new(Modifiers::ALT, Key::ArrowRight)) {\n        view.view_history(true);\n    }'),
        ('ui-egui/src/commands.rs', r'(\n\s*self\.execute\(spec\.id\);\n\s*\}\n\s*\}\n\s*\})(\n    \}\n\}\n\n/// The tab after)',
         r'\1\n        if !typing && ctx.input_mut(|i| i.consume_shortcut(&KeyboardShortcut::new(Modifiers::COMMAND, Key::Y))) {\n            self.execute("edit.redo");\n        }\2'),
        # Shootcut's picture-based field detection (empty table cells, dotted blanks, colon labels; Arabic labels; no frame or fill)
        ('forms/src/lib.rs', r'pub mod detect;', 'pub mod detect;\npub mod shootcut_detect;'),
        ('engine/src/lib.rs', r'pub mod js;\n', 'pub mod js;\nmod shootcut_detect;\n'),
        ('engine/src/js.rs', r'for c in pdfcraft_forms::detect::detect\(&words, &shapes, &existing, &taken\) \{\s*taken\.push\(c\.name\.clone\(\)\);\s*out\.push\(\(page, c\)\);\s*\}',
         'let native = pdfcraft_forms::detect::detect(&words, &shapes, &existing, &taken);\n            let mut found = Vec::new();\n            if !crate::shootcut_detect::extend(&mut r, page, &doc.info.pages[page], &words, &existing, &taken, &mut found) {\n                crate::shootcut_detect::merge_native(&mut found, native);\n            }\n            for c in found {\n                taken.push(c.name.clone());\n                out.push((page, c));\n            }'),
        ('engine/src/js.rs', r'let names = found\.iter\(\)\.map\(\|\(_, c\)\| c\.name\.clone\(\)\)\.collect\(\);', 'let names: Vec<String> = found.iter().map(|(_, c)| c.name.clone()).collect();'),
        ('engine/src/js.rs', r'self\.apply\(id, Edit::Batch \{ label: "Detect form fields"\.into\(\), edits \}\)\?;',
         'let mut edits: Vec<Edit> = edits;\n        edits.extend(crate::shootcut_detect::style_edits(&names));\n        self.apply(id, Edit::Batch { label: "Detect form fields".into(), edits })?;'),
        # Top bar: the Discord button and the width reserved for it
        ('ui-egui/src/chrome.rs', r'layout_no_wrap\("Discord"\.into\(\)', 'layout_no_wrap("".into()'),
        ('ui-egui/src/chrome.rs', r'\n\s*// One click to the community, from anywhere in the app\.\n\s*if widgets::ghost_button_sized\(ui, "messages-square", "Discord".*?\n\s*\}\n', '\n'),
        # Home: the community card with ArtCraft's mark
        ('ui-egui/src/home.rs', r'\n\s*egui::Frame::NONE\n(?:(?!\n\s*egui::Frame::NONE).)*?widgets::artcraft_mark\(ui, 28\.0\);.*?\n\s*\}\);\n(?=\s*ui\.add_space\(22\.0\);)', '\n'),
        # About: "Part of <ArtCraft logo>"
        ('ui-egui/src/dialogs.rs', r'\n\s*ui\.add_space\(12\.0\);\n\s*ui\.horizontal\(\|ui\| \{\n\s*ui\.label\(egui::RichText::new\(tl!\("Part of"\)\)[^\n]*\n\s*widgets::artcraft_logo\(ui, 16\.0\);\n\s*\}\);', ''),
        # The upstream's pictures and community buttons are no longer drawn or embedded
        ('ui-egui/src/widgets.rs', r'pub fn artcraft_logo\(ui: &mut egui::Ui, height: f32\) -> Response \{.*?\n\}\n', 'pub fn artcraft_logo(ui: &mut egui::Ui, height: f32) -> Response {\n    let _ = height;\n    ui.allocate_response(vec2(0.0, 0.0), Sense::hover())\n}\n'),
        ('ui-egui/src/widgets.rs', r'pub fn artcraft_mark\(ui: &mut egui::Ui, size: f32\) -> Response \{.*?\n\}\n', 'pub fn artcraft_mark(ui: &mut egui::Ui, size: f32) -> Response {\n    let _ = size;\n    ui.allocate_response(vec2(0.0, 0.0), Sense::hover())\n}\n'),
        ('ui-egui/src/widgets.rs', r'pub fn community_links\(ui: &mut egui::Ui\) -> Option<&\'static str> \{.*?\n\}\n', 'pub fn community_links(ui: &mut egui::Ui) -> Option<&\'static str> {\n    let _ = ui;\n    None\n}\n'),
    ],
    'soundcraft': [
        # Familiar editor key layout: split, marker, delete, import, loop get the keys people expect
        # (the keys are listed in one table inside command_specs, applied after every command is registered)
        ('cmd/mod.rs', r'(\n)(\s*)v\n(\s*\}\)\n\}\n\s*pub fn find_command)',
         r'''\1\2const KEYS: [(&str, &str); 9] = [("edit.separate", "Cmd+K"), ("options.pre_post_roll", "Cmd+Alt+K"), ("edit.clear", "Delete"), ("markers.add", "M"), ("file.import_audio", "Cmd+I"), ("event.identify_beat", "Cmd+Alt+Shift+I"), ("options.loop_playback", "Cmd+L"), ("clip.edit_lock", "Cmd+Alt+Shift+L"), ("edit.duplicate", "Cmd+D")];
\2for s in v.iter_mut() {
\2    if let Some((_, k)) = KEYS.iter().find(|(i, _)| *i == s.id) {
\2        s.shortcut = Some(*k);
\2    }
\2}
\2v
\3'''),
    ],
    'filmcraft': [
        # The classic editing key layout is the default one, under a Shootcut name
        ('engine/src/shortcuts.rs', r'PREMIERE_PRESET: &str = "[^"]*";', 'PREMIERE_PRESET: &str = "Shootcut Classic Editing";'),
        ('engine/src/shortcuts.rs', r'DEFAULT_PRESET => Vec::new\(\),', 'DEFAULT_PRESET => presets::premiere(),'),
        ('text/build.rs', r'if wasm && !\(\*family == "BIZ UDPGothic" && \*style == "Regular"\) \{', 'if wasm && !(*family == "BIZ UDPGothic" && *style == "Regular") && !scripts.split(\',\').any(|s| s.trim() == "Arab") {'),
        ('src/links.rs', r'ALL: \[\(&str, &str, &str\); 5\]', 'ALL: [(&str, &str, &str); 1]'),
        ('src/header.rs', r'let label = "Discord";\n.*?ui\.painter\(\)\.galley\(pos2\(r\.min\.x \+ 25\.0, [^\n]*\n',
         'let r = Rect::from_min_size(pos2(wr.min.x - 14.0, rect.center().y - 12.0), vec2(0.0, 24.0));\n'),
        ('src/header.rs', r'\n\s*if resp\.clicked\(\) \{\n\s*crate::links::open\(app, ui\.ctx\(\), crate::links::DISCORD\);\n\s*\}', ''),
        ('panels/import_mode.rs', r'tl!\("Community"\)', 'tl!("Shootcut")'),
        ('panels/import_mode.rs', r'crate::links::ALL\.iter\(\)\.take\(4\)', 'crate::links::ALL.iter().take(0)'),
    ],
    'effectcraft': [
        ('engine/src/demo.rs', r'"EFFECTCRAFT"', '"SHOOTCUT"', 'all'),
        ('src/links.rs', r'(pub const SIBLINGS: &\[[^\n]*\] = &\[)\n.*?\n\];', r'\1];'),
        ('panels/dialogs.rs', r'let links: \[\(Icon, &str, &str, &\'static str\); 4\] = \[.*?\];', "let links: [(Icon, &str, &str, &'static str); 0] = [];"),
        ('panels/home.rs', r'let links = \[\n\s*\(Icon::Chat, "Join the ArtCraft Discord".*?\];', 'let links: [(Icon, &str, &str); 0] = [];'),
        ('src/header.rs', r'let label = p\.layout_no_wrap\(tr\("Discord"\).*?rx = discord\.min\.x - 6\.0;\n', ''),
        ('src/header.rs', r'\[\("hdr-github".*?"help\.appPage"\)\]', 'Vec::<(&str, Icon, &str, &str)>::new()'),
    ],
}


FAILED = []
HIT = set()

# Rust added at the end of a source file (read from scripts/studio-fonts/)
APPENDS = {
    'designcraft': ('panels/properties.rs', 'designcraft_arabic.rs'),
}


def apply_edits(path, txt, repo):
    for i, edit in enumerate(EDITS.get(repo, [])):
        suffix, rx, rep = edit[:3]
        if path.replace('\\', '/').endswith(suffix):
            new, n = re.subn(rx, rep, txt, count=0 if len(edit) > 3 else 1, flags=re.S)
            if n:
                HIT.add((repo, i))
                txt = new
    app = APPENDS.get(repo)
    if app and path.replace('\\', '/').endswith(app[0]) and 'shootcut_arabic_block(app: &mut' not in txt:
        txt += open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'studio-fonts', app[1]), encoding='utf-8').read()
        HIT.add((repo, 'append'))
    return txt


def clean_rust_strings(src):
    """Renames inside every Rust string literal, also those that continue on the next line with a trailing backslash.
    A small scanner skips comments, char literals and lifetimes, so quotes in them are not mistaken for strings."""
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith('//', i):
            j = src.find('\n', i)
            j = n if j < 0 else j
            out.append(src[i:j]); i = j
        elif src.startswith('/*', i):
            j = src.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(src[i:j]); i = j
        elif c == 'r' and re.match(r'r#*"', src[i:i + 10]) and (i == 0 or not (src[i - 1].isalnum() or src[i - 1] == '_')):
            hashes = re.match(r'r(#*)"', src[i:]).group(1)
            end = '"' + hashes
            j = src.find(end, i + 2 + len(hashes))
            j = n if j < 0 else j + len(end)
            out.append(src[i:j]); i = j
        elif c == '"':
            j = i + 1
            while j < n and src[j] != '"':
                j += 2 if src[j] == '\\' else 1
            j = min(n, j + 1)
            out.append(clean_text(DEAD_URL_RE.sub('', src[i:j]))); i = j
        elif c == "'":
            m = re.match(r"'(?:\\.[^']*|[^\\'])'", src[i:i + 12])
            if m:
                out.append(m.group(0)); i += len(m.group(0))
            else:
                out.append(c); i += 1
        else:
            out.append(c); i += 1
    return ''.join(out)


def patch_rs(path, repo):
    try:
        txt = open(path, encoding='utf-8').read()
    except UnicodeDecodeError:
        return False
    orig = txt
    txt = apply_edits(path, txt, repo)
    out = []
    skip_literals = is_test_file(path)
    for line in txt.split('\n'):
        st = line.lstrip()
        if not skip_literals and any(r.match(line) for r in LINE_DROP):
            continue
        if st.startswith('//'):
            out.append(line)
            continue
        if not skip_literals and re.search(r'"(?:help\.(?:discord|website|appPage|github|issues|app|artcraftWebsite)|app\.(?:discord|website|github|artcraft))"', line):
            line = line.replace('&["Help"]', '&[]').replace('["Help"]', '[]')
        if not skip_literals:
            for r in ENTRY_DROP:
                line = r.sub('', line)
            line = LITERAL.sub(lambda m: clean_text(DEAD_URL_RE.sub('', m.group(0))), line)
        if line.strip() == ',':
            continue
        out.append(line)
    txt = '\n'.join(out)
    if not skip_literals:
        txt = clean_rust_strings(txt)
    txt = re.sub(r'show_discord:\s*true', 'show_discord: false', txt)
    if txt != orig:
        open(path, 'w', encoding='utf-8').write(txt)
        return True
    return False


DROP_LINE_TSV = re.compile(r'(iscord|getartcraft|github\.com/storytold|ArtCraft (?:web|Web)site|ArtCraft App Page|on GitHub)')


def patch_tsv(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    out = []
    for l in lines:
        if l and not l.startswith('#') and DROP_LINE_TSV.search(l):
            continue
        out.append(clean_text(l) if l and not l.startswith('#') else l)
    new = '\n'.join(out)
    if new != '\n'.join(lines):
        open(path, 'w', encoding='utf-8').write(new)
        return True
    return False


# ------------------------------------------------------------------ colours: upstream blues, greens and oranges become Shootcut red
import colorsys

BRAND_HUE = 357 / 360.0
ACCENT_NAME = re.compile(r'^\s*(?:pub\s+)?(\w*(?:accent|selection|primary|link|focus|active|hover|brand)\w*)\s*:', re.I)
KEEP_NAME = re.compile(r'(highlight|warn|danger|error|success|find|marker|label|swatch|track|wave|meter|clip)', re.I)
CALL = re.compile(
    r'(Color32::from_rgba_(?:un)?multiplied\(\s*|Color32::from_rgb\(\s*|\bhex\(\s*|\brgb\(\s*)'
    r'(0x[0-9a-fA-F]{6}\b|0x[0-9a-fA-F]{2}\s*,\s*0x[0-9a-fA-F]{2}\s*,\s*0x[0-9a-fA-F]{2}|\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3})')


def _recolor(r, g, b, force):
    h, l, sat = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if sat < 0.2 or l < 0.04 or l > 0.97:
        return None
    if not (0.52 <= h <= 0.74 or force):
        return None
    r2, g2, b2 = colorsys.hls_to_rgb(BRAND_HUE, l, max(sat, 0.55) if force else sat)
    return round(r2 * 255), round(g2 * 255), round(b2 * 255)


def recolor_line(line):
    m = ACCENT_NAME.match(line)
    force = bool(m) and not KEEP_NAME.search(m.group(1))

    def sub(mm):
        head, body = mm.group(1), mm.group(2)
        if body.startswith('0x') and ',' not in body:
            v = int(body, 16)
            new = _recolor(v >> 16 & 255, v >> 8 & 255, v & 255, force)
            return head + '0x%02x%02x%02x' % new if new else mm.group(0)
        parts = [x.strip() for x in body.split(',')]
        hexy = parts[0].startswith('0x')
        rgb = tuple(int(x, 16) if hexy else int(x) for x in parts)
        if any(c > 255 for c in rgb):
            return mm.group(0)
        new = _recolor(*rgb, force)
        if not new:
            return mm.group(0)
        return head + ', '.join(('0x%02X' % c) if hexy else str(c) for c in new)
    return CALL.sub(sub, line)


def recolor_file(path):
    txt = open(path, encoding='utf-8').read()
    new = '\n'.join(recolor_line(l) for l in txt.split('\n'))
    if new != txt:
        open(path, 'w', encoding='utf-8').write(new)
        return True
    return False


# ------------------------------------------------------------------ logos: pictures of the old marks become Shootcut's mark, same size
ICON_NAME = re.compile(r'^(?:favicon|apple-touch-icon|icon[-_]?\d*|logo|app-icon|ai\.storyteller\.[a-z]+)(?:[-_.]\d+)?(?:-[0-9a-f]{8,})?\.(?:png|svg|ico)$')


def _is_icon_name(low):
    return bool(ICON_NAME.match(low))


def replace_pictures(src):
    try:
        from PIL import Image
    except ImportError:
        print('Pillow missing: pictures left as they are')
        return 0
    here = os.path.dirname(os.path.abspath(__file__))
    mark = Image.open(os.path.join(here, 'brand', 'icon-512.png')).convert('RGBA')
    svg = open(os.path.join(here, 'brand', 'favicon.svg')).read()
    n = 0
    for d, dirs, files in os.walk(src):
        dirs[:] = [x for x in dirs if x not in ('target', '.git', 'node_modules', 'dist')]
        for f in files:
            full = os.path.join(d, f)
            rel = full.replace('\\', '/')
            low = f.lower()
            if '/assets/icons/' in rel or not ('/docs/brand/' in rel or '/app-icon' in rel or 'artcraft' in low
                                               or 'storyteller' in low or _is_icon_name(low)):
                continue
            if low.endswith('.png'):
                try:
                    im = Image.open(full)
                except Exception:
                    continue
                w, h = im.size
                side = max(1, int(min(w, h) * (0.84 if w == h else 0.9)))
                m = mark.resize((side, side), Image.LANCZOS)
                tint = 255 if 'white' in low else (1 if 'black' in low else None)
                if tint is not None:
                    m = Image.merge('RGBA', (Image.new('L', m.size, tint),) * 3 + (m.getchannel('A'),))
                out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
                out.paste(m, ((w - side) // 2, (h - side) // 2), m)
                out.save(full)
                n += 1
            elif low.endswith('.svg'):
                open(full, 'w').write(svg)
                n += 1
            elif low.endswith('.ico'):
                mark.save(full, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
                n += 1
    return n


def replace_drawn_logos(src):
    """DeckCraft's card-with-triangle and DesignCraft's vector mark become a red tile with an S."""
    n = 0
    tile = ('    let side = {w}.min({h});\n'
            '    let r = egui::Rect::from_center_size({c}, egui::vec2(side, side));\n'
            '    {p}.rect_filled(r, egui::CornerRadius::same((side * 0.22) as u8), {col});\n'
            '    {p}.text(r.center(), egui::Align2::CENTER_CENTER, "S", egui::FontId::proportional(side * 0.62), egui::Color32::WHITE);')
    jobs = [
        ('crates/ui-egui/src/dialogs.rs', r'(pub fn paint_logo\(p: &egui::Painter, r: Rect\) \{\n).*?(\n\}\n)',
         tile.format(w='r.width()', h='r.height()', c='r.center()', p='p', col='egui::Color32::from_rgb(0xD7, 0x19, 0x20)'), 'DeckCraft'),
        ('crates/ui-egui/src/about.rs', r'(pub fn paint_mark\(ui: &egui::Ui, rect: Rect, color: Color32\) \{\n).*?(\n\}\n)',
         tile.format(w='rect.width()', h='rect.height()', c='rect.center()', p='ui.painter()', col='color'), 'DesignCraft'),
    ]
    for rel, rx, body, who in jobs:
        path = os.path.join(src, rel)
        if not os.path.exists(path):
            continue
        t = open(path, encoding='utf-8').read()
        t2 = re.sub(rx, lambda m: m.group(1) + body + m.group(2), t, count=1, flags=re.S)
        if t2 != t:
            open(path, 'w', encoding='utf-8').write(t2)
            n += 1
    return n


TEXT_ASSET_EXT = ('.md', '.js', '.jsx', '.txt')
KEEP_NAMES = re.compile(r'(^|/)(LICEN[CS]E|NOTICE|ATTRIBUTION|THIRD[-_]PARTY|CONTRIBUT|CODE_OF_CONDUCT|AGENTS|CLAUDE)', re.I)


def patch_text_asset(path):
    """Docs, changelogs and scripts that the apps embed (include_str!): same renaming, community lines dropped."""
    if KEEP_NAMES.search(path.replace('\\', '/')) or '/node_modules/' in path:
        return False
    try:
        txt = open(path, encoding='utf-8').read()
    except UnicodeDecodeError:
        return False
    out = []
    for l in txt.split('\n'):
        if DROP_LINE_TSV.search(l) or re.search(r'discord\.gg|getartcraft|github\.com/storytold', l):
            continue
        out.append(clean_text(DEAD_URL_RE.sub('', l)))
    new = '\n'.join(out)
    new = re.sub(r'\bDiscord\b', 'Shootcut', new)
    if new != txt:
        open(path, 'w', encoding='utf-8').write(new)
        return True
    return False


def patch_json(path):
    """locales/*.json catalogs (English text -> translation): same renaming as the sources, community entries dropped."""
    try:
        data = json.load(open(path, encoding='utf-8'))
    except Exception:
        return False
    if not isinstance(data, dict):
        return False
    out = {}
    for k, v in data.items():
        if isinstance(k, str) and DROP_LINE_TSV.search(k):
            continue
        nk = clean_text(k) if isinstance(k, str) else k
        out[nk] = clean_text(v) if isinstance(v, str) else v
    if out != data:
        json.dump(out, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        return True
    return False


# Fonts the person adds on the site reach these apps through scripts/studio-fonts/bridge.rs
# repo: (Rust expression that registers `bytes` and returns how many faces came in, crate that holds it,
#        file that declares the modules, file whose WebLogger line starts the app)
# Whole files copied into an app's sources (after the Rust files are cleaned): (path in the app, file in scripts/studio-patches)
COPIES = {
    'deckcraft': [
        ('crates/ui-egui/src/ar.rs', 'deckcraft/ar.rs'),
        ('crates/ui-egui/src/bidi.rs', 'deckcraft/bidi.rs'),
    ],
    'gridcraft': [
        ('crates/ui-egui/src/i18n/ar.rs', 'gridcraft/ar.rs'),
        ('crates/ui-egui/src/bidi.rs', 'gridcraft/bidi.rs'),
    ],
    'wordcraft': [
        ('crates/ui-egui/src/i18n/ar.tsv', 'wordcraft/ar.tsv'),
        ('crates/ui-egui/src/bidi.rs', 'wordcraft/bidi.rs'),
    ],
    'pdfcraft': [
        ('crates/forms/src/shootcut_detect.rs', 'pdfcraft/forms_shootcut_detect.rs'),
        ('crates/engine/src/shootcut_detect.rs', 'pdfcraft/engine_shootcut_detect.rs'),
    ],
}


# ---- DeckCraft has no translation system: labels are wrapped to go through crate::ar (Arabic table) ----
_L = r'"(?:[^"\\\n]|\\.)*"'
_NOWRAP = r'(?!(?:big|small|toggle|big_button|big_button_ex|small_button|small_button_ex|icon_toggle)\b)'
DECK_WRAP = [
    re.compile(r'(\.(?:label|button|heading|small_button|menu_button|on_hover_text|on_disabled_hover_text|collapsing|strong|weak|hint_text)\(\s*)(' + _L + r')(?=\s*[,)])'),
    re.compile(r'((?:RichText|Label|Button|Checkbox)::new\(\s*)(' + _L + r')(?=\s*[,)])'),
    re.compile(r'(\.(?:checkbox|selectable_label|radio|toggle_value)\([^;"]*?,\s*)(' + _L + r')(?=\s*\))'),
    re.compile(r'(\.(?:selectable_value|radio_value)\([^;"]*?,[^;",]+,\s*)(' + _L + r')(?=\s*\))'),
    re.compile(r'(\b(?:field|check)\(\s*ui,\s*d,\s*)(' + _L + r')(?=\s*,)'),
    re.compile(r'(\b' + _NOWRAP + r'\w+\([^;"]*?Icon::\w+,\s*)(' + _L + r')(?=\s*[,)])'),
]
# labels that the widgets translate themselves (big_button_ex, small_button_ex, tip)
DECK_OWN = re.compile(r'\b(?:big|small|toggle|big_button|big_button_ex|small_button|small_button_ex|icon_toggle)\(\s*[^;"]*?Icon::\w+,\s*(' + _L + r')')


def deck_wrap(txt, found=None):
    for rx in DECK_WRAP:
        def sub(m):
            if found is not None:
                found.append(m.group(2))
            return m.group(1) + 'crate::ar::t(' + m.group(2) + ')'
        txt = rx.sub(sub, txt)
    if found is not None:
        found.extend(m.group(1) for m in DECK_OWN.finditer(txt))
    return txt


def add_deck_arabic(src, repo):
    if repo != 'deckcraft':
        return
    ui = os.path.join(src, 'crates', 'ui-egui', 'src')
    for f in sorted(os.listdir(ui)):
        if not f.endswith('.rs') or 'tests' in f or f.startswith('shootcut') or f in ('ar.rs', 'bidi.rs'):
            continue
        p = os.path.join(ui, f)
        a = open(p, encoding='utf-8').read()
        b = deck_wrap(a)
        if b != a:
            open(p, 'w', encoding='utf-8').write(b)


# crates that the added Arabic code needs (the version is already in the app's workspace)
UI_DEPS = {'wordcraft': 'unicode-bidi = { workspace = true }', 'gridcraft': 'unicode-bidi = "0.3"', 'deckcraft': 'unicode-bidi = { workspace = true }'}


def add_ui_deps(src, repo):
    dep = UI_DEPS.get(repo)
    if not dep:
        return
    p = os.path.join(src, 'crates', 'ui-egui', 'Cargo.toml')
    c = open(p, encoding='utf-8').read()
    name = dep.split('=')[0].strip()
    if re.search(r'^' + re.escape(name) + r'\s*=', c, re.M):
        return
    c, k = re.subn(r'^(\[dependencies\]\n)', lambda m: m.group(1) + dep + '\n', c, count=1, flags=re.M)
    if not k:
        sys.exit(f'patch-studio: no [dependencies] table in {p}')
    open(p, 'w', encoding='utf-8').write(c)


def copy_files(src, repo):
    here = os.path.dirname(os.path.abspath(__file__))
    for dest, name in COPIES.get(repo, []):
        shutil.copyfile(os.path.join(here, 'studio-patches', name), os.path.join(src, dest))


FONT_BRIDGE = {
    'designcraft': ('designcraft_fonts::FontDb::global().add_font(bytes)', 'designcraft-fonts', 'main.rs', 'web.rs'),
    'wordcraft': ('wordcraft_fonts::FontDb::global().add_font(bytes)', 'wordcraft-fonts', 'main.rs', 'web.rs'),
    'deckcraft': ('deckcraft_fonts::FontDb::global().add_font(bytes)', 'deckcraft-fonts', 'main.rs', 'web.rs'),
    'vectorcraft': ('vectorcraft_text::FontDb::global().add_font(bytes)', 'vectorcraft-text', 'main.rs', 'web.rs'),
    'photocraft': ('photocraft_text::shared().lock().unwrap_or_else(|e| e.into_inner()).fonts.register_font_data(bytes).len()',
                   'photocraft-text', 'main.rs', 'web.rs'),
    'filmcraft': ('filmcraft_text::fonts::add_font_data(bytes).len()', 'filmcraft-text', 'lib.rs', 'lib.rs'),
    'effectcraft': ('effectcraft_text::fonts::add_font_data(bytes).len()', 'effectcraft-text', 'lib.rs', 'app.rs'),
    'figcraft': ('figcraft_text::db().write().unwrap_or_else(|e| e.into_inner()).add_bytes(bytes).len()', 'figcraft-text', 'main.rs', 'web.rs'),
}


def add_font_bridge(src, repo):
    if repo not in FONT_BRIDGE:
        return False
    expr, crate, mods, start = FONT_BRIDGE[repo]
    web = os.path.join(src, 'apps', f'{repo}-web')
    tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'studio-fonts', 'bridge.rs'), encoding='utf-8').read()
    open(os.path.join(web, 'src', 'shootcut_fonts.rs'), 'w', encoding='utf-8').write(tpl.replace('__ADD__', expr))
    main = os.path.join(web, 'src', mods)
    m = open(main, encoding='utf-8').read()
    decl = '#[cfg(target_arch = "wasm32")]\nmod shootcut_fonts;\n'
    m2, n = re.subn(r'((?:#\[cfg\(target_arch = "wasm32"\)\]\n)?(?:pub )?mod \w+;)', lambda mm: decl + mm.group(1), m, count=1)
    if not n:
        sys.exit(f'patch-studio: no module declaration in {main}')
    open(main, 'w', encoding='utf-8').write(m2)
    w = os.path.join(web, 'src', start)
    t = open(w, encoding='utf-8').read()
    line = 'eframe::WebLogger::init(log::LevelFilter::Info).ok();'
    if line not in t:
        sys.exit(f'patch-studio: no WebLogger line in {w}')
    open(w, 'w', encoding='utf-8').write(t.replace(line, line + '\n    crate::shootcut_fonts::watch();', 1))
    cargo = os.path.join(web, 'Cargo.toml')
    c = open(cargo, encoding='utf-8').read()
    if not re.search(r'^' + re.escape(crate) + r'\s*=', c, re.M):
        # the dependency table may be the plain one or a target-specific one (wasm32 only)
        c, k = re.subn(r"^(\[(?:target\.[^\]\n]*\.)?dependencies\]\n)", lambda mm: mm.group(1) + f'{crate} = {{ workspace = true }}\n', c, count=1, flags=re.M)
        if not k:
            sys.exit(f'patch-studio: no dependencies table in {cargo}')
        open(cargo, 'w', encoding='utf-8').write(c)
    return True


SET_FONTS = re.compile(r'(?<![\w:])(\w+(?:\.\w+)*)\.set_fonts\(([^;\n]*)\);')


def add_arabic_ui(src):
    """Gives every app's interface an Arabic face: each `ctx.set_fonts(X)` becomes set_fonts(X + the Arabic face)."""
    ui = os.path.join(src, 'crates', 'ui-egui', 'src')
    lib = os.path.join(ui, 'lib.rs')
    if not os.path.isfile(lib):
        sys.exit(f'patch-studio: no ui-egui crate at {ui}')
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'studio-fonts')
    shutil.copy(os.path.join(here, 'shootcut_arabic.ttf'), os.path.join(ui, 'shootcut_arabic.ttf'))
    shutil.copy(os.path.join(here, 'shootcut_arabic.rs'), os.path.join(ui, 'shootcut_arabic.rs'))
    t = open(lib, encoding='utf-8').read()
    if 'mod shootcut_arabic;' not in t:
        m = re.search(r'^(?:pub )?mod \w+;', t, re.M)
        if not m:
            sys.exit(f'patch-studio: no module declaration in {lib}')
        t = t[:m.start()] + 'mod shootcut_arabic;\n' + t[m.start():]
        open(lib, 'w', encoding='utf-8').write(t)
    count = 0
    for d, dirs, files in os.walk(ui):
        for f in files:
            p = os.path.join(d, f)
            if not f.endswith('.rs') or f == 'shootcut_arabic.rs' or is_test_file(p):
                continue
            x = open(p, encoding='utf-8').read()
            y, n = SET_FONTS.subn(lambda m: '{ let mut __sf = %s; crate::shootcut_arabic::add(&mut __sf); %s.set_fonts(__sf); }' % (m.group(2), m.group(1)), x)
            if n:
                open(p, 'w', encoding='utf-8').write(y)
                count += n
    if not count:
        sys.exit(f'patch-studio: no set_fonts call found under {ui}')
    return count


# Arabic for what Shootcut added to pdfcraft (appended to its own catalog)
AR_ADDITIONS = {
    'pdfcraft': [
        ('Convert to fillable PDF', 'تحويل إلى PDF قابل للتعبئة'),
        ('Convert to fillable PDF (detect the fields automatically)', 'تحويل إلى PDF قابل للتعبئة (اكتشاف الحقول تلقائيًا)'),
        # panel tabs that the upstream catalog leaves in English
        ('Tools', 'الأدوات'),
        ('Inspector', 'الخصائص'),
    ],
}


def add_arabic_strings(src, repo):
    rows = AR_ADDITIONS.get(repo)
    if not rows:
        return
    p = os.path.join(src, 'crates', 'ui-egui', 'src', 'i18n', 'ar.tsv')
    if not os.path.isfile(p):
        sys.exit(f'patch-studio: no Arabic catalog at {p}')
    t = open(p, encoding='utf-8').read()
    if not t.endswith('\n'):
        t += '\n'
    for en, ar in rows:
        t += f'\t{en}\t{ar}\n'
    open(p, 'w', encoding='utf-8').write(t)



def cmd_source(src, repo):
    FAILED.clear()
    HIT.clear()
    n = m = 0
    for p in rs_files(src):
        if patch_rs(p, repo):
            n += 1
    for d, dirs, files in os.walk(src):
        dirs[:] = [x for x in dirs if x not in ('target', '.git', 'node_modules', 'dist')]
        for f in files:
            if f.endswith('.tsv') and patch_tsv(os.path.join(d, f)):
                m += 1
            elif f.endswith('.json') and '/locales' in d.replace('\\', '/') and patch_json(os.path.join(d, f)):
                m += 1
            elif f.endswith(TEXT_ASSET_EXT) and patch_text_asset(os.path.join(d, f)):
                m += 1
    c = 0
    for p in rs_files(src):
        b = os.path.basename(p)
        if b.startswith('theme') or ('/ui-egui/src/' in p.replace('\\', '/') and '/i18n' not in p and not is_test_file(p)
                                     and not re.search(r'(colors|chart|smart_art|swatch|palette|lumetri|masks|label)', b)):
            if recolor_file(p):
                c += 1
    add_font_bridge(src, repo)
    add_arabic_ui(src)
    copy_files(src, repo)
    add_ui_deps(src, repo)
    add_deck_arabic(src, repo)
    add_arabic_strings(src, repo)
    pics = replace_pictures(src)
    logos = replace_drawn_logos(src)
    missing = [(repo, i) for i in range(len(EDITS.get(repo, []))) if (repo, i) not in HIT]
    if repo in APPENDS and (repo, 'append') not in HIT:
        missing.append((repo, 'append'))
    if missing:
        sys.exit(f'patch-studio: {len(missing)} edit(s) for {repo} did not match: {missing}')
    print(f'patched {n} Rust files, {m} catalogs, {c} theme files recoloured, {pics} pictures, {logos} drawn logos')


LOADING_RE = re.compile(r'(<div id="[a-z]+_loading">)[^<]*(</div>)')


def dist_pictures(dist, here):
    """Icon pictures the build copied from the app (Trunk assets, favicons) are redrawn with Shootcut's mark."""
    try:
        from PIL import Image
    except ImportError:
        return 0
    mark = Image.open(os.path.join(here, 'brand', 'icon-512.png')).convert('RGBA')
    svg = open(os.path.join(here, 'brand', 'favicon.svg')).read()
    n = 0
    for f in os.listdir(dist):
        low = f.lower()
        if low == 'shootcut-icon.svg' or not re.search(r'(icon|favicon|storyteller|logo)', low):
            continue
        full = os.path.join(dist, f)
        if low.endswith('.png'):
            im = Image.open(full)
            w, h = im.size
            side = max(1, int(min(w, h) * 0.9))
            m = mark.resize((side, side), Image.LANCZOS)
            out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
            out.paste(m, ((w - side) // 2, (h - side) // 2), m)
            out.save(full)
            n += 1
        elif low.endswith('.svg'):
            open(full, 'w').write(svg)
            n += 1
    return n


# Reads the program's WebAssembly from a gzip copy (3-4x smaller than the raw file) and shows the download percentage in
# the page's loading text. Falls back to the raw file when the browser cannot decompress or the copy is missing.
FAST_LOADER = (
    '<script>window.__sw=function(u){var g=u.replace(/\\.wasm(\\?|$)/,".wasm.gz$1"),el=document.querySelector(\'[id$="_loading"] p\'),'
    'base=el&&el.textContent;function plain(){return fetch(u)}if(typeof DecompressionStream==="undefined")return plain();'
    'return fetch(g).then(function(r){if(!r.ok||!r.body)return plain();var t=+r.headers.get("content-length")||0,n=0,rd=r.body.getReader();'
    'var s=new ReadableStream({pull:function(c){return rd.read().then(function(x){if(x.done){c.close();return}n+=x.value.length;'
    'if(el&&t)el.textContent=base+" "+Math.min(99,Math.round(n*100/t))+"%";c.enqueue(x.value)})},cancel:function(e){return rd.cancel(e)}});'
    'return new Response(s.pipeThrough(new DecompressionStream("gzip")),{headers:{"content-type":"application/wasm"}})}).catch(plain)};</script>'
)


def speed_up(dist, h):
    """Writes <app>_bg.wasm.gz next to each raw wasm and points the page at it. The raw file stays (workers use it)."""
    import gzip
    wasms = [f for f in os.listdir(dist) if f.endswith('_bg.wasm')]
    if not wasms:
        return h
    for f in wasms:
        raw = open(os.path.join(dist, f), 'rb').read()
        with open(os.path.join(dist, f + '.gz'), 'wb') as o:
            o.write(gzip.compress(raw, 9, mtime=0))
    n0 = h
    h = re.sub(r'fetch\((["\'])(\./[\w.-]+_bg\.wasm)\1\)', r'__sw(\1\2\1)', h)
    h = re.sub(r'(module_or_path\s*:\s*)(["\'])(\./[\w.-]+_bg\.wasm)\2', r'\1__sw(\2\3\2)', h)
    h = re.sub(r'(module_or_path\s*:\s*)(new URL\((?:"|\')[\w./-]+_bg\.wasm(?:"|\')[^)]*\))', r'\1__sw(\2.href)', h)
    if re.search(r'const wasmUrl = new URL\((?:"|\')[\w./-]+_bg\.wasm', h):
        h = h.replace('fetch(wasmUrl)', '__sw(wasmUrl.href)')
    sw = os.path.join(dist, 'sw.js')
    if os.path.exists(sw):
        # the offline cache holds the small copy instead of downloading the raw file a second time
        t = open(sw, encoding='utf-8').read()
        open(sw, 'w', encoding='utf-8').write(re.sub(r'"(\./[\w.-]+_bg\.wasm)"', r'"\1.gz"', t))
    h = re.sub(r'<link[^>]*href="(\./[\w.-]+_bg\.wasm)"[^>]*>', r'<link rel="preload" href="\1.gz" as="fetch" crossorigin="anonymous">', h)
    if '__sw(' not in h:
        print('warning: the page does not load its wasm in a form this script knows; the raw file is used')
        return n0
    return h.replace('<head>', '<head>\n  ' + FAST_LOADER, 1)



# pdfcraft's page has no loading screen of its own (a bare canvas): this one carries Shootcut's mark and text, and goes
# away once the app has started. The id ends in _loading so the download percentage is written into its <p>.
PDF_LOADING = (
    '<style>#pdfcraft_loading{position:fixed;inset:0;z-index:9;display:flex;flex-direction:column;align-items:center;'
    'justify-content:center;gap:14px;background:#f1f1f3;color:#333;font:500 16px system-ui,sans-serif}'
    '#pdfcraft_loading img{width:88px;height:88px}#pdfcraft_loading p{margin:0}</style>'
    '<div id="pdfcraft_loading"><img src="./shootcut-icon.svg" alt=""><p>Loading Shootcut Program&hellip;</p></div>'
    '<script>addEventListener("TrunkApplicationStarted",function(){setTimeout(function(){var e=document.getElementById("pdfcraft_loading");'
    'if(e)e.remove()},700)})</script>'
)

def cmd_dist(dist, repo, lang=None):
    idx = os.path.join(dist, 'index.html')
    h = open(idx, encoding='utf-8').read()
    h = LOADING_RE.sub(r'\1Loading Shootcut Program&hellip;\2', h)
    h = re.sub(r'Loading [A-Za-z]*Craft(?:…|&hellip;|\.\.\.)', 'Loading Shootcut Program\u2026', h)
    h = re.sub(r'If (?:Photo|Film|Effect|Light|Design|Word|Deck|Vector|Grid|Sound|CAD|Fig)Craft doesn', 'If Shootcut Program doesn', h)
    h = re.sub(r'<title>[^<]*</title>', '<title>Shootcut</title>', h)
    h = re.sub(r'<link rel="icon"[^>]*>\s*', '', h)
    h = h.replace('<head>', '<head>\n  <link rel="icon" type="image/svg+xml" href="./shootcut-icon.svg">\n'
                  '  <script>try{var q=new URLSearchParams(location.search).get("lang");if(q){var l=[q];'
                  'Object.defineProperty(navigator,"language",{get:function(){return q}});'
                  'Object.defineProperty(navigator,"languages",{get:function(){return l}});'
                  'document.documentElement.lang=q;if(q==="ar")document.documentElement.dir="rtl"}}catch(e){}</script>\n'
                  '  <script>try{if(new URLSearchParams(location.search).has("webgl"))Object.defineProperty(navigator,"gpu",{get:function(){return undefined}})}catch(e){}</script>', 1)
    if repo == 'figcraft':
        # The browser must not take the design shortcuts (duplicate, group, find, save, print, zoom, ...): stop its default, the app still sees the key
        h = h.replace('</head>', '  <script>addEventListener("keydown",function(e){try{if((e.ctrlKey||e.metaKey)&&!e.altKey&&/^(Key[BDEFGHIJKLOPSU]|Digit[0-9]|Equal|Minus|NumpadAdd|NumpadSubtract|BracketLeft|BracketRight|Comma|Period|Slash|Quote|Backslash|Semicolon)$/.test(e.code))e.preventDefault()}catch(x){}},true)</script>\n</head>', 1)
    if repo == 'pdfcraft':
        # The browser must not take Acrobat's shortcuts (find, bookmark, address bar, page zoom, ...): stop its default, the app still sees the key
        h = h.replace('</head>', '  <script>addEventListener("keydown",function(e){try{if((e.ctrlKey||e.metaKey)&&!e.altKey&&/^(Key[BDFGHJKLOPSYZ]|Digit[0-9]|Equal|Minus|NumpadAdd|NumpadSubtract|BracketLeft|BracketRight|Comma)$/.test(e.code))e.preventDefault();else if(e.altKey&&!e.ctrlKey&&/^Arrow(Left|Right)$/.test(e.code))e.preventDefault()}catch(x){}},true)</script>\n</head>', 1)
        # always light, like the rest of Shootcut, and a Shootcut loading screen instead of a blank canvas
        h = re.sub(r'@media \(prefers-color-scheme: dark\) \{[^}]*\{[^}]*\}\s*\}', '', h)
        h = re.sub(r'(<body[^>]*>)', lambda m: m.group(1) + '\n  ' + PDF_LOADING, h, count=1)
    h = speed_up(dist, h)
    open(idx, 'w', encoding='utf-8').write(h)
    here = os.path.dirname(os.path.abspath(__file__))
    svg = os.path.join(here, 'brand', 'favicon.svg')
    if os.path.exists(svg):
        open(os.path.join(dist, 'shootcut-icon.svg'), 'w').write(open(svg).read())
    dist_pictures(dist, here)
    for f in os.listdir(dist):
        if f.endswith('.ico'):
            os.remove(os.path.join(dist, f))
    for f in ('manifest.json', 'manifest.webmanifest'):
        p = os.path.join(dist, f)
        if os.path.exists(p):
            os.remove(p)
    print('dist patched')


RESIDUE = re.compile(r'(ArtCraft|Artcraft|artcraft|storytold|[Dd]iscord|[A-Z][a-z]+Craft\b)')


def cmd_report(root):
    hits = {}
    for d, dirs, files in os.walk(root):
        for f in files:
            if f.endswith(('.html', '.js', '.wasm', '.json', '.svg', '.webmanifest')):
                data = open(os.path.join(d, f), 'rb').read().decode('latin-1')
                for m in RESIDUE.finditer(data):
                    hits[m.group(1)] = hits.get(m.group(1), 0) + 1
    print(json.dumps(hits, indent=1))


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'source':
        cmd_source(sys.argv[2], sys.argv[3])
    elif mode == 'dist':
        cmd_dist(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    elif mode == 'report':
        cmd_report(sys.argv[2])
    else:
        sys.exit(__doc__)
