export type Language = 'zh' | 'en';

export interface TranslationKeys {
  // 通用
  appName: string;
  cancel: string;
  confirm: string;
  
  // 标签页
  tabBookshelf: string;
  tabSettings: string;
  
  // 书架页面
  bookshelfTitle: string;
  importBook: string;
  bookshelfEmpty: string;
  bookshelfEmptySubtext: string;
  importBookButton: string;
  openBook: string;
  
  // 文件类型
  epub: string;
  txt: string;
  pdf: string;
  
  // 导入相关
  filePickerCancelled: string;
  unsupportedFileType: string;
  unsupportedFileTypeMessage: string;
  importSuccess: string;
  importSuccessMessage: string;
  importFailed: string;
  importFailedMessage: string;
  
  // 设置页面
  settingsTitle: string;
  settingsDescription: string;
  languageSettings: string;
  languageZh: string;
  languageEn: string;
}

export const translations: Record<Language, TranslationKeys> = {
  zh: {
    // 通用
    appName: '有声书架',
    cancel: '取消',
    confirm: '确认',
    
    // 标签页
    tabBookshelf: '书架',
    tabSettings: '设置',
    
    // 书架页面
    bookshelfTitle: '我的书架',
    importBook: '导入书籍',
    bookshelfEmpty: '您的书架还是空的',
    bookshelfEmptySubtext: '点击右上角的+号导入书籍',
    importBookButton: '导入书籍',
    openBook: '即将打开《{title}》',
    
    // 文件类型
    epub: 'EPUB',
    txt: 'TXT',
    pdf: 'PDF',
    
    // 导入相关
    filePickerCancelled: '文档选择已取消',
    unsupportedFileType: '不支持的文件类型',
    unsupportedFileTypeMessage: '请选择 EPUB、TXT 或 PDF 格式的文件',
    importSuccess: '导入成功',
    importSuccessMessage: '已添加《{title}》到您的书架',
    importFailed: '导入失败',
    importFailedMessage: '无法导入选定的文件，请重试',
    
    // 设置页面
    settingsTitle: '设置',
    settingsDescription: '在这里您可以管理应用程序设置，如语言、主题、字体大小等。',
    languageSettings: '语言设置',
    languageZh: '中文',
    languageEn: '英文',
  },
  
  en: {
    // 通用
    appName: 'AudioBook Shelf',
    cancel: 'Cancel',
    confirm: 'Confirm',
    
    // 标签页
    tabBookshelf: 'Bookshelf',
    tabSettings: 'Settings',
    
    // 书架页面
    bookshelfTitle: 'My Bookshelf',
    importBook: 'Import Book',
    bookshelfEmpty: 'Your bookshelf is empty',
    bookshelfEmptySubtext: 'Tap the + icon in the top right to import books',
    importBookButton: 'Import Book',
    openBook: 'About to open "{title}"',
    
    // 文件类型
    epub: 'EPUB',
    txt: 'TXT',
    pdf: 'PDF',
    
    // 导入相关
    filePickerCancelled: 'Document selection cancelled',
    unsupportedFileType: 'Unsupported File Type',
    unsupportedFileTypeMessage: 'Please select EPUB, TXT, or PDF files',
    importSuccess: 'Import Successful',
    importSuccessMessage: 'Added "{title}" to your bookshelf',
    importFailed: 'Import Failed',
    importFailedMessage: 'Unable to import the selected file, please try again',
    
    // 设置页面
    settingsTitle: 'Settings',
    settingsDescription: 'Here you can manage application settings such as language, theme, font size, etc.',
    languageSettings: 'Language Settings',
    languageZh: 'Chinese',
    languageEn: 'English',
  }
}; 