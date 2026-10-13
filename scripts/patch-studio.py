#!/usr/bin/env python3
"""Gives an upstream app Shootcut's identity before it is compiled.

  usage: scripts/patch-studio.py source <source-dir> <repo>     (before the build: Rust sources + catalogs)
         scripts/patch-studio.py dist   <dist-dir>  <repo> [lang]  (after the build: loading page, icon, title)
         scripts/patch-studio.py report <dir>                    (lists what is left of the old identity)

Only text the person can see is touched: string literals in Rust, the translation catalogs and the web page.
Identifiers, file extensions and saved-file magic keep their names, so nothing is lost. The licence files stay
in the build (MIT / Apache-2.0 require it) and are listed on Shootcut's "open-source notices" page.
"""
import json, os, re, sys

PRODUCT = {
    'Word': 'Docs', 'Grid': 'Sheets', 'Deck': 'Slides', 'Photo': 'Photo', 'Light': 'Light', 'Vector': 'Vector',
    'Design': 'Design', 'Film': 'Film', 'Effect': 'Effects', 'Sound': 'Sound', 'CAD': 'CAD', 'Cad': 'CAD', 'PDF': 'PDF',
}
NAME_RE = re.compile(r'(?:(?<=\\n)|\b)(Word|Grid|Deck|Photo|Light|Vector|Design|Film|Effect|Sound|CAD|Cad|PDF)[Cc]raft(?![A-Za-z_])')
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
    ],
    'wordcraft': [
        # Arabic: the craft-fonts Arabic face is a document font too (it was only the interface's), so Arabic text has glyphs
        ('fonts/src/fontdb.rs', r'\.chain\(crate::chinese_fonts\(\)\)\.map\(\|f\| f\.bytes\);', '.chain(crate::chinese_fonts()).chain(crate::CRAFT_FONTS.iter().filter(|f| f.scripts.contains(&"Arab"))).map(|f| f.bytes);'),
        ('fonts/build.rs', r'if wasm && !\(\*family == "BIZ UDPGothic" && \*style == "Regular"\) \{', 'if wasm && !(*family == "BIZ UDPGothic" && *style == "Regular") && !scripts.split(\',\').any(|s| s.trim() == "Arab") {'),
        ('src/backstage.rs', r',\s*\("Discord community", "discord"\)', ''),
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
    'filmcraft': [
        ('text/build.rs', r'if wasm && !\(\*family == "BIZ UDPGothic" && \*style == "Regular"\) \{', 'if wasm && !(*family == "BIZ UDPGothic" && *style == "Regular") && !scripts.split(\',\').any(|s| s.trim() == "Arab") {'),
        ('src/links.rs', r'ALL: \[\(&str, &str, &str\); 5\]', 'ALL: [(&str, &str, &str); 1]'),
        ('src/header.rs', r'let label = "Discord";\n.*?ui\.painter\(\)\.galley\(pos2\(r\.min\.x \+ 25\.0, [^\n]*\n',
         'let r = Rect::from_min_size(pos2(wr.min.x - 14.0, rect.center().y - 12.0), vec2(0.0, 24.0));\n'),
        ('src/header.rs', r'\n\s*if resp\.clicked\(\) \{\n\s*crate::links::open\(app, ui\.ctx\(\), crate::links::DISCORD\);\n\s*\}', ''),
        ('panels/import_mode.rs', r'tl!\("Community"\)', 'tl!("Shootcut")'),
        ('panels/import_mode.rs', r'crate::links::ALL\.iter\(\)\.take\(4\)', 'crate::links::ALL.iter().take(0)'),
    ],
    'effectcraft': [
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
            if '/assets/icons/' in rel or not ('/docs/brand/' in rel or '/app-icon' in rel or 'artcraft' in low):
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
FONT_BRIDGE = {
    'designcraft': ('designcraft_fonts::FontDb::global().add_font(bytes)', 'designcraft-fonts'),
    'wordcraft': ('wordcraft_fonts::FontDb::global().add_font(bytes)', 'wordcraft-fonts'),
    'deckcraft': ('deckcraft_fonts::FontDb::global().add_font(bytes)', 'deckcraft-fonts'),
    'vectorcraft': ('vectorcraft_text::FontDb::global().add_font(bytes)', 'vectorcraft-text'),
}


def add_font_bridge(src, repo):
    if repo not in FONT_BRIDGE:
        return False
    expr, crate = FONT_BRIDGE[repo]
    web = os.path.join(src, 'apps', f'{repo}-web')
    tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'studio-fonts', 'bridge.rs'), encoding='utf-8').read()
    open(os.path.join(web, 'src', 'shootcut_fonts.rs'), 'w', encoding='utf-8').write(tpl.replace('__ADD__', expr))
    main = os.path.join(web, 'src', 'main.rs')
    m = open(main, encoding='utf-8').read()
    m2, n = re.subn(r'(#\[cfg\(target_arch = "wasm32"\)\]\nmod web;)', '#[cfg(target_arch = "wasm32")]\nmod shootcut_fonts;\n\\1', m, count=1)
    if not n:
        sys.exit(f'patch-studio: no `mod web;` in {main}')
    open(main, 'w', encoding='utf-8').write(m2)
    w = os.path.join(web, 'src', 'web.rs')
    t = open(w, encoding='utf-8').read()
    start = 'eframe::WebLogger::init(log::LevelFilter::Info).ok();'
    if start not in t:
        sys.exit(f'patch-studio: no WebLogger line in {w}')
    open(w, 'w', encoding='utf-8').write(t.replace(start, start + '\n    crate::shootcut_fonts::watch();', 1))
    cargo = os.path.join(web, 'Cargo.toml')
    c = open(cargo, encoding='utf-8').read()
    dep = crate + ' = '
    if not re.search(r'^' + re.escape(crate) + r'\s*=', c, re.M):
        c = c.replace('[dependencies]\n', f'[dependencies]\n{crate} = {{ workspace = true }}\n', 1)
        open(cargo, 'w', encoding='utf-8').write(c)
    return True


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
    c = 0
    for p in rs_files(src):
        b = os.path.basename(p)
        if b.startswith('theme') or ('/ui-egui/src/' in p.replace('\\', '/') and '/i18n' not in p and not is_test_file(p)
                                     and not re.search(r'(colors|chart|smart_art|swatch|palette|lumetri|masks|label)', b)):
            if recolor_file(p):
                c += 1
    add_font_bridge(src, repo)
    pics = replace_pictures(src)
    logos = replace_drawn_logos(src)
    missing = [(repo, i) for i in range(len(EDITS.get(repo, []))) if (repo, i) not in HIT]
    if repo in APPENDS and (repo, 'append') not in HIT:
        missing.append((repo, 'append'))
    if missing:
        sys.exit(f'patch-studio: {len(missing)} edit(s) for {repo} did not match: {missing}')
    print(f'patched {n} Rust files, {m} catalogs, {c} theme files recoloured, {pics} pictures, {logos} drawn logos')


LOADING_RE = re.compile(r'(<div id="[a-z]+_loading">)[^<]*(</div>)')


def cmd_dist(dist, repo, lang=None):
    idx = os.path.join(dist, 'index.html')
    h = open(idx, encoding='utf-8').read()
    h = LOADING_RE.sub(r'\1Loading Shootcut Program&hellip;\2', h)
    h = re.sub(r'<title>[^<]*</title>', '<title>Shootcut</title>', h)
    h = re.sub(r'<link rel="icon"[^>]*>\s*', '', h)
    h = h.replace('<head>', '<head>\n  <link rel="icon" type="image/svg+xml" href="./shootcut-icon.svg">\n'
                  '  <script>try{var q=new URLSearchParams(location.search).get("lang");if(q){var l=[q];'
                  'Object.defineProperty(navigator,"language",{get:function(){return q}});'
                  'Object.defineProperty(navigator,"languages",{get:function(){return l}});'
                  'document.documentElement.lang=q;if(q==="ar")document.documentElement.dir="rtl"}}catch(e){}</script>', 1)
    open(idx, 'w', encoding='utf-8').write(h)
    here = os.path.dirname(os.path.abspath(__file__))
    svg = os.path.join(here, 'brand', 'favicon.svg')
    if os.path.exists(svg):
        open(os.path.join(dist, 'shootcut-icon.svg'), 'w').write(open(svg).read())
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
