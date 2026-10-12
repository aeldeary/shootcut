/**
 * What the site can do, written for the person using it. This is the single list behind the "Features" page.
 *
 * KEEP IT CURRENT: whenever a feature is added, changed or removed, update this file in the same change
 * (see CLAUDE.md). A test fails if a tool has no entry here.
 */
export interface Text {
  en: string;
  ar: string;
}

/** a tool id (see lib/tools.ts) -> what it can do, one line each */
export const TOOL_FEATURES: Record<string, Text[]> = {
  'img-compress': [
    { en: 'Make many pictures lighter at once, and see how much smaller each one became', ar: 'اجعل عدة صور أخفّ حجماً دفعة واحدة، وشاهد مقدار ما صغُر حجم كل صورة' },
    { en: 'Choose JPG or WebP and the quality, and optionally limit the longest side', ar: 'اختر JPG أو WebP والجودة، ويمكنك تحديد أطول ضلع' },
    { en: 'Saving again also removes camera data such as the place a photo was taken', ar: 'يزيل الحفظ مجدداً بيانات الكاميرا، كمكان التقاط الصورة' },
  ],
  'img-resize': [
    { en: 'Change the size by pixels (keeping the proportions if you like) or by percent, for many pictures at once', ar: 'غيّر المقاس بالبكسل (مع الحفاظ على النسب إن شئت) أو بالنسبة المئوية، لعدة صور معاً' },
    { en: 'Enlarging only smooths the picture; it does not add detail', ar: 'التكبير ينعّم الصورة فقط ولا يضيف تفاصيل' },
  ],
  'img-crop': [
    { en: 'Drag on the picture to choose the part to keep, free or with a fixed shape (1:1, 4:3, 3:4, 16:9, 9:16)', ar: 'اسحب على الصورة لاختيار الجزء المراد الاحتفاظ به، بشكل حر أو بنسبة ثابتة (1:1 و4:3 و3:4 و16:9 و9:16)' },
  ],
  'img-rotate': [
    { en: 'Rotate left or right, and mirror, many pictures at once, with a live preview', ar: 'دوّر لليمين أو لليسار واقلب الصور كالمرآة، لعدة صور معاً، مع معاينة مباشرة' },
  ],
  'img-adjust': [
    { en: 'Brightness, contrast, saturation, grey, sepia, blur and invert, with a live preview', ar: 'السطوع والتباين والتشبّع والرمادي والبني القديم والضبابية وعكس الألوان، مع معاينة مباشرة' },
    { en: 'Apply the same look to many pictures at once', ar: 'طبّق المظهر نفسه على عدة صور دفعة واحدة' },
  ],
  'img-transparent': [
    { en: 'Make one colour, such as a white background, see-through and save a PNG', ar: 'اجعل لوناً واحداً، كالخلفية البيضاء، شفافاً واحفظ صورة PNG' },
    { en: 'It removes one colour everywhere; it is not an automatic cut-out of a person or object', ar: 'يزيل لوناً واحداً من الصورة كلها؛ وليس قصّاً تلقائياً لشخص أو جسم' },
  ],
  'img-convert': [
    { en: 'Convert pictures to JPG, PNG or WebP, many at once, from almost any picture your browser can open', ar: 'حوّل الصور إلى JPG أو PNG أو WebP، عدة صور معاً، من أي صورة يستطيع متصفحك فتحها تقريباً' },
  ],
  'img-social': [
    { en: 'Ready sizes for Instagram, stories and reels, Facebook, X, LinkedIn and YouTube', ar: 'مقاسات جاهزة لإنستغرام والستوري والريلز وفيسبوك وإكس ولينكدإن ويوتيوب' },
    { en: 'Fill the whole size by cropping the edges, or fit the whole picture with coloured bars, with a live preview', ar: 'املأ المقاس كله بقصّ الأطراف، أو أظهر الصورة كاملة مع أشرطة ملونة، مع معاينة مباشرة' },
  ],
  'img-meme': [
    { en: 'Add text above and below a picture, in Arabic or English, and choose its size and colour', ar: 'أضف نصاً أعلى الصورة وأسفلها، بالعربية أو الإنجليزية، واختر حجمه ولونه' },
  ],
  'img-watermark': [
    { en: 'Stamp text or your logo on many pictures at once, with a live preview', ar: 'ضع نصاً أو شعارك على عدة صور دفعة واحدة، مع معاينة مباشرة' },
    { en: 'Choose the place, size, opacity and rotation, or repeat it across the picture', ar: 'اختر المكان والحجم والشفافية والدوران، أو كرّرها على الصورة كلها' },
  ],
  'img-blur': [
    { en: 'Drag over faces, number plates or private details to hide them with blur, pixels or a black box', ar: 'اسحب فوق الوجوه أو لوحات السيارات أو التفاصيل الخاصة لإخفائها بالتمويه أو المربعات أو مربع أسود' },
    { en: 'You mark the areas yourself; nothing is detected automatically', ar: 'تحدد المناطق بنفسك؛ لا يُكتشف شيء تلقائياً' },
  ],
  inspect: [
    { en: 'See how many pages the file has, its paper size, whether the pages hold real text or are scans, and how many form fields it has', ar: 'اعرف عدد الصفحات ومقاس الورق، وهل الصفحات نص حقيقي أم صور ممسوحة، وعدد حقول التعبئة في الملف' },
    { en: 'Read the title, author and dates', ar: 'اطّلع على العنوان والمؤلف والتواريخ' },
    { en: 'Scroll through every page in one continuous view, comfortable on a phone', ar: 'تصفّح كل الصفحات بالتمرير في عرض واحد متواصل، مريح على الهاتف' },
    { en: 'Open the same file in another tool with one tap', ar: 'افتح الملف نفسه في أداة أخرى بنقرة واحدة' },
  ],
  viewer: [
    { en: 'Read one page, two pages or continuous scrolling; fit the width or the whole page, zoom and rotate the view', ar: 'اقرأ صفحة واحدة أو صفحتين أو بتمرير متواصل، مع ملاءمة العرض أو الصفحة كاملة، والتكبير وتدوير العرض' },
    { en: 'Search the text (Arabic-friendly), with every match highlighted and a list of the pages that have it', ar: 'ابحث في النص (يدعم العربية) مع تظليل كل نتيجة وقائمة بالصفحات التي تحتوي نتائج' },
    { en: 'Reading mode and full screen', ar: 'وضع القراءة وملء الشاشة' },
    { en: 'Read the text out loud', ar: 'قراءة النص بصوت عالٍ' },
    { en: 'See and change the title, author, subject and keywords, and save a copy', ar: 'اطّلع على العنوان والمؤلف والموضوع والكلمات المفتاحية وعدّلها، ثم احفظ نسخة' },
  ],
  print: [
    { en: 'Print in colour, grey or black and white', ar: 'اطبع بالألوان أو بالرمادي أو بالأبيض والأسود' },
    { en: 'Pick the pages to print and the quality (150, 200 or 300 dpi)', ar: 'اختر الصفحات المراد طباعتها والجودة (150 أو 200 أو 300 dpi)' },
    { en: 'Works with any printer, because the pages are drawn here before printing', ar: 'يعمل مع أي طابعة، لأن الصفحات تُجهَّز هنا قبل الطباعة' },
  ],
  share: [
    { en: 'Send the file with the share sheet of your phone or computer (WhatsApp, Mail and others)', ar: 'أرسل الملف من قائمة المشاركة في جهازك (واتساب والبريد وغيرهما)' },
    { en: 'Message links for WhatsApp, Telegram and email, and a link to the site', ar: 'روابط رسائل لواتساب وتيليغرام والبريد الإلكتروني، ورابط الموقع' },
  ],
  create: [
    { en: 'Turn pictures and typed text (Arabic and English) into one PDF', ar: 'حوّل الصور والنصوص المكتوبة (بالعربية والإنجليزية) إلى ملف PDF واحد' },
    { en: 'Choose the page size, orientation and font size', ar: 'اختر مقاس الصفحة واتجاهها وحجم الخط' },
  ],
  merge: [
    { en: 'Join several PDFs into one', ar: 'ادمج عدة ملفات PDF في ملف واحد' },
    { en: 'Put them in order by dragging or with the arrow buttons, and remove the ones you do not want', ar: 'رتّبها بالسحب أو بأزرار الأسهم، واحذف ما لا تريده' },
  ],
  organize: [
    { en: 'Reorder, rotate and delete pages while looking at their thumbnails', ar: 'أعد ترتيب الصفحات وأدرها واحذف منها وأنت ترى صورها المصغّرة' },
    { en: 'Move pages with the buttons on a touch screen, or drag them on a computer', ar: 'انقل الصفحات بالأزرار على شاشة اللمس، أو اسحبها على الحاسوب' },
    { en: 'Save only the pages you kept as a new file', ar: 'احفظ الصفحات التي أبقيتها فقط في ملف جديد' },
  ],
  export: [
    { en: 'Save every page as a PNG or JPG picture', ar: 'احفظ كل صفحة صورة بصيغة PNG أو JPG' },
    { en: 'Choose the quality from 72 to 300 dpi, and get all the pictures in one ZIP', ar: 'اختر الجودة من 72 إلى 300 dpi، واحصل على كل الصور في ملف ZIP واحد' },
  ],
  convert: [
    { en: 'Save the text as Word, Excel, PowerPoint, plain text, RTF, HTML or XML', ar: 'احفظ النص بصيغة Word أو Excel أو PowerPoint أو نص عادي أو RTF أو HTML أو XML' },
    { en: 'Excel keeps table columns; PowerPoint holds the pages as pictures', ar: 'يحافظ Excel على أعمدة الجداول، ويضع PowerPoint الصفحات على هيئة صور' },
  ],
  ocr: [
    { en: 'Read the text of scanned pages and photos, in Arabic and English', ar: 'استخرج النص من الصفحات الممسوحة والصور، بالعربية والإنجليزية' },
    { en: 'Get a searchable PDF, or the text as a file', ar: 'احصل على ملف PDF قابل للبحث، أو على النص في ملف' },
    { en: 'Poster mode for big titles and photos, and an area mode to read only a part of a page', ar: 'وضع الملصقات للعناوين الكبيرة والصور، ووضع المنطقة لقراءة جزء من الصفحة فقط' },
  ],
  'fill-sign': [
    { en: 'Fill in forms: type text, add check marks', ar: 'املأ النماذج: اكتب النصوص وأضف علامات الصح' },
    { en: 'Add your signature by drawing it, typing it or using a picture, then move and resize it', ar: 'أضف توقيعك رسماً أو كتابةً أو بصورة، ثم حرّكه وغيّر حجمه' },
    { en: 'The signature is visual; it is not a certificate-based digital signature', ar: 'التوقيع مرئي وليس توقيعاً رقمياً بشهادة' },
  ],
  form: [
    { en: 'The tool first examines the file and suggests fields: empty table cells, dotted or underscore blanks, ruled lines, tick boxes and labels that end with a colon. Add them all, one page at a time, or one by one', ar: 'تفحص الأداة الملف أولاً وتقترح الحقول: خانات الجداول الفارغة، والفراغات المنقطة أو المسطّرة، والأسطر، ومربعات الاختيار، والعناوين المنتهية بنقطتين رأسيتين. أضفها كلها، أو صفحةً صفحةً، أو واحداً واحداً' },
    { en: 'Or draw each field yourself: pick the type and drag a rectangle on the page', ar: 'أو ارسم كل حقل بنفسك: اختر النوع ثم اسحب مستطيلاً على الصفحة' },
    { en: 'Add fields people can fill in: text, multi-line text, check box, radio button, drop-down and list', ar: 'أضف حقولاً قابلة للتعبئة: نص، ونص متعدد الأسطر، ومربع اختيار، وزر اختيار، وقائمة منسدلة، وقائمة' },
    { en: 'Move and resize each box with its handles, the arrow keys, or exact width and height', ar: 'حرّك كل مربع وغيّر مقاسه بالمقابض أو بمفاتيح الأسهم أو بعرض وطول دقيقين' },
  ],
  comment: [
    { en: 'Highlight, underline and strike out text, and add sticky notes, as real PDF annotations', ar: 'ظلّل النصوص وضع تحتها خطاً واشطبها وأضف ملاحظات، على هيئة تعليقات PDF حقيقية' },
    { en: 'Drag over text to select it like in a reader, or use a free area for pictures', ar: 'اسحب على النص لتحديده كما في أي قارئ، أو استخدم المنطقة الحرة للصور' },
  ],
  stamp: [
    { en: 'Add text or picture stamps, and watermarks', ar: 'أضف أختاماً نصية أو بالصور وعلامات مائية' },
    { en: 'Put the stamp anywhere: click or drag on the preview, or type exact percentages. Nine quick spots and tiling are still there', ar: 'ضع الختم في أي مكان: انقر أو اسحب على المعاينة، أو اكتب النسبة المئوية بدقة. وتبقى الأماكن التسعة السريعة والتكرار متاحة' },
    { en: 'Number the pages', ar: 'رقّم الصفحات' },
    { en: 'See the result before saving', ar: 'شاهد النتيجة قبل الحفظ' },
  ],
  compare: [
    { en: 'Compare an old and a new version of a file', ar: 'قارن بين نسخة قديمة ونسخة جديدة من الملف' },
    { en: 'See the text that changed, and the visual differences page by page', ar: 'اطّلع على النصوص التي تغيّرت والفروق المرئية صفحةً بصفحة' },
  ],
  measure: [
    { en: 'Measure distances and areas on a page after setting the scale from a known length', ar: 'قِس المسافات والمساحات على الصفحة بعد ضبط المقياس من طول معروف' },
  ],
  protect: [
    { en: 'Lock a PDF with a password (AES-256 encryption)', ar: 'احمِ ملف PDF بكلمة مرور (تشفير AES-256)' },
    { en: 'Remove the password from a file whose password you know', ar: 'أزل كلمة المرور من ملف تعرفها' },
  ],
  redact: [
    { en: 'Remove sensitive content for good: search for it or draw boxes over it', ar: 'احذف المحتوى الحساس نهائياً: ابحث عنه أو ارسم مربعات فوقه' },
    { en: 'The affected pages are turned into pictures, so the hidden text is really gone', ar: 'تتحول الصفحات المتأثرة إلى صور، فيُحذف النص المخفي فعلياً' },
  ],
  optimize: [
    { en: 'Make the file smaller: light (no quality loss), balanced or strong', ar: 'قلّل حجم الملف: خفيف (دون فقدان في الجودة) أو متوازن أو قوي' },
    { en: 'Flatten the file', ar: 'تسطيح الملف' },
  ],
};

/** things that work across the whole site */
export const GENERAL_FEATURES: { title: Text; text: Text }[] = [
  { title: { en: 'Private by design', ar: 'خصوصية كاملة' }, text: { en: 'Everything runs in your browser. Your files are never uploaded and the site makes no requests to other companies.', ar: 'يعمل كل شيء داخل المتصفح. لا تُرفع ملفاتك إلى أي مكان، ولا يتواصل الموقع مع أي شركة أخرى.' } },
  { title: { en: 'Arabic and English', ar: 'عربي وإنجليزي' }, text: { en: 'The whole interface switches between Arabic (right to left) and English (left to right).', ar: 'تتبدل الواجهة كلها بين العربية (من اليمين إلى اليسار) والإنجليزية (من اليسار إلى اليمين).' } },
  { title: { en: 'Your file follows you', ar: 'ملفك يرافقك' }, text: { en: 'The PDF you open stays on this device, so another tool or another browser tab opens it without a new upload. You can delete it, or switch the keeping off, under the file name.', ar: 'يبقى ملف PDF الذي تفتحه على جهازك، فتفتحه أي أداة أو تبويب آخر دون رفع جديد. يمكنك حذفه أو إيقاف الحفظ من أسفل اسم الملف.' } },
  { title: { en: 'Switch tools from anywhere', ar: 'تنقّل بين الأدوات من أي مكان' }, text: { en: 'The bar under the header lists the tools by group, on every page.', ar: 'يعرض الشريط الواقع أسفل الترويسة الأدوات حسب المجموعة، في جميع الصفحات.' } },
  { title: { en: 'Undo and redo', ar: 'التراجع والإعادة' }, text: { en: 'Every tool has undo and redo buttons at the top, and Ctrl+Z and Ctrl+Y work too.', ar: 'في كل أداة زرّا تراجع وإعادة في الأعلى، ويعمل أيضاً Ctrl+Z وCtrl+Y.' } },
  { title: { en: 'Made for phones', ar: 'مصمم للهاتف' }, text: { en: 'Touch friendly buttons, a move-the-page button on the page tools, and pages that fit the screen.', ar: 'أزرار مناسبة للمس، وزر لتحريك الصفحة في أدوات الصفحات، وصفحات تتلاءم مع عرض الشاشة.' } },
  { title: { en: 'Acrobat keyboard shortcuts', ar: 'اختصارات أكروبات' }, text: { en: 'The shortcuts of Adobe Acrobat DC for Windows and Mac, listed below. They work with any keyboard layout, Arabic included.', ar: 'اختصارات Adobe Acrobat DC لنظامَي ويندوز وماك، مدرجة أدناه. وتعمل مع أي لغة للوحة المفاتيح، ومنها العربية.' } },
  { title: { en: 'Free and open source', ar: 'مجاني ومفتوح المصدر' }, text: { en: 'Free to use, with the code open under the AGPL-3.0 license.', ar: 'مجاني الاستخدام، وشيفرته مفتوحة برخصة AGPL-3.0.' } },
];

/** what the site does not do, said plainly */
export const NOT_AVAILABLE: Text[] = [
  { en: 'Editing the original text of a PDF', ar: 'تعديل النص الأصلي داخل ملف PDF' },
  { en: 'Certificate-based digital signatures', ar: 'التوقيع الرقمي بشهادة' },
  { en: 'PDF/A and print-production checks, accessibility tagging', ar: 'فحوصات PDF/A والطباعة الاحترافية، وتهيئة الملف لذوي الإعاقة (الوسم)' },
  { en: 'Features that need a server: sending files for comments, bulk sending, web forms', ar: 'المزايا التي تحتاج إلى خادم: إرسال الملفات للتعليق عليها، والإرسال الجماعي، والنماذج على الويب' },
];
