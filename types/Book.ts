export interface Book {
  id: string;
  title: string;
  author?: string;
  filePath: string;
  fileType: string;
  coverUrl?: string;
  lastRead?: Date;
  lastPage?: number;
  totalPages?: number;
  chapterIndex?: number;
  highlights?: BookHighlight[];
  bookmarks?: BookBookmark[];
}

export interface BookHighlight {
  id: string;
  text: string;
  position: number;
  chapter?: number;
  createdAt: Date;
  note?: string;
}

export interface BookBookmark {
  id: string;
  position: number;
  chapter?: number;
  createdAt: Date;
  note?: string;
} 