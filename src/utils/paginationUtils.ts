const SENTENCE_BREAK_REGEX = /[\n。！？；!?;.]/;
const SENTENCE_BREAK_SEARCH_RANGE = 120;
const WORD_BREAK_SEARCH_RANGE = 40;

export function splitChapterIntoPages(content: string, charsPerLine: number, linesPerPage: number): string[] {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.trim()) return [''];
  if (charsPerLine <= 0 || linesPerPage <= 0) return [normalized];

  const pages: string[] = [];
  let pos = 0;

  while (pos < normalized.length) {
    let lineCount = 0;
    let lineChars = 0;
    let i = pos;

    for (; i < normalized.length; i++) {
      const char = normalized[i];

      if (char === '\n') {
        lineCount++;
        lineChars = 0;
        if (lineCount >= linesPerPage) {
          i++;
          break;
        }
      } else {
        lineChars++;
        if (lineChars > charsPerLine) {
          lineCount++;
          lineChars = 1;
          if (lineCount >= linesPerPage) {
            break;
          }
        }
      }
    }

    if (i >= normalized.length) {
      pages.push(normalized.slice(pos));
      break;
    }

    const sentenceSearchStart = Math.max(pos, i - SENTENCE_BREAK_SEARCH_RANGE);
    let breakAt = -1;

    for (let j = i - 1; j >= sentenceSearchStart; j--) {
      if (SENTENCE_BREAK_REGEX.test(normalized[j])) {
        breakAt = j + 1;
        break;
      }
    }

    if (breakAt <= pos) {
      const wordSearchStart = Math.max(pos, i - WORD_BREAK_SEARCH_RANGE);
      for (let j = i - 1; j >= wordSearchStart; j--) {
        if (normalized[j] === ' ') {
          breakAt = j + 1;
          break;
        }
      }
    }

    const pageEnd = breakAt > pos ? breakAt : i;
    pages.push(normalized.slice(pos, pageEnd));
    pos = pageEnd;
  }

  return pages.length > 0 ? pages : [''];
}
