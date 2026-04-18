import { getChapterRelativePageIndex } from '../src/utils/readingProgress';

describe('getChapterRelativePageIndex', () => {
  it('returns the page index relative to its chapter instead of the global page index', () => {
    const pages = [
      { id: 'ch1_page_1', chapter: { id: 'ch1' } },
      { id: 'ch1_page_2', chapter: { id: 'ch1' } },
      { id: 'ch2_page_1', chapter: { id: 'ch2' } },
      { id: 'ch2_page_2', chapter: { id: 'ch2' } },
      { id: 'ch2_page_3', chapter: { id: 'ch2' } },
    ];

    expect(getChapterRelativePageIndex(pages, 'ch2_page_1')).toBe(0);
    expect(getChapterRelativePageIndex(pages, 'ch2_page_3')).toBe(2);
  });

  it('falls back to zero when the page cannot be found', () => {
    const pages = [
      { id: 'ch1_page_1', chapter: { id: 'ch1' } },
      { id: 'ch2_page_1', chapter: { id: 'ch2' } },
    ];

    expect(getChapterRelativePageIndex(pages, 'missing')).toBe(0);
  });
});
