# Demo Book Content Update (ZH+EN)

## Goal

Update the built-in demo book contents used by the one-click import entry on the Bookshelf empty state so that:

- Clicking once imports two books: Chinese + English.
- Each book uses a 3-chapter structure.
- Chapter 1 is expanded to ~800–1200 words to better demonstrate scrolling reading and TTS.
- The change is applied only to in-app embedded content (no updates to docs/*.txt files).

## Scope

In scope:

- Update `src/utils/demoBook.ts` contents for ZH/EN demo books.
- Keep chapter detection compatible with existing `ChapterService.parseChapters()` patterns.

Out of scope:

- Reading demo content from `docs/` at runtime.
- Changing chapter parsing logic.
- Updating `docs/demo_book_zh.txt` / `docs/demo_book_en.txt`.

## Chapter Structure

### Chinese Demo Book

- Chapter headers: `第1章` / `第2章` / `第3章`
- Chapter 1: expand to ~800–1200 Chinese characters with multiple paragraphs and in-chapter sub-sections.
  - Sub-sections must NOT introduce new chapter-detection headers (avoid patterns like `Section 1`, `Chapter X`, `第X章` inside the chapter).
  - Prefer neutral separators like `【】` / `—` / blank lines.
- Chapter 2: short “how to read” guide.
- Chapter 3: short “TTS / demo tips” guide.

### English Demo Book

- Chapter headers: `Chapter 1` / `Chapter 2` / `Chapter 3`
- Chapter 1: expand to ~800–1200 English words-equivalent length (roughly comparable reading time).
  - Avoid `Section X` lines (the parser matches `Section\\s+\\d+`).
  - Use neutral sub-headings like `—` lines or bracketed labels.
- Chapter 2: short “reading” guide.
- Chapter 3: short “TTS / demo tips” guide.

## Acceptance Criteria

- After tapping “Download Demo Books (ZH+EN)”, the shelf shows two new items (if they do not already exist).
- Both books display `totalChapters = 3` after import.
- Reader can open and navigate through 3 chapters for each book.
- Chapter 1 content is visibly longer than current version and reads naturally.

## Files

- Update: `src/utils/demoBook.ts`
