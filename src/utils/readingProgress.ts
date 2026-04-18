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
