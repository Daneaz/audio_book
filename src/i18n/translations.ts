export type TranslationKey =
  | 'common.loading'
  | 'common.cancel'
  | 'common.delete'
  | 'common.default'
  | 'common.preview'
  | 'common.ok'
  | 'nav.bookshelf'
  | 'nav.upload'
  | 'nav.settings'
  | 'nav.chapters'
  | 'settings.appearance'
  | 'settings.language'
  | 'settings.languageSystem'
  | 'settings.languageChinese'
  | 'settings.languageEnglish'
  | 'settings.darkMode'
  | 'settings.fontSize'
  | 'settings.lineSpacing'
  | 'settings.fontFamily'
  | 'settings.readingMode'
  | 'settings.flipMode'
  | 'settings.flipModeScroll'
  | 'settings.flipModeHorizontal'
  | 'settings.autoReadSpeed'
  | 'settings.autoFlipInterval'
  | 'settings.voiceReading'
  | 'settings.speechRate'
  | 'settings.voice'
  | 'settings.voicePreviewHint'
  | 'settings.voicePreviewZh'
  | 'settings.voicePreviewEn'
  | 'bookshelf.subtitle'
  | 'bookshelf.sectionTitle'
  | 'bookshelf.emptyTitle'
  | 'bookshelf.emptySubtitle'
  | 'bookshelf.uploadButton'
  | 'bookshelf.deleteTitle'
  | 'bookshelf.deleteMessage'
  | 'bookshelf.chapterCount'
  | 'bookshelf.pendingParse'
  | 'upload.title'
  | 'upload.pickFile'
  | 'upload.loading'
  | 'upload.successTitle'
  | 'upload.successMessage'
  | 'upload.errorTitle'
  | 'upload.errorMessage'
  | 'reader.theme'
  | 'reader.autoFlipStart'
  | 'reader.autoFlipStop'
  | 'reader.read'
  | 'reader.pause'
  | 'reader.timer'
  | 'reader.timerSet'
  | 'reader.timerNone'
  | 'reader.timerUseTimed'
  | 'reader.timerSaveDefault'
  | 'reader.timerDefaultSaved'
  | 'reader.startRead'
  | 'reader.timerCustom'
  | 'reader.timerOff'
  | 'reader.timerPromptTitle'
  | 'reader.timerPromptMessage'
  | 'reader.timerPromptPlaceholder'
  | 'reader.fontPreview'
  | 'reader.lineSpacingPreview'
  | 'reader.chapterCountUnit';

type TranslationMap = Record<TranslationKey, string>;

export const translations: Record<'zh' | 'en', TranslationMap> = {
  zh: {
    'common.loading': '加载中...',
    'common.cancel': '取消',
    'common.delete': '删除',
    'common.default': '默认',
    'common.preview': '试听',
    'common.ok': '确定',
    'nav.bookshelf': '我的书架',
    'nav.upload': '上传书籍',
    'nav.settings': '设置',
    'nav.chapters': '目录',
    'settings.appearance': '外观',
    'settings.language': '语言',
    'settings.languageSystem': '跟随系统',
    'settings.languageChinese': '中文',
    'settings.languageEnglish': 'English',
    'settings.darkMode': '深色模式',
    'settings.fontSize': '字体大小',
    'settings.lineSpacing': '行间距',
    'settings.fontFamily': '阅读字体',
    'settings.readingMode': '阅读模式',
    'settings.flipMode': '翻页方式',
    'settings.flipModeScroll': '上下滑动',
    'settings.flipModeHorizontal': '左右翻页',
    'settings.autoReadSpeed': '自动阅读速度',
    'settings.autoFlipInterval': '自动翻页间隔 (秒)',
    'settings.voiceReading': '语音朗读',
    'settings.speechRate': '语速',
    'settings.voice': '声音',
    'settings.voicePreviewHint': '选择后会自动试听',
    'settings.voicePreviewZh': '这是一段中文语音试听。',
    'settings.voicePreviewEn': 'This is a short English voice preview.',
    'bookshelf.subtitle': '导入一本 TXT，开始把它摆上书架。',
    'bookshelf.sectionTitle': '书架',
    'bookshelf.emptyTitle': '还没有书',
    'bookshelf.emptySubtitle': '把 TXT 导进来，这里会像书架一样摆出一本本封面。',
    'bookshelf.uploadButton': '上传书籍',
    'bookshelf.deleteTitle': '删除书籍',
    'bookshelf.deleteMessage': '确定要删除《{title}》吗？此操作会同时移除阅读进度。',
    'bookshelf.chapterCount': '{count} 章',
    'bookshelf.pendingParse': '待解析',
    'upload.title': '导入书籍',
    'upload.pickFile': '从设备选择 TXT 文件',
    'upload.loading': '正在导入并解析章节...',
    'upload.successTitle': '成功',
    'upload.successMessage': '书籍导入成功',
    'upload.errorTitle': '错误',
    'upload.errorMessage': '导入书籍失败',
    'reader.theme': '主题',
    'reader.autoFlipStart': '自动翻页',
    'reader.autoFlipStop': '停止翻页',
    'reader.read': '朗读',
    'reader.pause': '暂停',
    'reader.timer': '定时',
    'reader.timerSet': '设置定时',
    'reader.timerNone': '不定时',
    'reader.timerUseTimed': '使用定时',
    'reader.timerSaveDefault': '设为默认时间',
    'reader.timerDefaultSaved': '已保存为默认时间',
    'reader.startRead': '开始朗读',
    'reader.timerCustom': '自定义',
    'reader.timerOff': '关闭定时',
    'reader.timerPromptTitle': '自定义定时',
    'reader.timerPromptMessage': '请输入分钟数',
    'reader.timerPromptPlaceholder': '例如 45',
    'reader.fontPreview': '春江潮水连海平，海上明月共潮生。',
    'reader.lineSpacingPreview': '山光悦鸟性，\n潭影空人心。\n万籁此都寂，\n但余钟磬音。',
    'reader.chapterCountUnit': '章',
  },
  en: {
    'common.loading': 'Loading...',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.default': 'Default',
    'common.preview': 'Preview',
    'common.ok': 'OK',
    'nav.bookshelf': 'Bookshelf',
    'nav.upload': 'Import Book',
    'nav.settings': 'Settings',
    'nav.chapters': 'Chapters',
    'settings.appearance': 'Appearance',
    'settings.language': 'Language',
    'settings.languageSystem': 'Follow System',
    'settings.languageChinese': 'Chinese',
    'settings.languageEnglish': 'English',
    'settings.darkMode': 'Dark Mode',
    'settings.fontSize': 'Font Size',
    'settings.lineSpacing': 'Line Height',
    'settings.fontFamily': 'Reading Font',
    'settings.readingMode': 'Reading Mode',
    'settings.flipMode': 'Page Mode',
    'settings.flipModeScroll': 'Vertical Scroll',
    'settings.flipModeHorizontal': 'Horizontal Paging',
    'settings.autoReadSpeed': 'Auto Read Speed',
    'settings.autoFlipInterval': 'Auto Flip Interval (sec)',
    'settings.voiceReading': 'Speech',
    'settings.speechRate': 'Speech Rate',
    'settings.voice': 'Voice',
    'settings.voicePreviewHint': 'Selecting a voice will play a preview',
    'settings.voicePreviewZh': 'This is a short Chinese voice preview.',
    'settings.voicePreviewEn': 'This is a short English voice preview.',
    'bookshelf.subtitle': 'Import a TXT file and place it on your shelf.',
    'bookshelf.sectionTitle': 'Shelf',
    'bookshelf.emptyTitle': 'No books yet',
    'bookshelf.emptySubtitle': 'Import a TXT file and your books will appear here with covers.',
    'bookshelf.uploadButton': 'Import Book',
    'bookshelf.deleteTitle': 'Delete Book',
    'bookshelf.deleteMessage': 'Delete "{title}"? This will also remove its reading progress.',
    'bookshelf.chapterCount': '{count} chapters',
    'bookshelf.pendingParse': 'Parsing pending',
    'upload.title': 'Import Books',
    'upload.pickFile': 'Select TXT File from Device',
    'upload.loading': 'Importing and parsing chapters...',
    'upload.successTitle': 'Success',
    'upload.successMessage': 'Book imported successfully',
    'upload.errorTitle': 'Error',
    'upload.errorMessage': 'Failed to import book',
    'reader.theme': 'Theme',
    'reader.autoFlipStart': 'Auto Flip',
    'reader.autoFlipStop': 'Stop Flip',
    'reader.read': 'Read',
    'reader.pause': 'Pause',
    'reader.timer': 'Timer',
    'reader.timerSet': 'Set Timer',
    'reader.timerNone': 'No Timer',
    'reader.timerUseTimed': 'Use Timer',
    'reader.timerSaveDefault': 'Save as Default',
    'reader.timerDefaultSaved': 'Saved as default',
    'reader.startRead': 'Start Reading',
    'reader.timerCustom': 'Custom',
    'reader.timerOff': 'Turn Off',
    'reader.timerPromptTitle': 'Custom Timer',
    'reader.timerPromptMessage': 'Enter minutes',
    'reader.timerPromptPlaceholder': 'e.g. 45',
    'reader.fontPreview': 'The moon rises with the tide over the spring sea.',
    'reader.lineSpacingPreview': 'Mountain light delights the birds,\nPool shadows calm the mind.\nAll sounds fall into silence,\nLeaving only the temple bell.',
    'reader.chapterCountUnit': 'chapters',
  },
};
