import ChapterService from '../src/services/ChapterService';
import * as FileSystem from 'expo-file-system';

jest.mock('expo-file-system');

describe('ChapterService', () => {
  it('should parse chapters correctly', async () => {
    const mockContent = `
    第1章 Title 1
    Content 1
    第2章 Title 2
    Content 2
    `;
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(mockContent);

    const chapters = await ChapterService.parseChapters('book1', 'path/to/file');
    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0].title).toContain('第1章');
  });

  it('should fallback to length splitting if no chapters found', async () => {
    const mockContent = 'a'.repeat(10000); // 10k chars
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(mockContent);

    const chapters = await ChapterService.parseChapters('book1', 'path/to/file');
    // Default chunk size 5000 -> 2 chapters
    expect(chapters.length).toBe(2);
  });
});
