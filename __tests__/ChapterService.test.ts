import ChapterService from '../src/services/ChapterService';
import { getInfoAsync, readAsStringAsync } from 'expo-file-system/legacy';
import { DEMO_BOOK_EN_CONTENT, DEMO_BOOK_ZH_CONTENT } from '../src/utils/demoBook';

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid',
}));

describe('ChapterService', () => {
  it('should parse chapters correctly', async () => {
    const mockContent = `
    第1章 Title 1
    Content 1
    第2章 Title 2
    Content 2
    `;
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (readAsStringAsync as jest.Mock).mockResolvedValue(mockContent);

    const chapters = await ChapterService.parseChapters('book1', 'path/to/file');
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0].title).toContain('第1章');
  });

  it('should fallback to length splitting if no chapters found', async () => {
    const mockContent = 'a'.repeat(10000); // 10k chars
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (readAsStringAsync as jest.Mock).mockResolvedValue(mockContent);

    const chapters = await ChapterService.parseChapters('book1', 'path/to/file');
    // Default chunk size 5000 -> 2 chapters
    expect(chapters.length).toBe(2);
  });

  it('should parse zh demo book into exactly 3 chapters', async () => {
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (readAsStringAsync as jest.Mock).mockResolvedValue(DEMO_BOOK_ZH_CONTENT);

    const chapters = await ChapterService.parseChapters('demo-zh', 'path/to/demo_zh.txt');
    expect(chapters.length).toBe(3);
    expect(chapters[0].title).toContain('第1章');
    expect(chapters[1].title).toContain('第2章');
    expect(chapters[2].title).toContain('第3章');
  });

  it('should parse en demo book into exactly 3 chapters', async () => {
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (readAsStringAsync as jest.Mock).mockResolvedValue(DEMO_BOOK_EN_CONTENT);

    const chapters = await ChapterService.parseChapters('demo-en', 'path/to/demo_en.txt');
    expect(chapters.length).toBe(3);
    expect(chapters[0].title).toContain('Chapter 1');
    expect(chapters[1].title).toContain('Chapter 2');
    expect(chapters[2].title).toContain('Chapter 3');
  });
});
