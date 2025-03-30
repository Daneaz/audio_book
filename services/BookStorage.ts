import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { Book } from '@/types/Book';

const BOOKS_STORAGE_KEY = 'books_data';
const BOOKS_DIR = FileSystem.documentDirectory + 'books/';

// 创建一个临时缓存来存储书籍内容
const contentCache: Record<string, string> = {};

export const BookStorage = {
  /**
   * 初始化存储目录
   */
  initialize: async (): Promise<void> => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(BOOKS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(BOOKS_DIR, { intermediates: true });
        console.log('书籍目录已创建:', BOOKS_DIR);
      }
    } catch (error) {
      console.error('初始化书籍存储目录失败:', error);
      throw error;
    }
  },

  /**
   * 获取所有书籍
   */
  getAllBooks: async (): Promise<Book[]> => {
    try {
      const booksJson = await AsyncStorage.getItem(BOOKS_STORAGE_KEY);
      return booksJson ? JSON.parse(booksJson) : [];
    } catch (error) {
      console.error('获取书籍列表失败:', error);
      return [];
    }
  },

  /**
   * 保存书籍列表
   */
  saveBooks: async (books: Book[]): Promise<void> => {
    try {
      await AsyncStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(books));
    } catch (error) {
      console.error('保存书籍列表失败:', error);
      throw error;
    }
  },

  /**
   * 检查文件是否可读
   */
  isFileReadable: async (filePath: string): Promise<boolean> => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists || fileInfo.isDirectory) {
        return false;
      }
      
      if (Platform.OS === 'ios') {
        // iOS上需要尝试读取文件来验证可读性
        try {
          // 尝试读取小部分文件（前100个字符）
          await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.UTF8,
            length: 100,
            position: 0
          });
          return true;
        } catch (e) {
          console.error('文件不可读:', e);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('检查文件可读性失败:', error);
      return false;
    }
  },

  /**
   * 添加新书
   */
  addBook: async (book: Book, fileUri: string): Promise<Book> => {
    try {
      // 确保目录存在
      await BookStorage.initialize();
      
      // 获取文件扩展名和MIME类型
      let fileExt = '';
      if (book.fileType.includes('text/plain')) {
        fileExt = 'txt';
      } else if (book.fileType.includes('application/pdf')) {
        fileExt = 'pdf';
      } else if (book.fileType.includes('application/epub+zip')) {
        fileExt = 'epub';
      } else {
        // 尝试从URI获取扩展名
        const uriParts = fileUri.split('.');
        if (uriParts.length > 1) {
          fileExt = uriParts[uriParts.length - 1].toLowerCase();
        }
      }
      
      // 为书籍创建唯一标识的文件名
      const localFileName = `${book.id}.${fileExt}`;
      const localFilePath = BOOKS_DIR + localFileName;
      
      console.log('正在复制文件:', fileUri, '到', localFilePath);
      
      // 如果是文本文件，先读取内容，再写入，避免编码问题
      if (fileExt === 'txt') {
        try {
          // 先从临时位置读取文本内容
          const content = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.UTF8
          });
          
          // 缓存内容，避免后续读取问题
          contentCache[localFilePath] = content;
          
          // 将内容写入到目标位置
          await FileSystem.writeAsStringAsync(localFilePath, content, {
            encoding: FileSystem.EncodingType.UTF8
          });
        } catch (readError) {
          console.error('读取并写入文本文件失败，尝试直接复制:', readError);
          // 如果读取失败，回退到直接复制文件
          await FileSystem.copyAsync({
            from: fileUri,
            to: localFilePath
          });
        }
      } else {
        // 非文本文件直接复制
        await FileSystem.copyAsync({
          from: fileUri,
          to: localFilePath
        });
      }
      
      // 验证文件是否可读
      const isReadable = await BookStorage.isFileReadable(localFilePath);
      if (!isReadable) {
        throw new Error(`文件${localFilePath}无法读取`);
      }
      
      // 更新书籍的存储路径
      const updatedBook: Book = {
        ...book,
        filePath: localFilePath
      };
      
      // 获取现有书籍并添加新书
      const books = await BookStorage.getAllBooks();
      books.push(updatedBook);
      await BookStorage.saveBooks(books);
      
      console.log(`书籍 "${book.title}" 已添加并存储在 ${localFilePath}`);
      return updatedBook;
    } catch (error) {
      console.error('添加书籍失败:', error);
      throw error;
    }
  },

  /**
   * 获取指定书籍
   */
  getBook: async (bookId: string): Promise<Book | null> => {
    try {
      const books = await BookStorage.getAllBooks();
      const book = books.find(book => book.id === bookId) || null;
      
      // 如果找到书籍，验证文件是否存在并可读
      if (book) {
        const isReadable = await BookStorage.isFileReadable(book.filePath);
        if (!isReadable) {
          console.warn(`书籍(${book.title})的文件不可读: ${book.filePath}`);
          // 返回书籍，但在后续读取时会处理错误
        }
      }
      
      return book;
    } catch (error) {
      console.error('获取书籍详情失败:', error);
      return null;
    }
  },

  /**
   * 读取书籍内容
   */
  readBookContent: async (filePath: string, fileType: string): Promise<string> => {
    // 检查缓存中是否有内容
    if (contentCache[filePath]) {
      console.log('从缓存读取内容');
      return contentCache[filePath];
    }
    
    try {
      let content = '';
      
      if (fileType.includes('text/plain')) {
        // 处理TXT文件
        try {
          // 首先尝试UTF-8编码
          content = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.UTF8
          });
        } catch (e) {
          console.warn('UTF-8读取失败，尝试Base64编码:', e);
          
          // 如果UTF-8失败，尝试Base64
          const base64Content = await FileSystem.readAsStringAsync(filePath, {
            encoding: FileSystem.EncodingType.Base64
          });
          
          // 将Base64转换为文本
          content = Buffer.from(base64Content, 'base64').toString('utf8');
        }
        
        // 缓存内容
        contentCache[filePath] = content;
      } else if (fileType.includes('application/pdf')) {
        content = "PDF文件需要特殊查看器，暂不支持";
      } else if (fileType.includes('application/epub+zip')) {
        content = "EPUB文件需要特殊解析器，暂不支持";
      }
      
      return content;
    } catch (error) {
      console.error('读取书籍内容失败:', error);
      throw error;
    }
  },

  /**
   * 更新书籍数据
   */
  updateBook: async (updatedBook: Book): Promise<void> => {
    try {
      const books = await BookStorage.getAllBooks();
      const index = books.findIndex(book => book.id === updatedBook.id);
      
      if (index !== -1) {
        books[index] = updatedBook;
        await BookStorage.saveBooks(books);
        console.log(`书籍 "${updatedBook.title}" 已更新`);
      } else {
        throw new Error(`未找到ID为 ${updatedBook.id} 的书籍`);
      }
    } catch (error) {
      console.error('更新书籍失败:', error);
      throw error;
    }
  },

  /**
   * 删除书籍
   */
  deleteBook: async (bookId: string): Promise<void> => {
    try {
      const books = await BookStorage.getAllBooks();
      const bookToDelete = books.find(book => book.id === bookId);
      
      if (bookToDelete) {
        // 删除本地文件
        try {
          await FileSystem.deleteAsync(bookToDelete.filePath);
        } catch (fileError) {
          console.warn('删除书籍文件失败:', fileError);
          // 继续删除书籍记录，即使文件删除失败
        }
        
        // 从列表中移除书籍
        const updatedBooks = books.filter(book => book.id !== bookId);
        await BookStorage.saveBooks(updatedBooks);
        console.log(`书籍 "${bookToDelete.title}" 已删除`);
      }
    } catch (error) {
      console.error('删除书籍失败:', error);
      throw error;
    }
  }
}; 