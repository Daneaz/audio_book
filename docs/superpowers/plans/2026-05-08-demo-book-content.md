# Demo Book Content Update (ZH+EN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand Chapter 1 and restructure both built-in demo books (ZH+EN) into 3 chapters, while keeping chapter parsing stable.

**Architecture:** Update only the in-app embedded demo content (`src/utils/demoBook.ts`). Add regression tests that run `ChapterService.parseChapters()` against the demo contents via mocked file reads.

**Tech Stack:** TypeScript, Jest (jest-expo), existing `ChapterService`.

---

## File Map

- Modify: `/Users/eugenewu/code/audio_book/src/utils/demoBook.ts`
- Modify: `/Users/eugenewu/code/audio_book/__tests__/ChapterService.test.ts`

---

### Task 1: Add Regression Tests For Demo Chapter Counts

**Files:**
- Modify: `/Users/eugenewu/code/audio_book/__tests__/ChapterService.test.ts`

- [ ] **Step 1: Add imports for demo contents**

Add:

```ts
import { DEMO_BOOK_EN_CONTENT, DEMO_BOOK_ZH_CONTENT } from '../src/utils/demoBook';
```

- [ ] **Step 2: Add a test for Chinese demo content producing exactly 3 chapters**

Add:

```ts
it('should parse zh demo book into exactly 3 chapters', async () => {
  (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
  (readAsStringAsync as jest.Mock).mockResolvedValue(DEMO_BOOK_ZH_CONTENT);

  const chapters = await ChapterService.parseChapters('demo-zh', 'path/to/demo_zh.txt');
  expect(chapters.length).toBe(3);
  expect(chapters[0].title).toContain('第1章');
  expect(chapters[1].title).toContain('第2章');
  expect(chapters[2].title).toContain('第3章');
});
```

- [ ] **Step 3: Add a test for English demo content producing exactly 3 chapters**

Add:

```ts
it('should parse en demo book into exactly 3 chapters', async () => {
  (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
  (readAsStringAsync as jest.Mock).mockResolvedValue(DEMO_BOOK_EN_CONTENT);

  const chapters = await ChapterService.parseChapters('demo-en', 'path/to/demo_en.txt');
  expect(chapters.length).toBe(3);
  expect(chapters[0].title).toContain('Chapter 1');
  expect(chapters[1].title).toContain('Chapter 2');
  expect(chapters[2].title).toContain('Chapter 3');
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: PASS (or FAIL until Task 2 content update is applied).

---

### Task 2: Update Built-In Demo Contents (ZH+EN)

**Files:**
- Modify: `/Users/eugenewu/code/audio_book/src/utils/demoBook.ts`

- [ ] **Step 1: Update Chinese demo content to 3 chapters and expand Chapter 1**

Edit `DEMO_BOOK_ZH_CONTENT` so it contains:

- Exactly one `第1章` header, one `第2章`, one `第3章` (in order).
- Chapter 1 expanded to ~800–1200 Chinese characters.
- No additional `第X章` patterns inside Chapter 1 body.
- No `Section <number>` / `Chapter <number>` lines anywhere in the Chinese content.

- [ ] **Step 2: Update English demo content to 3 chapters and expand Chapter 1**

Edit `DEMO_BOOK_EN_CONTENT` so it contains:

- Exactly one `Chapter 1` header, one `Chapter 2`, one `Chapter 3` (in order).
- Chapter 1 expanded to roughly comparable reading time.
- No `Section <number>` lines (parser matches `Section\\s+\\d+`).

- [ ] **Step 3: Run tests**

Run:

```bash
npm test
```

Expected: PASS. The two regression tests from Task 1 enforce exactly 3 chapters for each demo book.

---

### Task 3: Sanity Check Import Flow (Manual)

**Files:**
- No code changes required

- [ ] **Step 1: Launch the app**

Run:

```bash
npx expo start
```

- [ ] **Step 2: On an empty shelf, tap “Download Demo Books (ZH+EN)”**

Expected:

- Shelf shows two books.
- Each book shows “3 章 / 3 chapters” (after parsing completes).
- Opening Reader allows switching between 3 chapters.

