import { strToU8, zipSync } from 'fflate';
import { bodyLines, layoutBoxes, slideIsRtl, type Slide, type Theme } from './model';

const EMU = 9525; // 1280×720 px = 12192000×6858000 EMU (16:9)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const hex = (c: string) => c.replace('#', '').toUpperCase();
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function dataUrlBytes(url: string): { bytes: Uint8Array; ext: 'png' | 'jpeg' } | null {
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(url);
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, ext: m[1] === 'png' ? 'png' : 'jpeg' };
}

function imageSize(b: Uint8Array, ext: 'png' | 'jpeg'): { w: number; h: number } | null {
  if (ext === 'png' && b.length > 24) return { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
  if (ext === 'jpeg') {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + len;
    }
  }
  return null;
}

function textBox(id: number, name: string, box: { x: number; y: number; w: number; h: number }, paras: string[], o: { size: number; bold?: boolean; color: string; rtl: boolean; align: 'l' | 'ctr' | 'r'; bullets?: boolean; accent: string; anchor?: 'ctr' | 't' }): string {
  const ps = paras
    .map((t) => {
      const algn = o.align === 'ctr' ? 'ctr' : o.rtl ? 'r' : 'l';
      const bu = o.bullets ? `<a:buClr><a:srgbClr val="${hex(o.accent)}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>` : '<a:buNone/>';
      const ind = o.bullets ? ' marL="342900" indent="-342900"' : '';
      const lat = '<a:latin typeface="Calibri"/><a:cs typeface="Arial"/>';
      const lang = o.rtl ? ' lang="ar-SA"' : ' lang="en-US"';
      return `<a:p><a:pPr algn="${algn}" rtl="${o.rtl ? 1 : 0}"${ind}>${bu}</a:pPr><a:r><a:rPr${lang} sz="${Math.round(o.size * 100)}" b="${o.bold ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${hex(o.color)}"/></a:solidFill>${lat}</a:rPr><a:t>${esc(t)}</a:t></a:r></a:p>`;
    })
    .join('');
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${box.x * EMU}" y="${box.y * EMU}"/><a:ext cx="${box.w * EMU}" cy="${box.h * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="${o.anchor ?? 't'}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${ps || '<a:p><a:endParaRPr lang="en-US"/></a:p>'}</p:txBody></p:sp>`;
}

function rect(id: number, name: string, x: number, y: number, w: number, h: number, color: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x * EMU}" y="${y * EMU}"/><a:ext cx="${w * EMU}" cy="${h * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
}

/** A .pptx file (16:9) with real, editable text boxes, the picture and the theme colours. */
export function toPptx(slides: Slide[], theme: Theme): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const add = (p: string, s: string) => (files[p] = strToU8(s));
  const media: string[] = [];
  const slideRels: string[] = [];

  slides.forEach((slide, i) => {
    const rtl = slideIsRtl(slide);
    const boxes = layoutBoxes(slide.layout);
    const centered = slide.layout === 'title';
    let shapes = '';
    let id = 2;
    shapes += centered ? rect(id++, 'Accent', 560, 196, 120, 8, theme.accent) : rect(id++, 'Accent', rtl ? 1244 : 0, 0, 36, 720, theme.accent);
    if (slide.title) shapes += textBox(id++, 'Title', boxes.title, [slide.title], { size: centered ? 54 : 39, bold: true, color: theme.fg, rtl, align: centered ? 'ctr' : 'l', accent: theme.accent, anchor: centered ? 'ctr' : 't' });
    if (slide.body) {
      const bullets = slide.layout === 'bullets';
      const paras = bullets ? bodyLines(slide.body) : slide.body.split(/\r?\n/);
      shapes += textBox(id++, 'Body', boxes.body, paras, { size: slide.layout === 'image' ? 21 : 26, color: slide.layout === 'title' ? theme.muted : theme.fg, rtl, align: centered ? 'ctr' : 'l', bullets, accent: theme.accent });
    }
    let rels = '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>';
    const pic = slide.layout === 'image' && slide.image ? dataUrlBytes(slide.image) : null;
    if (pic && boxes.image) {
      const n = media.length + 1;
      const name = `image${n}.${pic.ext === 'png' ? 'png' : 'jpeg'}`;
      files[`ppt/media/${name}`] = pic.bytes;
      media.push(pic.ext);
      rels += `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${name}"/>`;
      const b = boxes.image;
      const size = imageSize(pic.bytes, pic.ext) ?? { w: b.w, h: b.h };
      const k = Math.min(b.w / size.w, b.h / size.h);
      const w = Math.round(size.w * k);
      const h = Math.round(size.h * k);
      shapes += `<p:pic><p:nvPicPr><p:cNvPr id="${id++}" name="Picture"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${Math.round(b.x + (b.w - w) / 2) * EMU}" y="${Math.round(b.y + (b.h - h) / 2) * EMU}"/><a:ext cx="${w * EMU}" cy="${h * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
    }
    add(
      `ppt/slides/slide${i + 1}.xml`,
      `${HEAD}<p:sld ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex(theme.bg)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    );
    add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
    slideRels.push(`<Relationship Id="rId${i + 10}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`);
  });

  const hasPng = media.includes('png');
  const hasJpeg = media.includes('jpeg');
  add(
    '[Content_Types].xml',
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${hasPng ? '<Default Extension="png" ContentType="image/png"/>' : ''}${hasJpeg ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : ''}<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`,
  );
  add('_rels/.rels', `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  add(
    'ppt/presentation.xml',
    `${HEAD}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 10}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
  );
  add(
    'ppt/_rels/presentation.xml.rels',
    `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>${slideRels.join('')}</Relationships>`,
  );
  const emptyTree = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
  add(
    'ppt/slideMasters/slideMaster1.xml',
    `${HEAD}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex(theme.bg)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>${emptyTree}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`,
  );
  add(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
  );
  add('ppt/slideLayouts/slideLayout1.xml', `${HEAD}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${emptyTree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  add(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
  );
  const clr = (n: string, v: string) => `<a:${n}><a:srgbClr val="${hex(v)}"/></a:${n}>`;
  add(
    'ppt/theme/theme1.xml',
    `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Shootcut"><a:themeElements><a:clrScheme name="Shootcut">${clr('dk1', theme.fg)}${clr('lt1', theme.bg)}${clr('dk2', theme.muted)}${clr('lt2', theme.bg)}${clr('accent1', theme.accent)}${clr('accent2', theme.muted)}${clr('accent3', theme.accent)}${clr('accent4', theme.muted)}${clr('accent5', theme.accent)}${clr('accent6', theme.muted)}${clr('hlink', theme.accent)}${clr('folHlink', theme.muted)}</a:clrScheme><a:fontScheme name="Shootcut"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Shootcut"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
  );
  return zipSync(files);
}
