import { splitChapterIntoPages } from '../src/utils/paginationUtils';

describe('splitChapterIntoPages', () => {
  it('does not split English words across page boundaries', () => {
    // charsPerLine=8, linesPerPage=1 forces breaks in the middle of content
    const content = 'one two three four five six seven';
    const pages = splitChapterIntoPages(content, 8, 1);

    expect(pages.join('')).toBe(content);

    for (let p = 0; p < pages.length - 1; p++) {
      const lastChar = pages[p][pages[p].length - 1];
      const firstChar = pages[p + 1][0];
      // A word character immediately followed by another word character means a word was split
      expect(/\w/.test(lastChar) && /\w/.test(firstChar)).toBe(false);
    }
  });

  it('prefers sentence breaks over word breaks', () => {
    // "End it. Next" - sentence break at "." should be preferred over space in "Next words"
    const content = 'End it. Next words here and some more text now';
    const pages = splitChapterIntoPages(content, 7, 1);

    // First page should end at the sentence break after "it." (space stays on next page)
    expect(pages[0]).toBe('End it.');
  });

  it('falls back to word break when no sentence break exists in range', () => {
    const content = 'apple banana cherry durian elderberry fig grape honeydew';
    const pages = splitChapterIntoPages(content, 12, 1);

    expect(pages.join('')).toBe(content);
    for (let p = 0; p < pages.length - 1; p++) {
      const lastChar = pages[p][pages[p].length - 1];
      const firstChar = pages[p + 1][0];
      expect(/\w/.test(lastChar) && /\w/.test(firstChar)).toBe(false);
    }
  });

  it('returns the full content for single-page content', () => {
    const content = 'Short text.';
    const pages = splitChapterIntoPages(content, 100, 10);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toBe(content);
  });

  it('handles Chinese text without splitting characters', () => {
    const content = '一二三四五六七八九十一二三四五六七八九十';
    const pages = splitChapterIntoPages(content, 5, 1);
    expect(pages.join('')).toBe(content);
    // Chinese has no spaces, just verify round-trip
  });
});
