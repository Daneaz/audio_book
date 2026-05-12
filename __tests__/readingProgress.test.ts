import {
  getChapterRelativePageIndex,
  findScrollModeStartSentence,
  ScrollModeChapter,
  ScrollModeLayout,
} from '../src/utils/readingProgress';

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

describe('findScrollModeStartSentence', () => {
  // Build a chapter with N evenly-sized sentences. Sentence i covers
  // characters [i*sentenceLen, (i+1)*sentenceLen).
  const makeChapter = (id: string, contentLength: number, sentenceCount: number): ScrollModeChapter => {
    const sentenceLen = Math.floor(contentLength / sentenceCount);
    const sentences = Array.from({ length: sentenceCount }, (_, i) => ({
      start: i * sentenceLen,
      end: i === sentenceCount - 1 ? contentLength : (i + 1) * sentenceLen,
    }));
    return { id, contentLength, sentences };
  };

  const CONTENT_PADDING_TOP = 40;
  const CHAPTER_MARGIN_BOTTOM = 40;

  it('returns chapter head when the user is scrolled to the very top', () => {
    const chapter = makeChapter('ch1', 1000, 20);
    const result = findScrollModeStartSentence({
      scrollY: 0,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
      chapters: [chapter],
      layouts: { ch1: { height: 5000 } },
      fallbackChapterId: 'ch1',
    });
    expect(result).toEqual({ chapterId: 'ch1', sentenceIndex: 0 });
  });

  it('returns a sentence past the chapter head when the user has scrolled into the chapter', () => {
    // Chapter rendered at y ∈ [40, 5040). User scrolled to y=1040 → ~20% in.
    const chapter = makeChapter('ch1', 1000, 20);
    const result = findScrollModeStartSentence({
      scrollY: 1040,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
      chapters: [chapter],
      layouts: { ch1: { height: 5000 } },
      fallbackChapterId: 'ch1',
    });
    // 20% into 1000 chars = char 200 → sentence index 4 (sentence covering chars [200, 250)
    // start>200 would skip to sentence 5; end>200 keeps sentence 4 (200-250) since 250>200... wait,
    // sentenceLen = 50, so sentence 4 is [200, 250) and end=250 > 200 ✓.
    expect(result.chapterId).toBe('ch1');
    expect(result.sentenceIndex).toBeGreaterThan(0);
    expect(result.sentenceIndex).toBe(4);
  });

  it('does NOT restart from chapter head when EPUB content has no newlines (regression)', () => {
    // EPUB chapters join block texts without \n separators. The previous
    // implementation walked back to the nearest "\n" to find a paragraph start,
    // which always reached char 0 for such content and made TTS restart at the
    // chapter header. This test pins down the fixed behavior.
    const chapter: ScrollModeChapter = {
      id: 'epub-ch1',
      // Single long string with no newlines anywhere, just like an EPUB chapter
      // after blocks.map(b => b.text).join('').
      contentLength: 2000,
      sentences: Array.from({ length: 40 }, (_, i) => ({
        start: i * 50,
        end: i === 39 ? 2000 : (i + 1) * 50,
      })),
    };
    // User scrolled ~50% into the chapter.
    const result = findScrollModeStartSentence({
      scrollY: 2540,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
      chapters: [chapter],
      layouts: { 'epub-ch1': { height: 5000 } },
      fallbackChapterId: 'epub-ch1',
    });
    expect(result.chapterId).toBe('epub-ch1');
    expect(result.sentenceIndex).toBeGreaterThan(0);
    // 2540 - 40 = 2500; ratio = 2500/5000 = 0.5; estimatedCharOffset = 1000
    // sentence covering chars [1000, 1050) → index 20 (sentence.end=1050 > 1000)
    expect(result.sentenceIndex).toBe(20);
  });

  it('returns chapter head when the user is in a chapter title area (just past the top)', () => {
    // Very small scroll — should still start from sentence 0 since the user
    // is effectively at the chapter head.
    const chapter = makeChapter('ch1', 1000, 20);
    const result = findScrollModeStartSentence({
      scrollY: 10,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
      chapters: [chapter],
      layouts: { ch1: { height: 5000 } },
      fallbackChapterId: 'ch1',
    });
    expect(result).toEqual({ chapterId: 'ch1', sentenceIndex: 0 });
  });

  it('locates the right chapter when there are multiple loaded chapters', () => {
    const ch1 = makeChapter('ch1', 1000, 20);
    const ch2 = makeChapter('ch2', 1000, 20);
    // ch1 spans y ∈ [40, 3040), gap ∈ [3040, 3080), ch2 spans y ∈ [3080, 5080).
    const layouts: Record<string, ScrollModeLayout> = {
      ch1: { height: 3000 },
      ch2: { height: 2000 },
    };

    const inCh2 = findScrollModeStartSentence({
      scrollY: 4000, // well inside ch2
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
      chapters: [ch1, ch2],
      layouts,
      fallbackChapterId: 'ch2',
    });
    expect(inCh2.chapterId).toBe('ch2');
    expect(inCh2.sentenceIndex).toBeGreaterThan(0);

    const inCh1 = findScrollModeStartSentence({
      scrollY: 1500, // halfway into ch1
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
      chapters: [ch1, ch2],
      layouts,
      fallbackChapterId: 'ch1',
    });
    expect(inCh1.chapterId).toBe('ch1');
    expect(inCh1.sentenceIndex).toBeGreaterThan(0);
  });

  it('falls back to the visible chapter head when no layout matches the focus position', () => {
    const ch1 = makeChapter('ch1', 1000, 20);
    const result = findScrollModeStartSentence({
      scrollY: 100000, // way past end of chapter
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
      chapters: [ch1],
      layouts: { ch1: { height: 5000 } },
      fallbackChapterId: 'ch1',
    });
    expect(result).toEqual({ chapterId: 'ch1', sentenceIndex: 0 });
  });

  it('returns the last sentence when the estimated offset is past the last sentence', () => {
    // Edge case: when the estimated character offset exceeds all sentence ends
    // (e.g. trailing whitespace counted in content but not in sentences).
    const chapter: ScrollModeChapter = {
      id: 'ch1',
      contentLength: 1000,
      sentences: [
        { start: 0, end: 100 },
        { start: 100, end: 200 },
      ],
    };
    const result = findScrollModeStartSentence({
      scrollY: 4900, // close to bottom of chapter at y ∈ [40, 5040)
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
      chapters: [chapter],
      layouts: { ch1: { height: 5000 } },
      fallbackChapterId: 'ch1',
    });
    expect(result.chapterId).toBe('ch1');
    expect(result.sentenceIndex).toBe(1); // last sentence
  });

  it('returns sentenceIndex=0 with fallback when there are no loaded chapters', () => {
    const result = findScrollModeStartSentence({
      scrollY: 100,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
      chapters: [],
      layouts: {},
      fallbackChapterId: 'ch1',
    });
    expect(result).toEqual({ chapterId: 'ch1', sentenceIndex: 0 });
  });
});
