import BookService from '../src/services/BookService';
import StorageService from '../src/services/StorageService';
import { STORAGE_KEYS } from '../src/utils/constants';

jest.mock('../src/services/StorageService', () => ({
  __esModule: true,
  default: {
    getData: jest.fn(),
    storeData: jest.fn(),
    removeData: jest.fn(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file://documents/',
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

describe('BookService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should get books from storage', async () => {
    const mockBooks = [{ id: '1', title: 'Test Book' }];
    (StorageService.getData as jest.Mock).mockResolvedValue(mockBooks);

    const books = await BookService.getBooks();
    expect(books).toEqual(mockBooks);
    expect(StorageService.getData).toHaveBeenCalledWith(STORAGE_KEYS.BOOKS);
  });

  it('should return empty array if no books', async () => {
    (StorageService.getData as jest.Mock).mockResolvedValue(null);

    const books = await BookService.getBooks();
    expect(books).toEqual([]);
  });

  // More tests can be added for addBook, removeBook
});
