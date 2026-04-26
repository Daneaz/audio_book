import StorageService from './StorageService';
import { STORAGE_KEYS } from '../utils/constants';
import { Book } from '../types';
import { documentDirectory, copyAsync, deleteAsync, downloadAsync } from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

class BookService {
  async getBooks(): Promise<Book[]> {
    const data = await StorageService.getData(STORAGE_KEYS.BOOKS);
    
    if (!data) return [];

    if (Platform.OS !== 'web') {
        return data.map((book: Book) => {
            const updated = {
                ...book,
                fileType: book.fileType ?? 'txt',
            };
            if (updated.fileName && !updated.filePath.startsWith('blob:') && !updated.filePath.startsWith('data:')) {
                return { ...updated, filePath: `${documentDirectory}${updated.fileName}` };
            }
            return updated;
        });
    }

    return data.map((book: Book) => ({ ...book, fileType: book.fileType ?? 'txt' }));
  }

  async addBook(fileUri: string, fileName: string): Promise<Book> {
    const books = await this.getBooks();
    
    let newPath = fileUri; // Default to using the original URI (useful for Web or if copy fails)

    if (Platform.OS !== 'web') {
        const docDir = documentDirectory;
        if (docDir) {
            newPath = `${docDir}${fileName}`;
            try {
                await copyAsync({
                    from: fileUri,
                    to: newPath
                });
            } catch (error) {
                console.warn("File copy failed, using original uri.", error);
                newPath = fileUri; // Fallback to original URI
            }
        }
    }

    const newBook: Book = {
      id: Crypto.randomUUID(),
      title: fileName.replace('.txt', ''),
      author: 'Unknown',
      filePath: newPath,
      fileName: fileName,
      fileType: 'txt',
      totalChapters: 0,
      totalPages: 0,
      createdAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    };

    books.push(newBook);
    await StorageService.storeData(STORAGE_KEYS.BOOKS, books);
    return newBook;
  }

  async addEpubBook(fileUri: string, fileName: string): Promise<{ book: Book; chapters: import('../types').Chapter[] }> {
    const books = await this.getBooks();
    const id = Crypto.randomUUID();

    const EpubService = (await import('./EpubService')).default;
    const { metadata, chapters: spineChapters } = await EpubService.extract(id, fileUri);

    let storedPath = fileUri;
    if (documentDirectory) {
      const destPath = `${documentDirectory}${fileName}`;
      try {
        await deleteAsync(destPath, { idempotent: true });
        await copyAsync({ from: fileUri, to: destPath });
        storedPath = destPath;
      } catch (error) {
        console.warn('EPUB file copy failed, using cache uri.', error);
      }
    }

    const newBook: Book = {
      id,
      title: metadata.title || fileName.replace(/\.epub$/i, ''),
      author: metadata.author || 'Unknown',
      filePath: storedPath,
      fileName,
      fileType: 'epub',
      totalChapters: spineChapters.length,
      totalPages: 0,
      createdAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    };

    const chapters: import('../types').Chapter[] = spineChapters.map((c, i) => ({
      id: Crypto.randomUUID(),
      bookId: id,
      title: c.title,
      chapterNumber: i + 1,
      startPosition: 0,
      endPosition: 0,
      htmlFilePath: c.htmlFilePath,
      pageCount: 0,
    }));

    books.push(newBook);
    await StorageService.storeData(STORAGE_KEYS.BOOKS, books);
    await StorageService.storeData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${id}`, chapters);

    return { book: newBook, chapters };
  }

  async removeBook(bookId: string) {
    let books = await this.getBooks();
    const book = books.find(b => b.id === bookId);
    if (book) {
      try {
        if (book.filePath.startsWith('file://')) {
          await deleteAsync(book.filePath, { idempotent: true });
        }
        if (book.coverImageUri?.startsWith('file://')) {
          await deleteAsync(book.coverImageUri.split('?')[0], { idempotent: true });
        }
        if (book.fileType === 'epub') {
          const EpubService = (await import('./EpubService')).default;
          await EpubService.cleanup(bookId);
        }
      } catch (e) {
        console.error('Error deleting file', e);
      }
    }
    books = books.filter(b => b.id !== bookId);
    await StorageService.storeData(STORAGE_KEYS.BOOKS, books);
    await StorageService.removeData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${bookId}`);
    await StorageService.removeData(`${STORAGE_KEYS.READING_PROGRESS_PREFIX}${bookId}`);
  }
  
  async updateBook(updatedBook: Book) {
      const books = await this.getBooks();
      const index = books.findIndex(b => b.id === updatedBook.id);
      if (index !== -1) {
          books[index] = updatedBook;
          await StorageService.storeData(STORAGE_KEYS.BOOKS, books);
      }
  }

  async downloadCoverFromUrl(bookId: string, url: string): Promise<Book> {
      const books = await this.getBooks();
      const book = books.find(b => b.id === bookId);
      if (!book) throw new Error('Book not found');

      const rawExt = url.split('?')[0].split('.').pop() || 'jpg';
      const ext = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(rawExt.toLowerCase()) ? rawExt.toLowerCase() : 'jpg';
      const localName = `cover_${bookId}.${ext}`;
      const localPath = `${documentDirectory}${localName}`;

      if (book.coverImageUri?.startsWith('file://') && book.coverImageUri.split('?')[0] !== localPath) {
          try { await deleteAsync(book.coverImageUri.split('?')[0], { idempotent: true }); } catch {}
      }

      await downloadAsync(url, localPath);
      const updated = { ...book, coverImageUri: `${localPath}?t=${Date.now()}` };
      await this.updateBook(updated);
      return updated;
  }

  async setCoverFromLocalUri(bookId: string, sourceUri: string): Promise<Book> {
      const books = await this.getBooks();
      const book = books.find(b => b.id === bookId);
      if (!book) throw new Error('Book not found');

      const rawExt = sourceUri.split('?')[0].split('.').pop() || 'jpg';
      const ext = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(rawExt.toLowerCase()) ? rawExt.toLowerCase() : 'jpg';
      const localName = `cover_${bookId}.${ext}`;
      const localPath = `${documentDirectory}${localName}`;

      if (book.coverImageUri?.startsWith('file://') && book.coverImageUri.split('?')[0] !== localPath) {
          try { await deleteAsync(book.coverImageUri.split('?')[0], { idempotent: true }); } catch {}
      }

      await copyAsync({ from: sourceUri, to: localPath });
      const updated = { ...book, coverImageUri: `${localPath}?t=${Date.now()}` };
      await this.updateBook(updated);
      return updated;
  }
}

export default new BookService();
