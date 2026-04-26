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
  | 'settings.themeMode'
  | 'settings.themeSystem'
  | 'settings.themeDark'
  | 'settings.themeLight'
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
  | 'settings.voiceHintIos'
  | 'settings.voiceHintAndroid'
  | 'bookshelf.subtitle'
  | 'bookshelf.sectionTitle'
  | 'bookshelf.emptyTitle'
  | 'bookshelf.emptySubtitle'
  | 'bookshelf.uploadButton'
  | 'bookshelf.deleteTitle'
  | 'bookshelf.deleteMessage'
  | 'bookshelf.chapterCount'
  | 'bookshelf.pendingParse'
  | 'bookshelf.rename'
  | 'bookshelf.renameTitle'
  | 'bookshelf.renamePrompt'
  | 'bookshelf.renameAuthor'
  | 'bookshelf.renameAuthorTitle'
  | 'bookshelf.renameAuthorPrompt'
  | 'bookshelf.setCover'
  | 'bookshelf.coverTitle'
  | 'bookshelf.coverPickLocal'
  | 'bookshelf.coverPasteClipboard'
  | 'bookshelf.coverClipboardEmpty'
  | 'bookshelf.coverError'
  | 'bookshelf.moreOptions'
  | 'upload.title'
  | 'upload.subtitle'
  | 'upload.pickFile'
  | 'upload.loading'
  | 'upload.successTitle'
  | 'upload.successMessage'
  | 'upload.errorTitle'
  | 'upload.errorMessage'
  | 'upload.localTitle'
  | 'upload.localDesc'
  | 'upload.wifiTitle'
  | 'upload.wifiDesc'
  | 'upload.wifiStart'
  | 'upload.wifiStop'
  | 'upload.wifiRunning'
  | 'upload.wifiInstruction'
  | 'upload.wifiCopy'
  | 'upload.wifiCopied'
  | 'upload.wifiNoNetwork'
  | 'upload.wifiReceived'
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
  | 'reader.chapterCountUnit'
  | 'settings.fontSystemDefault'
  | 'settings.fontHei'
  | 'settings.fontKai'
  | 'settings.fontSong'
  | 'settings.fontMashan'
  | 'settings.fontHeiDesc'
  | 'settings.fontKaiDesc'
  | 'settings.fontSongDesc'
  | 'settings.fontMashanDesc'
  | 'settings.keepScreenAwake'
  | 'voice.cantonese'
  | 'voice.chinese'
  | 'voice.english'
  | 'voice.qualityDefault'
  | 'voice.qualityEnhanced'
  | 'voice.qualityPremium'
  | 'settings.about'
  | 'settings.appVersion'
  | 'settings.otaVersion'
  | 'settings.otaBuiltin'
  | 'settings.otaChannel';

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
    'settings.themeMode': '主题模式',
    'settings.themeSystem': '跟随系统',
    'settings.themeDark': '深色',
    'settings.themeLight': '浅色',
    'settings.fontSize': '字体',
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
    'settings.voiceHintIos': '如需更自然的音色，可前往 iOS 设置 → 辅助功能 → 朗读内容 → 声音，下载「增强」版本',
    'settings.voiceHintAndroid': '建议在系统设置 → 语言和输入法 → 文字转语音中，将引擎切换为「Google 文字转语音」',
    'bookshelf.subtitle': '导入一本书，开始把它摆上书架。',
    'bookshelf.sectionTitle': '书架',
    'bookshelf.emptyTitle': '还没有书',
    'bookshelf.emptySubtitle': '导入书籍，这里会像书架一样摆出一本本封面。',
    'bookshelf.uploadButton': '上传书籍',
    'bookshelf.deleteTitle': '删除书籍',
    'bookshelf.deleteMessage': '确定要删除《{title}》吗？此操作会同时移除阅读进度。',
    'bookshelf.chapterCount': '{count} 章',
    'bookshelf.pendingParse': '待解析',
    'bookshelf.rename': '重命名',
    'bookshelf.renameTitle': '重命名书籍',
    'bookshelf.renamePrompt': '输入新书名',
    'bookshelf.renameAuthor': '重命名作者',
    'bookshelf.renameAuthorTitle': '重命名作者',
    'bookshelf.renameAuthorPrompt': '输入作者名',
    'bookshelf.setCover': '设置封面',
    'bookshelf.coverTitle': '设置封面',
    'bookshelf.coverPickLocal': '从相册选择',
    'bookshelf.coverPasteClipboard': '从剪贴板粘贴',
    'bookshelf.coverClipboardEmpty': '剪贴板中没有图片',
    'bookshelf.coverError': '封面加载失败，请检查链接',
    'bookshelf.moreOptions': '更多操作',
    'upload.title': '导入书籍',
    'upload.subtitle': '选择导入方式，将书籍添加到书架',
    'upload.pickFile': '从设备选择文件',
    'upload.loading': '正在导入并解析章节...',
    'upload.successTitle': '导入成功',
    'upload.successMessage': '书籍已添加到书架',
    'upload.errorTitle': '导入失败',
    'upload.errorMessage': '导入书籍失败，请重试',
    'upload.localTitle': '本地文件',
    'upload.localDesc': '支持 TXT、EPUB 格式',
    'upload.wifiTitle': '局域网传输',
    'upload.wifiDesc': '通过 WiFi 从电脑上传',
    'upload.wifiStart': '启动服务',
    'upload.wifiStop': '停止服务',
    'upload.wifiRunning': '运行中',
    'upload.wifiInstruction': '在电脑浏览器中打开以下地址',
    'upload.wifiCopy': '分享链接',
    'upload.wifiCopied': '已复制到剪贴板',
    'upload.wifiNoNetwork': '无法获取 IP，请检查 WiFi 连接',
    'upload.wifiReceived': '已收到 {count} 本书',
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
    'settings.fontSystemDefault': '系统默认',
    'settings.fontHei': '黑体',
    'settings.fontKai': '楷体',
    'settings.fontSong': '宋体',
    'settings.fontMashan': '手楷',
    'settings.fontHeiDesc': '更清晰利落，适合长时间阅读',
    'settings.fontKaiDesc': '更有纸书感，适合文学内容',
    'settings.fontSongDesc': '更接近传统书籍排版',
    'settings.fontMashanDesc': '更有手写感，适合标题和风格化阅读',
    'settings.keepScreenAwake': '阅读时屏幕常亮',
    'voice.cantonese': '粤语',
    'voice.chinese': '中文',
    'voice.english': '英文',
    'voice.qualityDefault': '标准',
    'voice.qualityEnhanced': '增强',
    'voice.qualityPremium': '精品',
    'settings.about': '关于',
    'settings.appVersion': '版本',
    'settings.otaVersion': 'OTA 更新',
    'settings.otaBuiltin': '内置版本',
    'settings.otaChannel': '渠道',
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
    'settings.themeMode': 'Theme',
    'settings.themeSystem': 'System',
    'settings.themeDark': 'Dark',
    'settings.themeLight': 'Light',
    'settings.fontSize': 'Font',
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
    'settings.voiceHintIos': 'For a more natural voice, go to iOS Settings → Accessibility → Spoken Content → Voices and download an "Enhanced" voice',
    'settings.voiceHintAndroid': 'For better Chinese quality, go to System Settings → Language & Input → Text-to-Speech and switch to "Google Text-to-Speech"',
    'bookshelf.subtitle': 'Import a book and place it on your shelf.',
    'bookshelf.sectionTitle': 'Shelf',
    'bookshelf.emptyTitle': 'No books yet',
    'bookshelf.emptySubtitle': 'Import a book and it will appear here with a cover.',
    'bookshelf.uploadButton': 'Import Book',
    'bookshelf.deleteTitle': 'Delete Book',
    'bookshelf.deleteMessage': 'Delete "{title}"? This will also remove its reading progress.',
    'bookshelf.chapterCount': '{count} chapters',
    'bookshelf.pendingParse': 'Parsing pending',
    'bookshelf.rename': 'Rename',
    'bookshelf.renameTitle': 'Rename Book',
    'bookshelf.renamePrompt': 'Enter new title',
    'bookshelf.renameAuthor': 'Rename Author',
    'bookshelf.renameAuthorTitle': 'Rename Author',
    'bookshelf.renameAuthorPrompt': 'Enter author name',
    'bookshelf.setCover': 'Set Cover',
    'bookshelf.coverTitle': 'Set Cover',
    'bookshelf.coverPickLocal': 'Choose from Photos',
    'bookshelf.coverPasteClipboard': 'Paste from Clipboard',
    'bookshelf.coverClipboardEmpty': 'No image found in clipboard',
    'bookshelf.coverError': 'Failed to load cover, please check the URL',
    'bookshelf.moreOptions': 'More Options',
    'upload.title': 'Import Books',
    'upload.subtitle': 'Choose a method to add books to your shelf',
    'upload.pickFile': 'Select File from Device',
    'upload.loading': 'Importing and parsing chapters...',
    'upload.successTitle': 'Imported',
    'upload.successMessage': 'Book added to shelf',
    'upload.errorTitle': 'Import Failed',
    'upload.errorMessage': 'Failed to import book, please try again',
    'upload.localTitle': 'Local File',
    'upload.localDesc': 'Supports TXT and EPUB formats',
    'upload.wifiTitle': 'WiFi Transfer',
    'upload.wifiDesc': 'Upload from computer via WiFi',
    'upload.wifiStart': 'Start Server',
    'upload.wifiStop': 'Stop Server',
    'upload.wifiRunning': 'Running',
    'upload.wifiInstruction': 'Open this address in your browser',
    'upload.wifiCopy': 'Share Link',
    'upload.wifiCopied': 'Copied to clipboard',
    'upload.wifiNoNetwork': 'Cannot get IP. Check WiFi connection.',
    'upload.wifiReceived': '{count} book(s) received',
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
    'settings.fontSystemDefault': 'System Default',
    'settings.fontHei': 'Hei',
    'settings.fontKai': 'Kai',
    'settings.fontSong': 'Song',
    'settings.fontMashan': 'Shou Kai',
    'settings.fontHeiDesc': 'Clear and crisp for long reading sessions',
    'settings.fontKaiDesc': 'A paper-book feel for literary content',
    'settings.fontSongDesc': 'Closer to traditional book typography',
    'settings.fontMashanDesc': 'Handwritten style for expressive reading',
    'settings.keepScreenAwake': 'Keep Screen On While Reading',
    'voice.cantonese': 'Cantonese',
    'voice.chinese': 'Chinese',
    'voice.english': 'English',
    'voice.qualityDefault': 'Standard',
    'voice.qualityEnhanced': 'Enhanced',
    'voice.qualityPremium': 'Premium',
    'settings.about': 'About',
    'settings.appVersion': 'Version',
    'settings.otaVersion': 'OTA Update',
    'settings.otaBuiltin': 'Built-in',
    'settings.otaChannel': 'Channel',
  },
};
