export type AppLanguage = 'system' | 'zh' | 'en';

export interface Book {
  id: string;
  title: string;
  author: string;
  filePath: string;
  fileName: string;
  fileType: 'txt' | 'epub';
  totalChapters: number;
  totalPages: number;
  createdAt: string;
  lastReadAt: string;
  coverImageUri?: string;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  chapterNumber: number;
  startPosition: number;
  endPosition: number;
  pageCount: number;
  htmlFilePath?: string;
}

export interface RichTextBlock {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'blockquote';
  text: string;
  flatStart: number;
  flatEnd: number;
}

export interface ReadingProgress {
  id: string;
  bookId: string;
  chapterId: string;
  currentPosition: number;
  currentPage: number;
  readingMode: 'scroll' | 'horizontal';
  updatedAt: string;
}

export interface UserSettings {
  id: string;
  fontSize: number;
  lineSpacing: number;
  language: AppLanguage;
  speechTimerDefaultMinutes: number | null;
  fontPreset: 'system' | 'hei' | 'kai' | 'song' | 'mashan';
  theme: 'system' | 'light' | 'dark';
  flipMode: 'scroll' | 'horizontal';
  autoFlip: boolean;
  flipInterval: number;
  speechRate: number;
  voiceType: string;
  keepScreenAwake: boolean;
}
