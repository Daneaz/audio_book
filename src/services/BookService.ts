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
            // Fix paths for iOS/Android where documentDirectory might change after app reinstall/rebuild
            if (book.fileName && !book.filePath.startsWith('blob:') && !book.filePath.startsWith('data:')) {
                 return {
                     ...book,
                     filePath: `${documentDirectory}${book.fileName}`
                 };
            }
            return book;
        });
    }

    return data;
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
      totalChapters: 0,
      totalPages: 0,
      createdAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    };

    books.push(newBook);
    await StorageService.storeData(STORAGE_KEYS.BOOKS, books);
    return newBook;
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
        } catch (e) {
            console.error("Error deleting file", e);
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
