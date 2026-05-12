import {
  getChapterRelativePageIndex,
  findScrollModeStartSentence,
  determineTtsStartPoint,
  ScrollModeChapter,
  ScrollModeLayout,
  TtsStartChapter,
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

describe('determineTtsStartPoint', () => {
  const CONTENT_PADDING_TOP = 40;
  const CHAPTER_MARGIN_BOTTOM = 40;

  const makeTtsChapter = (
    id: string,
    contentLength: number,
    sentenceCount: number
  ): TtsStartChapter => {
    const sentenceLen = Math.floor(contentLength / sentenceCount);
    const sentences = Array.from({ length: sentenceCount }, (_, i) => ({
      start: i * sentenceLen,
      end: i === sentenceCount - 1 ? contentLength : (i + 1) * sentenceLen,
    }));
    return {
      chapter: { id },
      content: 'x'.repeat(contentLength),
      sentences,
    };
  };

  it('uses scroll position in scroll mode even when viewableFirstItem is null (chapter-jump regression)', () => {
    // Repro of the reported bug: after jumping to a chapter via the TOC, the
    // user scrolls down a page or two and then taps TTS. Because viewability
    // events haven't refired since the jump, viewableFirstItem is null. The
    // previous code gated the whole start-point calculation on that ref and
    // fell through to sentence 0. With the fix, we still derive the start
    // sentence from the live scroll position.
    const chapter = makeTtsChapter('jumped-to', 2000, 40);
    const result = determineTtsStartPoint({
      flipMode: 'scroll',
      chaptersData: [chapter],
      viewableFirstItem: null, // not yet populated after chapter jump
      chapterLayouts: { 'jumped-to': { height: 5000 } },
      scrollY: 2540, // ~50% into the chapter
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
    });
    expect(result.chapterId).toBe('jumped-to');
    expect(result.sentenceIndex).toBeGreaterThan(0);
    // 2540 - 40 = 2500; 2500/5000 = 0.5; 0.5 * 2000 = 1000;
    // sentence covering chars [1000, 1050) → index 20
    expect(result.sentenceIndex).toBe(20);
  });

  it('returns chapter head in scroll mode when scrollY is 0 (fresh chapter jump, no manual scroll)', () => {
    const chapter = makeTtsChapter('jumped-to', 2000, 40);
    const result = determineTtsStartPoint({
      flipMode: 'scroll',
      chaptersData: [chapter],
      viewableFirstItem: null,
      chapterLayouts: { 'jumped-to': { height: 5000 } },
      scrollY: 0,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
    });
    expect(result).toEqual({ chapterId: 'jumped-to', sentenceIndex: 0 });
  });

  it('prefers viewableFirstItem.chapter.id as fallback chapter when scroll layout has no match', () => {
    const chapter = makeTtsChapter('ch1', 1000, 20);
    const result = determineTtsStartPoint({
      flipMode: 'scroll',
      chaptersData: [chapter],
      viewableFirstItem: { chapter: { id: 'ch1' } },
      chapterLayouts: {}, // no layouts → for-loop in findScrollModeStartSentence won't match
      scrollY: 1000,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
    });
    expect(result.chapterId).toBe('ch1');
    expect(result.sentenceIndex).toBe(0);
  });

  it('horizontal mode: uses page charStart to find the start sentence', () => {
    const chapter = makeTtsChapter('ch1', 1000, 20);
    const result = determineTtsStartPoint({
      flipMode: 'horizontal',
      chaptersData: [chapter],
      viewableFirstItem: { chapter: { id: 'ch1' }, charStart: 500 },
      chapterLayouts: {},
      scrollY: 0,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
    });
    expect(result.chapterId).toBe('ch1');
    // sentence covering chars [500, 550) → index 10 (s.end=550 > 500)
    expect(result.sentenceIndex).toBe(10);
  });

  it('horizontal mode: returns sentence 0 when no viewable page is provided', () => {
    const chapter = makeTtsChapter('ch1', 1000, 20);
    const result = determineTtsStartPoint({
      flipMode: 'horizontal',
      chaptersData: [chapter],
      viewableFirstItem: null,
      chapterLayouts: {},
      scrollY: 0,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
    });
    expect(result).toEqual({ chapterId: 'ch1', sentenceIndex: 0 });
  });

  it('returns undefined chapterId with sentenceIndex=0 when chaptersData is empty', () => {
    const result = determineTtsStartPoint({
      flipMode: 'scroll',
      chaptersData: [],
      viewableFirstItem: null,
      chapterLayouts: {},
      scrollY: 1000,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
    });
    expect(result.sentenceIndex).toBe(0);
    expect(result.chapterId).toBeFalsy();
  });

  it('aligns the start sentence with the follow-anchor when scrollFocusOffset is provided', () => {
    // ReaderScreen anchors the speaking sentence at 40% from the top of the
    // viewport while TTS auto-scrolls. The start point must use the same
    // anchor so the sentence picked when TTS begins is the same one auto-scroll
    // keeps in view. Without the offset (focusOffset defaults to 2) we'd start
    // at a sentence near the top of the viewport — i.e. content the user has
    // typically already read past.
    const chapter = makeTtsChapter('ch1', 2000, 40);
    const viewportHeight = 800;
    const focus = viewportHeight * 0.4; // 320

    // Anchored at top of viewport (legacy behavior, kept as default):
    const atTop = determineTtsStartPoint({
      flipMode: 'scroll',
      chaptersData: [chapter],
      viewableFirstItem: { chapter: { id: 'ch1' } },
      chapterLayouts: { ch1: { height: 5000 } },
      scrollY: 1000,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
    });
    // focusY = 1002; ratio = (1002-40)/5000 = 0.1924; offset = 384;
    // sentence covering chars [350, 400) → index 7
    expect(atTop.sentenceIndex).toBe(7);

    // Anchored at the follow point (~40% from top):
    const aligned = determineTtsStartPoint({
      flipMode: 'scroll',
      chaptersData: [chapter],
      viewableFirstItem: { chapter: { id: 'ch1' } },
      chapterLayouts: { ch1: { height: 5000 } },
      scrollY: 1000,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
      scrollFocusOffset: focus,
    });
    // focusY = 1000 + 320 = 1320; ratio = (1320-40)/5000 = 0.256; offset = 512;
    // sentence covering chars [500, 550) → index 10
    expect(aligned.sentenceIndex).toBe(10);
    expect(aligned.sentenceIndex).toBeGreaterThan(atTop.sentenceIndex);
  });

  it('scrollFocusOffset is ignored in horizontal mode', () => {
    const chapter = makeTtsChapter('ch1', 1000, 20);
    const result = determineTtsStartPoint({
      flipMode: 'horizontal',
      chaptersData: [chapter],
      viewableFirstItem: { chapter: { id: 'ch1' }, charStart: 500 },
      chapterLayouts: {},
      scrollY: 0,
      contentPaddingTop: CONTENT_PADDING_TOP,
      chapterMarginBottom: CHAPTER_MARGIN_BOTTOM,
      scrollFocusOffset: 320, // should not affect horizontal mode
    });
    expect(result.sentenceIndex).toBe(10);
  });
});
