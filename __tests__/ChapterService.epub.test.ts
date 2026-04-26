import ChapterService from '../src/services/ChapterService';
import { readAsStringAsync, getInfoAsync } from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid' }));

describe('ChapterService.getChapterBlocks', () => {
  beforeEach(() => {
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
  });

  it('parses h1, h2, p tags into blocks', async () => {
    (readAsStringAsync as jest.Mock).mockResolvedValue(
      `<html><body><h1>Title</h1><p>First para.</p><p>Second para.</p></body></html>`
    );
    const blocks = await ChapterService.getChapterBlocks('epub_b1/ch1.xhtml');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({ type: 'h1', text: 'Title', flatStart: 0, flatEnd: 5 });
    expect(blocks[1]).toEqual({ type: 'p', text: 'First para.', flatStart: 5, flatEnd: 16 });
    expect(blocks[2]).toEqual({ type: 'p', text: 'Second para.', flatStart: 16, flatEnd: 28 });
  });

  it('strips inline tags from block text', async () => {
    (readAsStringAsync as jest.Mock).mockResolvedValue(
      `<p>Hello <em>world</em>.</p>`
    );
    const blocks = await ChapterService.getChapterBlocks('epub_b1/ch1.xhtml');
    expect(blocks[0].text).toBe('Hello world.');
  });

  it('decodes HTML entities', async () => {
    (readAsStringAsync as jest.Mock).mockResolvedValue(
      `<p>a &amp; b &lt;c&gt; &nbsp;d</p>`
    );
    const blocks = await ChapterService.getChapterBlocks('epub_b1/ch1.xhtml');
    expect(blocks[0].text).toBe('a & b <c>  d');
  });

  it('skips empty blocks', async () => {
    (readAsStringAsync as jest.Mock).mockResolvedValue(
      `<p>   </p><p>Real content.</p>`
    );
    const blocks = await ChapterService.getChapterBlocks('epub_b1/ch1.xhtml');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Real content.');
  });
});
