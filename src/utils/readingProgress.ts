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
 * sentence that visually overlaps the top of the viewport directly.
 */
export function findScrollModeStartSentence({
  scrollY,
  contentPaddingTop,
  chapterMarginBottom,
  chapters,
  layouts,
  fallbackChapterId,
}: FindScrollModeStartSentenceParams): ScrollModeStartSentence {
  if (chapters.length === 0) {
    return { chapterId: fallbackChapterId ?? null, sentenceIndex: 0 };
  }

  const focusY = scrollY + 2;
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
