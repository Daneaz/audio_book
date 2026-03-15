export interface Book {
  id: string;
  title: string;
  author: string;
  filePath: string;
  fileName: string;
  totalChapters: number;
  totalPages: number;
  createdAt: string;
  lastReadAt: string;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  chapterNumber: number;
  startPosition: number;
  endPosition: number;
  pageCount: number;
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
  theme: 'light' | 'dark';
  flipMode: 'scroll' | 'horizontal';
  autoFlip: boolean;
  flipInterval: number;
  speechRate: number;
  voiceType: string;
}
