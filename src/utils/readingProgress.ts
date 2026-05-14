type PageLike = {
  id: string;
  chapter: {
    id: string;
  };
};

export function getChapterRelativePageIndex<T extends PageLike>(
  pages: T[],
  pageId: string
): number {
  const pageIndex = pages.findIndex((page) => page.id === pageId);
  if (pageIndex === -1) {
    return 0;
  }

  const chapterId = pages[pageIndex]?.chapter.id;
  const chapterStartIndex = pages.findIndex((page) => page.chapter.id === chapterId);
  if (chapterStartIndex === -1) {
    return 0;
  }

  return Math.max(0, pageIndex - chapterStartIndex);
}

export function getChapterRelativePageIndexFromGlobalIndex<T extends PageLike>(
  pages: T[],
  globalPageIndex: number,
  chapterId: string
): number {
  if (pages.length === 0) {
    return 0;
  }

  const safeGlobalIndex = Math.max(0, Math.min(pages.length - 1, globalPageIndex));
  const chapterStartIndex = pages.findIndex((page) => page.chapter.id === chapterId);
  if (chapterStartIndex === -1) {
    return 0;
  }

  return Math.max(0, safeGlobalIndex - chapterStartIndex);
}

export type SentenceRange = { start: number; end: number };

export type ScrollModeChapter = {
  id: string;
  contentLength: number;
  sentences: SentenceRange[];
};

export type ScrollModeLayout = { height: number };

export type FindScrollModeStartSentenceParams = {
  scrollY: number;
  contentPaddingTop: number;
  chapterMarginBottom: number;
  chapters: ScrollModeChapter[];
  layouts: Record<string, ScrollModeLayout | undefined>;
  fallbackChapterId?: string | null;
  /**
   * Pixels below `scrollY` that count as the focus point inside the viewport.
   * Default is 2 (top of the visible area). Pass `viewportHeight * ratio` to
   * align the start point with where TTS auto-scroll keeps the speaking
   * sentence (e.g. 40% from the top of the viewport).
   */
  focusOffset?: number;
};

export type ScrollModeStartSentence = {
  chapterId: string | null;
  sentenceIndex: number;
};

/**
 * Picks the chapter + sentence where TTS should start in scroll mode based on
 * the user's current scroll position.
 *
 * The previous implementation walked back from the estimated character offset
 * to the nearest "\n" to find a paragraph start, then picked the first
 * sentence at or past that offset. That logic broke for EPUB chapters, whose
 * `content` is assembled by joining block texts without newline separators —
 * the walk-back always reached char 0 and TTS would restart at the chapter
 * header instead of the user's current page. This function instead finds the
 * sentence that visually overlaps the focus point inside the viewport.
 */
export function findScrollModeStartSentence({
  scrollY,
  contentPaddingTop,
  chapterMarginBottom,
  chapters,
  layouts,
  fallbackChapterId,
  focusOffset,
}: FindScrollModeStartSentenceParams): ScrollModeStartSentence {
  if (chapters.length === 0) {
    return { chapterId: fallbackChapterId ?? null, sentenceIndex: 0 };
  }

  const focusY = scrollY + (focusOffset ?? 2);
  let cursorY = contentPaddingTop;

  for (const chapter of chapters) {
    const layout = layouts[chapter.id];
    if (!layout) continue;

    const chapterTop = cursorY;
    const chapterBottom = chapterTop + layout.height;

    if (focusY >= chapterTop && focusY < chapterBottom) {
      const ratio = Math.max(
        0,
        Math.min(1, (focusY - chapterTop) / Math.max(1, layout.height))
      );
      const estimatedCharOffset = Math.floor(ratio * chapter.contentLength);

      const sIdx = chapter.sentences.findIndex((s) => s.end > estimatedCharOffset);

      return {
        chapterId: chapter.id,
        sentenceIndex: sIdx !== -1 ? sIdx : Math.max(0, chapter.sentences.length - 1),
      };
    }

    cursorY = chapterBottom + chapterMarginBottom;
  }

  return {
    chapterId: fallbackChapterId ?? chapters[0].id,
    sentenceIndex: 0,
  };
}

export type TtsStartFlipMode = 'horizontal' | 'scroll';

export type TtsStartChapter = {
  chapter: { id: string };
  content: string;
  sentences: SentenceRange[];
};

export type TtsStartViewableItem = {
  chapter: { id: string };
  charStart?: number;
};

export type DetermineTtsStartPointParams = {
  flipMode: TtsStartFlipMode;
  chaptersData: TtsStartChapter[];
  viewableFirstItem?: TtsStartViewableItem | null;
  chapterLayouts: Record<string, ScrollModeLayout | undefined>;
  scrollY: number;
  contentPaddingTop: number;
  chapterMarginBottom: number;
  /**
   * Scroll-mode only. Pixels below `scrollY` that mark the visual focus point.
   * Pass `viewportHeight * followAnchorRatio` so the sentence picked when TTS
   * starts is the same one auto-scroll keeps anchored while TTS is playing.
   */
  scrollFocusOffset?: number;
};

export type DetermineTtsStartPointResult = {
  chapterId: string | undefined;
  sentenceIndex: number;
};

/**
 * Picks the chapter + sentence index where TTS should start when the user
 * presses play. In scroll mode the decision is driven purely by the current
 * scroll position — we deliberately do NOT gate it on `viewableFirstItem`
 * because that ref is reset on chapter jump and the FlatList's viewability
 * callback may not have refired by the time the user scrolls + taps TTS.
 * Gating on it would make TTS restart from the chapter header (the regression
 * this helper guards against).
 */
export function determineTtsStartPoint(
  params: DetermineTtsStartPointParams
): DetermineTtsStartPointResult {
  let startChapterId: string | undefined = params.chaptersData[0]?.chapter.id;
  let startSentenceIndex = 0;

  if (params.viewableFirstItem) {
    startChapterId = params.viewableFirstItem.chapter.id;
  }

  if (params.flipMode === 'horizontal') {
    const firstVisible = params.viewableFirstItem;
    if (firstVisible && typeof firstVisible.charStart === 'number') {
      const chData = params.chaptersData.find(
        (c) => c.chapter.id === startChapterId
      );
      if (chData) {
        const pageStartNorm = firstVisible.charStart;
        const sIdx = chData.sentences.findIndex((s) => s.start >= pageStartNorm);
        startSentenceIndex = sIdx !== -1 ? sIdx : 0;
      }
    }
    return { chapterId: startChapterId, sentenceIndex: startSentenceIndex };
  }

  const scrollPoint = findScrollModeStartSentence({
    scrollY: params.scrollY,
    contentPaddingTop: params.contentPaddingTop,
    chapterMarginBottom: params.chapterMarginBottom,
    chapters: params.chaptersData.map((c) => ({
      id: c.chapter.id,
      contentLength: c.content.length,
      sentences: c.sentences,
    })),
    layouts: params.chapterLayouts,
    fallbackChapterId: startChapterId ?? null,
    focusOffset: params.scrollFocusOffset,
  });
  if (scrollPoint.chapterId) {
    startChapterId = scrollPoint.chapterId;
  }
  startSentenceIndex = scrollPoint.sentenceIndex;
  return { chapterId: startChapterId, sentenceIndex: startSentenceIndex };
}
