import {
  Combine,
  Columns2,
  BookOpen,
  EyeOff,
  FileOutput,
  FileImage,
  FilePlus2,
  LayoutGrid,
  Lock,
  MessageSquare,
  Minimize2,
  PenLine,
  Printer,
  ScanSearch,
  Ruler,
  Share2,
  ScanText,
  Stamp,
  TextCursorInput,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  ImageDown,
  Scaling,
  Crop,
  RotateCw,
  SlidersHorizontal,
  Repeat2,
  Droplets,
  Smile,
  Eraser,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import type { Key } from '../i18n';

export type SectionId = 'pdf' | 'image' | 'video';
export type GroupId = 'view' | 'create' | 'forms' | 'review' | 'protect' | 'imgOptimize' | 'imgEdit' | 'imgConvert' | 'imgCreate' | 'imgPrivacy';

/** The three parts of the site, chosen first on the home page. */
export const SECTIONS: { id: SectionId; title: Key; desc: Key; icon: LucideIcon }[] = [
  { id: 'pdf', title: 'sectionPdf', desc: 'sectionPdfDesc', icon: FileText },
  { id: 'image', title: 'sectionImage', desc: 'sectionImageDesc', icon: ImageIcon },
  { id: 'video', title: 'sectionVideo', desc: 'sectionVideoDesc', icon: VideoIcon },
];

export interface ToolDef {
  id: string;
  group: GroupId;
  icon: LucideIcon;
  name: Key;
  desc: Key;
  status: 'ready' | 'soon';
}

export const GROUPS: { id: GroupId; title: Key; section: SectionId }[] = [
  { id: 'view', title: 'groupView', section: 'pdf' },
  { id: 'create', title: 'groupCreate', section: 'pdf' },
  { id: 'forms', title: 'groupForms', section: 'pdf' },
  { id: 'review', title: 'groupReview', section: 'pdf' },
  { id: 'protect', title: 'groupProtect', section: 'pdf' },
  { id: 'imgOptimize', title: 'groupImgOptimize', section: 'image' },
  { id: 'imgEdit', title: 'groupImgEdit', section: 'image' },
  { id: 'imgConvert', title: 'groupImgConvert', section: 'image' },
  { id: 'imgCreate', title: 'groupImgCreate', section: 'image' },
  { id: 'imgPrivacy', title: 'groupImgPrivacy', section: 'image' },
];

export function sectionOfGroup(g: GroupId): SectionId {
  return GROUPS.find((x) => x.id === g)!.section;
}

/** The section a route belongs to: a tool's section, or a section page itself. */
export function sectionOfRoute(route: string): SectionId | null {
  if (route === 'pdf' || route === 'image' || route === 'video') return route;
  const tool = TOOLS.find((t) => t.id === route);
  return tool ? sectionOfGroup(tool.group) : null;
}

export const TOOLS: ToolDef[] = [
  { id: 'inspect', group: 'view', icon: ScanSearch, name: 'toolInspect', desc: 'toolInspectDesc', status: 'ready' },
  { id: 'viewer', group: 'view', icon: BookOpen, name: 'toolViewer', desc: 'toolViewerDesc', status: 'ready' },
  { id: 'print', group: 'view', icon: Printer, name: 'toolPrint', desc: 'toolPrintDesc', status: 'ready' },
  { id: 'share', group: 'view', icon: Share2, name: 'toolShare', desc: 'toolShareDesc', status: 'ready' },
  { id: 'create', group: 'create', icon: FilePlus2, name: 'toolCreate', desc: 'toolCreateDesc', status: 'ready' },
  { id: 'merge', group: 'create', icon: Combine, name: 'toolMerge', desc: 'toolMergeDesc', status: 'ready' },
  { id: 'organize', group: 'create', icon: LayoutGrid, name: 'toolOrganize', desc: 'toolOrganizeDesc', status: 'ready' },
  { id: 'export', group: 'create', icon: FileImage, name: 'toolExport', desc: 'toolExportDesc', status: 'ready' },
  { id: 'convert', group: 'create', icon: FileOutput, name: 'toolConvert', desc: 'toolConvertDesc', status: 'ready' },
  { id: 'ocr', group: 'create', icon: ScanText, name: 'toolOcr', desc: 'toolOcrDesc', status: 'ready' },
  { id: 'fill-sign', group: 'review', icon: PenLine, name: 'toolFillSign', desc: 'toolFillSignDesc', status: 'ready' },
  { id: 'form', group: 'forms', icon: TextCursorInput, name: 'toolForm', desc: 'toolFormDesc', status: 'ready' },
  { id: 'comment', group: 'review', icon: MessageSquare, name: 'toolComment', desc: 'toolCommentDesc', status: 'ready' },
  { id: 'stamp', group: 'review', icon: Stamp, name: 'toolStamp', desc: 'toolStampDesc', status: 'ready' },
  { id: 'compare', group: 'review', icon: Columns2, name: 'toolCompare', desc: 'toolCompareDesc', status: 'ready' },
  { id: 'measure', group: 'review', icon: Ruler, name: 'toolMeasure', desc: 'toolMeasureDesc', status: 'ready' },
  { id: 'protect', group: 'protect', icon: Lock, name: 'toolProtect', desc: 'toolProtectDesc', status: 'ready' },
  { id: 'redact', group: 'protect', icon: EyeOff, name: 'toolRedact', desc: 'toolRedactDesc', status: 'ready' },
  { id: 'optimize', group: 'protect', icon: Minimize2, name: 'toolOptimize', desc: 'toolOptimizeDesc', status: 'ready' },
  { id: 'img-compress', group: 'imgOptimize', icon: ImageDown, name: 'toolImgCompress', desc: 'toolImgCompressDesc', status: 'ready' },
  { id: 'img-resize', group: 'imgOptimize', icon: Scaling, name: 'toolImgResize', desc: 'toolImgResizeDesc', status: 'ready' },
  { id: 'img-crop', group: 'imgEdit', icon: Crop, name: 'toolImgCrop', desc: 'toolImgCropDesc', status: 'ready' },
  { id: 'img-rotate', group: 'imgEdit', icon: RotateCw, name: 'toolImgRotate', desc: 'toolImgRotateDesc', status: 'ready' },
  { id: 'img-adjust', group: 'imgEdit', icon: SlidersHorizontal, name: 'toolImgAdjust', desc: 'toolImgAdjustDesc', status: 'ready' },
  { id: 'img-transparent', group: 'imgEdit', icon: Eraser, name: 'toolImgTransparent', desc: 'toolImgTransparentDesc', status: 'ready' },
  { id: 'img-convert', group: 'imgConvert', icon: Repeat2, name: 'toolImgConvert', desc: 'toolImgConvertDesc', status: 'ready' },
  { id: 'img-social', group: 'imgCreate', icon: Smartphone, name: 'toolImgSocial', desc: 'toolImgSocialDesc', status: 'ready' },
  { id: 'img-meme', group: 'imgCreate', icon: Smile, name: 'toolImgMeme', desc: 'toolImgMemeDesc', status: 'ready' },
  { id: 'img-watermark', group: 'imgPrivacy', icon: Droplets, name: 'toolImgWatermark', desc: 'toolImgWatermarkDesc', status: 'ready' },
  { id: 'img-blur', group: 'imgPrivacy', icon: EyeOff, name: 'toolImgBlur', desc: 'toolImgBlurDesc', status: 'ready' },
];

export function findTool(id: string): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id);
}
