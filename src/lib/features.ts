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
    { en: 'Opens iPhone photos (HEIC) in any browser and saves them as JPG, PNG or WebP', ar: 'يفتح صور الآيفون (HEIC) في أي متصفح ويحفظها بصيغة JPG أو PNG أو WebP' },
  ],
  'img-social': [
    { en: 'Ready sizes for Instagram, stories and reels, Facebook, X, LinkedIn and YouTube', ar: 'مقاسات جاهزة لإنستغرام والستوري والريلز وفيسبوك وإكس ولينكدإن ويوتيوب' },
    { en: 'Fill the whole size by cropping the edges, or fit the whole picture with coloured bars, with a live preview', ar: 'املأ المقاس كله بقصّ الأطراف، أو أظهر الصورة كاملة مع أشرطة ملونة، مع معاينة مباشرة' },
  ],
  'img-meme': [
    { en: 'Add text above and below a picture, in Arabic or English, and choose its size and colour', ar: 'أضف نصاً أعلى الصورة وأسفلها، بالعربية أو الإنجليزية، واختر حجمه ولونه' },
    { en: 'Or place each text yourself: click or drag on the picture to put it exactly where you want', ar: 'أو ضع كل نص بنفسك: انقر أو اسحب على الصورة لتضعه حيث تريد تمامًا' },
  ],
  'img-watermark': [
    { en: 'Stamp text or your logo on many pictures at once, with a live preview', ar: 'ضع نصاً أو شعارك على عدة صور دفعة واحدة، مع معاينة مباشرة' },
    { en: 'Choose the place, size, opacity and rotation, or repeat it across the picture', ar: 'اختر المكان والحجم والشفافية والدوران، أو كرّرها على الصورة كلها' },
    { en: 'Not limited to the nine spots: choose the exact place by clicking or dragging in a box', ar: 'دون الاقتصار على المواضع التسعة: حدّد المكان بدقة بالنقر أو السحب داخل مربع' },
  ],
  'img-upscale': [
    { en: 'Make pictures 2, 3 or 4 times bigger, many at once, with adjustable sharpening', ar: 'كبّر الصور مرتين أو ثلاثًا أو أربعًا، عدة صور معًا، مع شحذ قابل للضبط' },
    { en: 'Smooth enlarging, not artificial intelligence: it cannot add detail that is not there', ar: 'تكبير سلس وليس بالذكاء الاصطناعي: لا يضيف تفاصيل غير موجودة' },
  ],
  'img-blur': [
    { en: 'Drag over faces, number plates or private details to hide them with blur, pixels or a black box', ar: 'اسحب فوق الوجوه أو لوحات السيارات أو التفاصيل الخاصة لإخفائها بالتمويه أو المربعات أو مربع أسود' },
    { en: 'You mark the areas yourself; nothing is detected automatically', ar: 'تحدد المناطق بنفسك؛ لا يُكتشف شيء تلقائياً' },
  ],
  'vid-convert': [
    { en: 'Change a video to MP4, WebM, MOV or MKV', ar: 'حوّل الفيديو إلى MP4 أو WebM أو MOV أو MKV' },
    { en: 'Remove the sound if you want a silent copy', ar: 'أزل الصوت إن أردت نسخة صامتة' },
    { en: 'Reads most common video files, including MKV, AVI and 3GP', ar: 'يقرأ أغلب ملفات الفيديو الشائعة، ومنها MKV وAVI وـ3GP' },
  ],
  'vid-compress': [
    { en: 'Presets for WhatsApp, Instagram, TikTok, X and email, each with a sensible size and quality', ar: 'إعدادات جاهزة لواتساب وإنستغرام وتيك توك وإكس والبريد، لكل منها مقاس وجودة مناسبان' },
    { en: 'Can aim for a size limit, such as under 16 MB for WhatsApp', ar: 'يمكنه السعي إلى حد للحجم، مثل أقل من 16 ميغابايت لواتساب' },
    { en: 'Or set the quality, the largest height and a target size yourself', ar: 'أو حدّد الجودة وأكبر ارتفاع والحجم المستهدف بنفسك' },
    { en: 'Shows the size before and after', ar: 'يعرض الحجم قبل الضغط وبعده' },
  ],
  'vid-resize': [
    { en: 'Lower the resolution (2160p down to 240p) while keeping the shape', ar: 'اخفض الدقة (من 2160 إلى 240) مع الحفاظ على الشكل' },
    { en: 'Lower the frame rate to save space', ar: 'اخفض معدل الإطارات لتوفير المساحة' },
  ],
  'vid-trim': [
    { en: "Choose the start and the end, or press a button to take the player's position", ar: 'اختر البداية والنهاية، أو اضغط زرًا لأخذ موضع المشغّل' },
    { en: 'Fast mode copies the video without re-encoding; precise mode cuts exactly where you chose', ar: 'الوضع السريع ينسخ الفيديو دون إعادة ترميز، والدقيق يقصّ عند اللحظة المحددة تمامًا' },
  ],
  'vid-merge': [
    { en: 'Join many videos into one, in the order you set (move up and down)', ar: 'اجمع عدة فيديوهات في واحد بالترتيب الذي تحدده (نقل لأعلى ولأسفل)' },
    { en: 'Clips of different sizes are fitted to the first one without stretching', ar: 'تُلائَم المقاطع المختلفة المقاس مع الأول دون تشويه' },
    { en: 'Sound is kept only when every clip has sound', ar: 'يبقى الصوت فقط إذا كان في كل المقاطع' },
  ],
  'vid-crop': [
    { en: 'Vertical 9:16, square, 4:5, 16:9, 4:3, or exact pixels', ar: 'طولي 9:16 أو مربع أو 4:5 أو 16:9 أو 4:3 أو بكسلات محددة' },
    { en: 'Drag the frame on the video to choose what stays, or move it with the sliders', ar: 'اسحب الإطار على الفيديو لتحدد ما سيبقى، أو حرّكه بالمنزلقات' },
    { en: 'Free shape: drag the frame\'s corners and edges to any size you want', ar: 'شكل حر: اسحب زوايا الإطار وحوافه إلى أي حجم تريده' },
  ],
  'vid-rotate': [
    { en: 'Rotate 90° either way or 180°, or flip left to right or top to bottom', ar: 'دوّر 90° في أي اتجاه أو 180°، أو اقلب أفقيًا أو رأسيًا' },
  ],
  'vid-speed': [
    { en: 'From 0.25× slow motion to 8× fast, with the sound kept in step and the same pitch', ar: 'من 0.25× للحركة البطيئة إلى 8× للسريعة، مع مزامنة الصوت وثبات درجته' },
  ],
  sheet: [
    { en: 'Type values and formulas in a grid (26 columns, 200 rows) with the cell content bar and the arrow keys', ar: 'اكتب القيم والمعادلات في شبكة (26 عموداً و200 صف) مع شريط محتوى الخلية ومفاتيح الأسهم' },
    { en: 'Functions: SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, ROUND, ABS, SQRT, INT, MOD, POWER, IF, AND, OR, NOT, SUMIF, COUNTIF, CONCAT, LEN, UPPER, LOWER, TRIM; Arabic digits and the Arabic comma work in formulas', ar: 'الدوال: SUM وAVERAGE وMIN وMAX وCOUNT وCOUNTA وROUND وABS وSQRT وINT وMOD وPOWER وIF وAND وOR وNOT وSUMIF وCOUNTIF وCONCAT وLEN وUPPER وLOWER وTRIM؛ والأرقام العربية والفاصلة العربية تعمل داخل المعادلات' },
    { en: 'Open and save Excel (XLSX, formulas kept) and CSV (with Arabic text read correctly by Excel)', ar: 'افتح واحفظ ملفات Excel (XLSX مع بقاء المعادلات) وCSV (ونص عربي يقرؤه Excel صحيحاً)' },
    { en: 'Saved in this browser as you type; it is a light sheet: no charts, no cell colours, one sheet', ar: 'يُحفظ في هذا المتصفح أثناء الكتابة؛ وهو جدول خفيف: بلا مخططات ولا ألوان للخلايا وبورقة واحدة' },
  ],
  slides: [
    { en: 'Four layouts (title, bullets, text, picture) and five colour themes, with a thumbnail list, add, duplicate, delete and reorder', ar: 'أربعة تخطيطات (عنوان ونقاط ونص وصورة) وخمس سمات لونية، مع قائمة مصغرات وإضافة ونسخ وحذف وإعادة ترتيب' },
    { en: 'Arabic slides are laid out right to left automatically; English ones left to right', ar: 'تُرتَّب الشرائح العربية من اليمين إلى اليسار تلقائياً، والإنجليزية من اليسار إلى اليمين' },
    { en: 'Save as PowerPoint (PPTX, real editable text), PDF or pictures, or present full screen with the arrow keys', ar: 'احفظ بصيغة PowerPoint (PPTX بنص حقيقي قابل للتحرير) أو PDF أو صور، أو اعرض بملء الشاشة بمفاتيح الأسهم' },
    { en: 'Saved in this browser as you type; the PDF and the pictures are images of the slides', ar: 'يُحفظ في هذا المتصفح أثناء الكتابة؛ وملف PDF والصور هي صور للشرائح' },
  ],
  cad: [
    { en: 'Draw lines, rectangles, circles, polylines and text (Arabic or English) on a millimetre board, with a dotted grid', ar: 'ارسم الخطوط والمستطيلات والدوائر والخطوط المتعددة والنصوص (عربية أو إنجليزية) على لوحة بالمليمتر مع شبكة منقّطة' },
    { en: 'Snap to the grid and to corners, ends and centres; hold Shift (or tick the box) for straight lines only; type a number while drawing to set an exact length or radius', ar: 'التقاط بالشبكة وبالزوايا والأطراف والمراكز؛ أمسك Shift (أو فعّل الخيار) لخطوط مستقيمة فقط؛ واكتب رقماً أثناء الرسم لتحديد طول أو نصف قطر دقيق' },
    { en: 'Measure a distance, and see the length, size, perimeter and area of any shape; select, move (mouse or arrow keys), resize and delete with undo and redo', ar: 'قِس المسافات، وشاهد الطول والحجم والمحيط والمساحة لأي شكل؛ وحدّد وحرّك (بالفأرة أو الأسهم) وغيّر المقاس واحذف مع التراجع والإعادة' },
    { en: 'Open and save DXF (works with the common CAD programs; Arabic text kept), and save SVG or a picture', ar: 'افتح واحفظ DXF (يعمل مع برامج CAD الشائعة مع بقاء النص العربي)، واحفظ SVG أو صورة' },
    { en: 'Keys: V select, H move view, L line, R rectangle, C circle, P polyline, T text, M measure, F fit. Saved in this browser as you draw; it is a light 2D board (one layer, no dimensions or hatching)', ar: 'المفاتيح: V تحديد وH تحريك العرض وL خط وR مستطيل وC دائرة وP خط متعدد وT نص وM قياس وF ملاءمة. يُحفظ في هذا المتصفح أثناء الرسم؛ وهي لوحة ثنائية الأبعاد خفيفة (طبقة واحدة، بلا أبعاد ولا تهشير)' },
  ],
  'aud-trim': [
    { en: 'Keep only the part you need from a sound file, at the exact seconds you type or the player position', ar: 'احتفظ بالجزء الذي تحتاجه فقط من الملف الصوتي عند الثواني التي تكتبها أو موضع المشغّل' },
    { en: 'Save it as MP3, M4A, WAV, OGG or FLAC', ar: 'احفظه بصيغة MP3 أو M4A أو WAV أو OGG أو FLAC' },
  ],
  'aud-convert': [
    { en: 'Change a sound file to MP3, M4A, WAV, OGG or FLAC, with the quality you choose', ar: 'غيّر الملف الصوتي إلى MP3 أو M4A أو WAV أو OGG أو FLAC بالجودة التي تختارها' },
  ],
  'aud-merge': [
    { en: 'Join several sound files one after another, in the order you set; different formats and rates are matched automatically', ar: 'ادمج عدة ملفات صوتية بعضها خلف بعض بالترتيب الذي تحدده، وتُوفَّق الصيغ والمعدلات المختلفة تلقائياً' },
  ],
  'aud-polish': [
    { en: 'Raise or lower the volume in decibels, and level the loudness to about \u221216 LUFS for podcasts and video', ar: 'ارفع مستوى الصوت أو اخفضه بالديسيبل، وسوِّ الجهارة إلى نحو \u221216 LUFS للبودكاست والفيديو' },
    { en: 'Fade in and out, change the speed (0.25 to 4) and make it mono', ar: 'تلاشٍ تصاعدي وتنازلي، وتغيير السرعة (من 0.25 إلى 4)، وجعله أحادي القناة' },
  ],
  'vid-audio': [
    { en: 'Save the sound of a video as MP3, M4A, WAV, OGG or FLAC', ar: 'احفظ صوت الفيديو بصيغة MP3 أو M4A أو WAV أو OGG أو FLAC' },
    { en: 'Choose the bitrate for the compressed formats', ar: 'اختر معدل البتات للصيغ المضغوطة' },
  ],
  'vid-gif': [
    { en: 'Turn up to 30 seconds of a video into an animated GIF', ar: 'حوّل حتى 30 ثانية من الفيديو إلى صورة GIF متحركة' },
    { en: 'Choose the start, frames per second and width; the colours are tuned for a better picture', ar: 'اختر البداية وعدد الإطارات في الثانية والعرض، مع ضبط الألوان لصورة أفضل' },
  ],
  'vid-thumb': [
    { en: 'Save a picture from any moment of the video as JPG or PNG', ar: 'احفظ صورة من أي لحظة في الفيديو بصيغة JPG أو PNG' },
    { en: 'Or save one frame every few seconds as a ZIP', ar: 'أو احفظ لقطة كل عدة ثوانٍ في ملف ZIP' },
    { en: "Uses your browser's own player, so it needs a format the browser can play", ar: 'يستخدم مشغّل المتصفح نفسه، فيلزم أن تكون الصيغة مما يشغّله المتصفح' },
  ],
  'vid-info': [
    { en: 'Shows the size, length, resolution, frame rate, codecs and bitrate', ar: 'يعرض الحجم والمدة والدقة ومعدل الإطارات والترميز ومعدل البتات' },
    { en: 'Says whether the video has sound', ar: 'يبيّن هل في الفيديو صوت' },
  ],
  'pdf-split': [
    { en: 'Cut a PDF into files by ranges (1-3, 4-6, 7), every few pages, or one file per page', ar: 'قسّم ملف PDF إلى ملفات بحسب نطاقات (1-3, 4-6, 7) أو كل عدة صفحات أو ملف لكل صفحة' },
    { en: 'Several files come as one ZIP', ar: 'تصلك عدة ملفات في ملف ZIP واحد' },
  ],
  'pdf-extract': [
    { en: 'Keep only the pages you name in a new file, in the order you type them', ar: 'احتفظ بالصفحات التي تحددها في ملف جديد، بالترتيب الذي تكتبه' },
    { en: 'Or remove the pages you do not want', ar: 'أو احذف الصفحات التي لا تريدها' },
  ],
  'pdf-crop': [
    { en: 'Cut margins in millimetres from the top, bottom, left and right of all pages or some', ar: 'اقتطع هوامش بالمليمتر من أعلى الصفحات وأسفلها ويسارها ويمينها، لكلها أو لبعضها' },
    { en: 'Drag the frame on the preview, and its corners and edges, to choose the area yourself; the millimetre boxes follow; works with turned pages too', ar: 'اسحب الإطار على المعاينة وزواياه وحوافه لتحدد المنطقة بنفسك، وتتبعه خانات المليمتر؛ ويعمل مع الصفحات المدارة أيضًا' },
  ],
  'pdf-layout': [
    { en: 'Pages per sheet: 2, 4, 6, 9, 12 or 16 pages on each sheet, on A4, A3 or Letter, upright or sideways', ar: 'صفحات متعددة في الورقة: 2 أو 4 أو 6 أو 9 أو 12 أو 16 صفحة في كل ورقة، على A4 أو A3 أو Letter، بالطول أو بالعرض' },
    { en: 'Booklet: pages in the order that folds into a book when printed on both sides; blank pages fill up to a multiple of 4', ar: 'كتيّب: تُرتَّب الصفحات بالترتيب الذي يُطوى كتابًا عند الطباعة على الوجهين؛ وتُكمَّل بصفحات فارغة حتى مضاعف الرقم 4' },
    { en: 'Right-to-left reading for Arabic books', ar: 'قراءة من اليمين إلى اليسار للكتب العربية' },
  ],
  'pdf-clean': [
    { en: 'Shows what the file carries besides its pages: author and dates, scripts, attached files, comments, links, bookmarks, thumbnails', ar: 'يعرض ما يحمله الملف غير صفحاته: المؤلف والتواريخ والسكربتات والملفات المرفقة والتعليقات والروابط والإشارات المرجعية والصور المصغرة' },
    { en: 'Removes what you tick from the file itself, so nothing is left behind; the pages stay as they are', ar: 'يزيل ما تحدده من الملف نفسه فلا يبقى له أثر؛ وتبقى الصفحات كما هي' },
    { en: 'It does not remove text hidden under a black box: use Redact for that', ar: 'لا يزيل النص المخفي تحت مربع أسود: استخدم أداة الحجب لذلك' },
  ],
  'pdf-a11y': [
    { en: 'Checks the title, language, tags, real text, picture descriptions, bookmarks and form tooltips', ar: 'يفحص العنوان واللغة والوسوم والنص الحقيقي وأوصاف الصور والإشارات المرجعية وتلميحات النماذج' },
    { en: 'Sets the title and the language of the document, then checks again', ar: 'يضبط عنوان المستند ولغته ثم يعيد الفحص' },
    { en: 'It cannot judge reading order, colour contrast or the quality of descriptions: those need a person', ar: 'لا يستطيع الحكم على ترتيب القراءة وتباين الألوان وجودة الأوصاف: فهذه تحتاج إلى إنسان' },
  ],
  'pdf-repair': [
    { en: 'Rebuilds a PDF that will not open: copies every page into a clean file, keeping the text', ar: 'يعيد بناء ملف PDF لا يفتح: ينسخ كل صفحة إلى ملف سليم مع الإبقاء على النص' },
    { en: 'When that is impossible, redraws the pages as pictures and says so (the text is lost)', ar: 'وإن تعذّر ذلك أعاد رسم الصفحات صورًا وأخبرك بذلك (يضيع النص)' },
    { en: 'It cannot bring back content that is really missing from the file', ar: 'لا يستطيع استرجاع محتوى مفقود فعلًا من الملف' },
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
    { en: 'On a phone, take photos of pages with the camera and make a PDF from them (each photo is straightened)', ar: 'على الهاتف، صوّر الصفحات بالكاميرا واصنع منها ملف PDF (تُعدَّل كل صورة لتكون مستقيمة)' },
  ],
  merge: [
    { en: 'Join PDFs and pictures (JPG, PNG, WebP, HEIC…) into one PDF; each picture becomes a page at its own size', ar: 'ادمج ملفات PDF والصور (JPG وPNG وWebP وHEIC…) في ملف PDF واحد؛ وتصبح كل صورة صفحة بحجمها' },
    { en: 'Put them in order by dragging or with the arrow buttons, and remove the ones you do not want', ar: 'رتّبها بالسحب أو بأزرار الأسهم، واحذف ما لا تريده' },
  ],
  organize: [
    { en: 'Reorder, rotate and delete pages while looking at their thumbnails', ar: 'أعد ترتيب الصفحات وأدرها واحذف منها وأنت ترى صورها المصغّرة' },
    { en: 'Move pages with the buttons on a touch screen, or drag them on a computer', ar: 'انقل الصفحات بالأزرار على شاشة اللمس، أو اسحبها على الحاسوب' },
    { en: 'Save only the pages you kept as a new file', ar: 'احفظ الصفحات التي أبقيتها فقط في ملف جديد' },
    { en: 'Add a blank page after any page, duplicate a page, or add pages from another PDF and place them where you want', ar: 'أضف صفحة فارغة بعد أي صفحة، أو كرّر صفحة، أو أضف صفحات من ملف PDF آخر وضعها حيث تشاء' },
  ],
  export: [
    { en: 'Save every page as a PNG or JPG picture', ar: 'احفظ كل صفحة صورة بصيغة PNG أو JPG' },
    { en: 'Choose the quality from 72 to 300 dpi, and get all the pictures in one ZIP', ar: 'اختر الجودة من 72 إلى 300 dpi، واحصل على كل الصور في ملف ZIP واحد' },
  ],
  convert: [
    { en: 'Save the text as Word, Excel, PowerPoint, Markdown, plain text, RTF, HTML or XML', ar: 'احفظ النص بصيغة Word أو Excel أو PowerPoint أو Markdown أو نص عادي أو RTF أو HTML أو XML' },
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
    { en: 'Numbering templates: {n}, {total}, {date}, and Bates-style numbers such as CASE-{n:6}', ar: 'قوالب الترقيم: {n} و{total} و{date}، وأرقام بنمط بيتس مثل CASE-{n:6}' },
    { en: 'Choose pages like odd, even or even 3-20 (also in Arabic: فردي، زوجي)', ar: 'اختر الصفحات مثل odd أو even أو even 3-20 (وبالعربية: فردي، زوجي)' },
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
    { en: 'Find private data by its shape: emails, phone numbers (also in Arabic digits), bank cards (checked), ID numbers, dates and links; every match gets a box you can still edit', ar: 'ابحث عن البيانات الخاصة بشكلها: البريد الإلكتروني وأرقام الهواتف (حتى بالأرقام العربية) والبطاقات المصرفية (مع التحقق منها) وأرقام الهوية والتواريخ والروابط؛ ويوضع مربع على كل نتيجة يمكنك تعديله' },
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
  { title: { en: 'Your file follows you', ar: 'ملفك يرافقك' }, text: { en: 'The PDF, pictures or video you open stay on this device, so another tool of the same kind, or another browser tab, opens them without a new upload. You can delete them, or switch the keeping off, under the file.', ar: 'يبقى ملف PDF أو الصور أو الفيديو الذي تفتحه على جهازك، فتفتحه أي أداة من النوع نفسه أو تبويب آخر دون رفع جديد. يمكنك حذفه أو إيقاف الحفظ من أسفل الملف.' } },
  { title: { en: 'You choose the place', ar: 'أنت تختار المكان' }, text: { en: 'Where something is written, stamped, cropped or cut is never fixed for you: besides the quick spots, you can click or drag on the preview to choose the exact place.', ar: 'لا يُفرض عليك مكان للكتابة أو الختم أو القص أو الاقتصاص: إلى جانب المواضع السريعة يمكنك النقر أو السحب على المعاينة لاختيار المكان بدقة.' } },
  { title: { en: 'Switch tools from anywhere', ar: 'تنقّل بين الأدوات من أي مكان' }, text: { en: 'The bar under the header lists the tools by group, on every page.', ar: 'يعرض الشريط الواقع أسفل الترويسة الأدوات حسب المجموعة، في جميع الصفحات.' } },
  { title: { en: 'Undo and redo', ar: 'التراجع والإعادة' }, text: { en: 'Every tool has undo and redo buttons at the top, and Ctrl+Z and Ctrl+Y work too.', ar: 'في كل أداة زرّا تراجع وإعادة في الأعلى، ويعمل أيضاً Ctrl+Z وCtrl+Y.' } },
  { title: { en: 'Made for phones', ar: 'مصمم للهاتف' }, text: { en: 'Touch friendly buttons, a move-the-page button on the page tools, and pages that fit the screen.', ar: 'أزرار مناسبة للمس، وزر لتحريك الصفحة في أدوات الصفحات، وصفحات تتلاءم مع عرض الشاشة.' } },
  { title: { en: 'Shortcuts', ar: 'اختصارات' }, text: { en: 'Shortcuts for Windows and Mac, listed below. They work with any keyboard layout, Arabic included.', ar: 'اختصارات لنظامَي ويندوز وماك، مدرجة أدناه. وتعمل مع أي لغة للوحة المفاتيح، ومنها العربية.' } },
  { title: { en: 'The video engine is kept on your device', ar: 'محرك الفيديو يُحفظ على جهازك' }, text: { en: 'The first video job downloads the video engine (about 32 MB) from this site. It is stored in your browser, so later jobs start at once, on a phone or a computer. It is not a third party.', ar: 'تنزّل أول عملية فيديو محرك الفيديو (نحو 32 ميغابايت) من هذا الموقع نفسه، ثم يُحفظ في متصفحك فتبدأ العمليات اللاحقة فورًا على الهاتف أو الحاسوب. وهو ليس من طرف ثالث.' } },
  { title: { en: 'What is new', ar: 'الجديد' }, text: { en: 'New and updated tools are marked on the home page and on the tool cards.', ar: 'تُعلَّم الأدوات الجديدة والمحدَّثة في الصفحة الرئيسية وعلى بطاقات الأدوات.' } },
  { title: { en: 'Studios', ar: 'الاستوديوهات' }, text: { en: 'Five studios (Docs, Design, Film, Audio, CAD) open full professional apps, open source, running in your browser. You choose the full or the light version first; the light version uses Shootcut\u2019s own simple tools and suits phones. The inside of the full apps is in English for now and they are in an early (alpha) stage.', ar: 'خمسة استوديوهات (المستندات والتصميم والمونتاج والصوت والهندسة) تفتح تطبيقات احترافية كاملة مفتوحة المصدر تعمل في متصفحك. تختار أولاً النسخة الكاملة أو الخفيفة؛ والخفيفة تستخدم أدوات شوتكت البسيطة وتناسب الهاتف. واجهة التطبيقات الكاملة من الداخل بالإنجليزية حالياً وهي في مرحلة مبكرة (ألفا).' } },
  { title: { en: 'Free and open source', ar: 'مجاني ومفتوح المصدر' }, text: { en: 'Free to use, with the code open under the AGPL-3.0 license.', ar: 'مجاني الاستخدام، وشيفرته مفتوحة برخصة AGPL-3.0.' } },
];
