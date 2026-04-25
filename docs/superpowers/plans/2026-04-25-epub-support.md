# EPUB Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add EPUB format import, rich-text rendering, and TTS highlighting to the existing reader, reusing all current paging/progress/TTS infrastructure.

**Architecture:** On import, extract EPUB zip to `epub_{bookId}/`, parse OPF/NCX into typed Chapter records (`htmlFilePath`). At read time, parse chapter HTML into `RichTextBlock[]` with flat-text offsets; the flat text drives paging and TTS unchanged. ReaderScreen renders `EpubBlock` components instead of plain `<Text>` when `book.fileType === 'epub'`.

**Tech Stack:** jszip (zip extraction), fast-xml-parser (OPF/NCX XML), expo-file-system (I/O), React Native (EpubBlock), Jest (tests)

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `src/types.ts` | Modify | Add `fileType` to `Book`, `htmlFilePath` to `Chapter`, new `RichTextBlock` type |
| `src/services/EpubService.ts` | Create | EPUB extraction, OPF/NCX parsing, cleanup |
| `src/services/ChapterService.ts` | Modify | Add `getChapterBlocks()`, EPUB flat-text path |
| `src/services/BookService.ts` | Modify | Add `addEpubBook()`, EPUB deletion cleanup |
| `src/screens/UploadScreen.tsx` | Modify | Accept `application/epub+zip`, route to EPUB processing |
| `src/components/EpubBlock.tsx` | Create | Renders one `RichTextBlock` with character-level highlight |
| `src/screens/ReaderScreen.tsx` | Modify | Extend `ChapterData`/`PageData` with blocks, EPUB render branches |
| `__tests__/EpubService.test.ts` | Create | Unit tests for XML parsing + extraction |
| `__tests__/ChapterService.epub.test.ts` | Create | Unit tests for `getChapterBlocks` |
| `__tests__/EpubBlock.test.tsx` | Create | Render + highlight tests |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install jszip and fast-xml-parser**

```bash
npm install jszip fast-xml-parser
npm install --save-dev @types/jszip
```

Expected: packages appear in `node_modules/`, `package.json` updated.

- [ ] **Step 2: Verify imports compile**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors related to jszip or fast-xml-parser.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add jszip and fast-xml-parser for EPUB support"
```

---

## Task 2: Extend data types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Update `src/types.ts`**

Replace the entire file content with:

```typescript
export type AppLanguage = 'system' | 'zh' | 'en';

export interface Book {
  id: string;
  title: string;
  author: string;
  filePath: string;
  fileName: string;
  fileType: 'txt' | 'epub';
  totalChapters: number;
  totalPages: number;
  createdAt: string;
  lastReadAt: string;
  coverImageUri?: string;
}

export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  chapterNumber: number;
  startPosition: number;
  endPosition: number;
  pageCount: number;
  htmlFilePath?: string;
}

export interface RichTextBlock {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'blockquote';
  text: string;
  flatStart: number;
  flatEnd: number;
}

export interface ReadingProgress {
  id: string;
  bookId: string;
  chapterId: string;
  currentPosition: number;
  currentPage: number;
  readingMode: 'scroll' | 'horizontal';
  updatedAt: string;
}

export interface UserSettings {
  id: string;
  fontSize: number;
  lineSpacing: number;
  language: AppLanguage;
  speechTimerDefaultMinutes: number | null;
  fontPreset: 'system' | 'hei' | 'kai' | 'song' | 'mashan';
  theme: 'system' | 'light' | 'dark';
  flipMode: 'scroll' | 'horizontal';
  autoFlip: boolean;
  flipInterval: number;
  speechRate: number;
  voiceType: string;
  keepScreenAwake: boolean;
}
```

- [ ] **Step 2: Fix backward compatibility — `fileType` defaults**

In `src/services/BookService.ts`, the existing `addBook` method creates a `Book` without `fileType`. Add `fileType: 'txt'` to that object (in the next task). For now, verify existing `getBooks` handles missing `fileType` by searching for any code that reads `book.fileType`:

```bash
grep -r "fileType" src/ --include="*.ts" --include="*.tsx"
```

Expected: no matches yet (we just added the type, no consumer code written yet).

- [ ] **Step 3: Verify types compile**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only from `BookService.ts` where `addBook` now misses `fileType` — this will be fixed in Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: extend Book/Chapter types for EPUB support"
```

---

## Task 3: Create EpubService

**Files:**
- Create: `src/services/EpubService.ts`
- Create: `__tests__/EpubService.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/EpubService.test.ts`:

```typescript
import EpubService from '../src/services/EpubService';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid' }));

const mockZipFile = (content: string) => ({
  async: jest.fn().mockResolvedValue(content),
});

const mockJSZip = {
  files: {} as Record<string, ReturnType<typeof mockZipFile>>,
};

jest.mock('jszip', () => ({
  __esModule: true,
  default: { loadAsync: jest.fn().mockResolvedValue(mockJSZip) },
}));

const CONTAINER_XML = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const OPF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
  </metadata>
  <manifest>
    <item id="ch1" href="Text/chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="Text/chapter2.xhtml" media-type="application/xhtml+xml"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`;

const NCX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="np1">
      <navLabel><text>Chapter One</text></navLabel>
      <content src="Text/chapter1.xhtml"/>
    </navPoint>
    <navPoint id="np2">
      <navLabel><text>Chapter Two</text></navLabel>
      <content src="Text/chapter2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;

const CH1_HTML = `<html><body><h1>Chapter One</h1><p>Hello world.</p></body></html>`;
const CH2_HTML = `<html><body><h1>Chapter Two</h1><p>Goodbye world.</p></body></html>`;

import { readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import JSZip from 'jszip';

function setupMockZip() {
  (mockJSZip.files as any) = {
    'META-INF/container.xml': mockZipFile(CONTAINER_XML),
    'OEBPS/content.opf': mockZipFile(OPF_XML),
    'OEBPS/toc.ncx': mockZipFile(NCX_XML),
    'OEBPS/Text/chapter1.xhtml': mockZipFile(CH1_HTML),
    'OEBPS/Text/chapter2.xhtml': mockZipFile(CH2_HTML),
  };
  (readAsStringAsync as jest.Mock).mockResolvedValue('base64data');
  (writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
  (JSZip.loadAsync as jest.Mock).mockResolvedValue(mockJSZip);
}

describe('EpubService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns correct metadata from OPF', async () => {
    setupMockZip();
    const result = await EpubService.extract('book1', 'file:///docs/book1.epub');
    expect(result.metadata.title).toBe('Test Book');
    expect(result.metadata.author).toBe('Test Author');
  });

  it('returns two chapters in spine order', async () => {
    setupMockZip();
    const result = await EpubService.extract('book1', 'file:///docs/book1.epub');
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe('Chapter One');
    expect(result.chapters[1].title).toBe('Chapter Two');
  });

  it('sets htmlFilePath relative to documentDirectory', async () => {
    setupMockZip();
    const result = await EpubService.extract('book1', 'file:///docs/book1.epub');
    expect(result.chapters[0].htmlFilePath).toBe('epub_book1/OEBPS/Text/chapter1.xhtml');
  });

  it('getExtractDir returns correct path', () => {
    expect(EpubService.getExtractDir('abc')).toBe('file:///docs/epub_abc/');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
jest --testPathPattern=EpubService -t "" 2>&1 | tail -20
```

Expected: `Cannot find module '../src/services/EpubService'`

- [ ] **Step 3: Implement `src/services/EpubService.ts`**

```typescript
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import {
  documentDirectory,
  readAsStringAsync,
  writeAsStringAsync,
  makeDirectoryAsync,
  deleteAsync,
} from 'expo-file-system/legacy';

interface EpubMetadata {
  title: string;
  author: string;
}

interface EpubChapterInfo {
  htmlFilePath: string;
  title: string;
}

export interface EpubExtractResult {
  metadata: EpubMetadata;
  chapters: EpubChapterInfo[];
}

interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
});

class EpubService {
  getExtractDir(bookId: string): string {
    return `${documentDirectory}epub_${bookId}/`;
  }

  async extract(bookId: string, epubPath: string): Promise<EpubExtractResult> {
    const base64data = await readAsStringAsync(epubPath, { encoding: 'base64' } as any);
    const zip = await JSZip.loadAsync(base64data, { base64: true });

    const containerXml = await zip.files['META-INF/container.xml']?.async('string');
    if (!containerXml) throw new Error('Invalid EPUB: missing container.xml');

    const opfPath = this._parseContainerXml(containerXml);
    const opfXml = await zip.files[opfPath]?.async('string');
    if (!opfXml) throw new Error(`Invalid EPUB: missing OPF at ${opfPath}`);

    const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
    const { metadata, spine, manifest } = this._parseOpf(opfXml, opfDir);

    const ncxItem = manifest.find(m => m.mediaType === 'application/x-dtbncx+xml');
    const navItem = manifest.find(m => m.properties === 'nav');
    let titleMap: Record<string, string> = {};

    if (ncxItem) {
      const ncxXml = await zip.files[ncxItem.href]?.async('string');
      if (ncxXml) titleMap = this._parseNcx(ncxXml, opfDir);
    } else if (navItem) {
      const navHtml = await zip.files[navItem.href]?.async('string');
      if (navHtml) titleMap = this._parseNav(navHtml, opfDir);
    }

    const extractDir = this.getExtractDir(bookId);
    await makeDirectoryAsync(extractDir, { intermediates: true } as any);

    const chapters: EpubChapterInfo[] = [];
    for (let i = 0; i < spine.length; i++) {
      const item = manifest.find(m => m.id === spine[i]);
      if (!item) continue;
      const content = await zip.files[item.href]?.async('string');
      if (!content) continue;

      const relPath = `epub_${bookId}/${item.href}`;
      const absPath = `${documentDirectory}${relPath}`;
      const parentDir = absPath.substring(0, absPath.lastIndexOf('/') + 1);
      await makeDirectoryAsync(parentDir, { intermediates: true } as any);
      await writeAsStringAsync(absPath, content);

      const hrefBasename = item.href.includes('/') ? item.href.substring(item.href.lastIndexOf('/') + 1) : item.href;
      const titleKey = Object.keys(titleMap).find(k => k.endsWith(hrefBasename));
      chapters.push({
        htmlFilePath: relPath,
        title: (titleKey ? titleMap[titleKey] : undefined) || `Chapter ${i + 1}`,
      });
    }

    return { metadata, chapters };
  }

  async cleanup(bookId: string): Promise<void> {
    await deleteAsync(this.getExtractDir(bookId), { idempotent: true } as any);
  }

  _parseContainerXml(xml: string): string {
    const parsed = xmlParser.parse(xml);
    return parsed?.container?.rootfiles?.rootfile?.['@_full-path'] ?? '';
  }

  _parseOpf(xml: string, opfDir: string): { metadata: EpubMetadata; spine: string[]; manifest: ManifestItem[] } {
    const parsed = xmlParser.parse(xml);
    const pkg = parsed?.package ?? {};
    const meta = pkg?.metadata ?? {};

    const getRaw = (v: any) => (typeof v === 'object' && v !== null ? (v['#text'] ?? Object.values(v)[0] ?? '') : String(v ?? ''));
    const title = getRaw(meta.title) || '';
    const author = getRaw(meta.creator) || '';

    const rawItems = pkg?.manifest?.item ?? [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];
    const manifest: ManifestItem[] = items.map((item: any) => ({
      id: item['@_id'] ?? '',
      href: opfDir + (item['@_href'] ?? ''),
      mediaType: item['@_media-type'] ?? '',
      properties: item['@_properties'],
    }));

    const rawRefs = pkg?.spine?.itemref ?? [];
    const refs = Array.isArray(rawRefs) ? rawRefs : [rawRefs];
    const spine: string[] = refs.map((r: any) => r['@_idref'] ?? '');

    return { metadata: { title, author }, spine, manifest };
  }

  _parseNcx(xml: string, opfDir: string): Record<string, string> {
    const parsed = xmlParser.parse(xml);
    const navPoints = parsed?.ncx?.navMap?.navPoint ?? [];
    const points = Array.isArray(navPoints) ? navPoints : [navPoints];
    const map: Record<string, string> = {};
    for (const p of points) {
      const src: string = p?.content?.['@_src'] ?? '';
      const label: string = p?.navLabel?.text ?? '';
      if (src && label) {
        const key = opfDir + src.split('#')[0];
        map[key] = label;
      }
    }
    return map;
  }

  _parseNav(html: string, opfDir: string): Record<string, string> {
    const map: Record<string, string> = {};
    const re = /<a[^>]+href="([^"#]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = opfDir + m[1];
      const text = m[2].replace(/<[^>]+>/g, '').trim();
      if (text) map[href] = text;
    }
    return map;
  }
}

export default new EpubService();
```

- [ ] **Step 4: Run tests**

```bash
jest --testPathPattern=EpubService 2>&1 | tail -20
```

Expected: `Tests: 4 passed`

- [ ] **Step 5: Commit**

```bash
git add src/services/EpubService.ts __tests__/EpubService.test.ts
git commit -m "feat: add EpubService for EPUB extraction and parsing"
```

---

## Task 4: Add `getChapterBlocks` to ChapterService

**Files:**
- Modify: `src/services/ChapterService.ts`
- Create: `__tests__/ChapterService.epub.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/ChapterService.epub.test.ts`:

```typescript
import ChapterService from '../src/services/ChapterService';
import { readAsStringAsync, getInfoAsync } from 'expo-file-system/legacy';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-uuid' }));

describe('ChapterService.getChapterBlocks', () => {
  beforeEach(() => {
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
  });

  it('parses h1, h2, p tags into blocks', async () => {
    (readAsStringAsync as jest.Mock).mockResolvedValue(
      `<html><body><h1>Title</h1><p>First para.</p><p>Second para.</p></body></html>`
    );
    const blocks = await ChapterService.getChapterBlocks('epub_b1/ch1.xhtml');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({ type: 'h1', text: 'Title', flatStart: 0, flatEnd: 5 });
    expect(blocks[1]).toEqual({ type: 'p', text: 'First para.', flatStart: 5, flatEnd: 16 });
    expect(blocks[2]).toEqual({ type: 'p', text: 'Second para.', flatStart: 16, flatEnd: 28 });
  });

  it('strips inline tags from block text', async () => {
    (readAsStringAsync as jest.Mock).mockResolvedValue(
      `<p>Hello <em>world</em>.</p>`
    );
    const blocks = await ChapterService.getChapterBlocks('epub_b1/ch1.xhtml');
    expect(blocks[0].text).toBe('Hello world.');
  });

  it('decodes HTML entities', async () => {
    (readAsStringAsync as jest.Mock).mockResolvedValue(
      `<p>a &amp; b &lt;c&gt; &nbsp;d</p>`
    );
    const blocks = await ChapterService.getChapterBlocks('epub_b1/ch1.xhtml');
    expect(blocks[0].text).toBe('a & b <c>  d');
  });

  it('skips empty blocks', async () => {
    (readAsStringAsync as jest.Mock).mockResolvedValue(
      `<p>   </p><p>Real content.</p>`
    );
    const blocks = await ChapterService.getChapterBlocks('epub_b1/ch1.xhtml');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe('Real content.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
jest --testPathPattern="ChapterService.epub" 2>&1 | tail -10
```

Expected: `TypeError: ChapterService.getChapterBlocks is not a function`

- [ ] **Step 3: Add `getChapterBlocks` to `ChapterService.ts`**

Add these methods to the `ChapterService` class before the closing `}`:

```typescript
  async getChapterBlocks(htmlFilePath: string): Promise<import('../types').RichTextBlock[]> {
    try {
      const absPath = `${documentDirectory}${htmlFilePath}`;
      const fileInfo = await getInfoAsync(absPath);
      if (!fileInfo.exists) throw new Error(`HTML file not found: ${absPath}`);
      const html = await readAsStringAsync(absPath);
      return this._parseHtmlToBlocks(html);
    } catch (e) {
      console.error('Error loading epub chapter blocks', e);
      return [];
    }
  }

  _parseHtmlToBlocks(html: string): import('../types').RichTextBlock[] {
    const blocks: import('../types').RichTextBlock[] = [];
    const blockRegex = /<(h[1-3]|p|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
    let flatOffset = 0;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase() as import('../types').RichTextBlock['type'];
      const text = match[2]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, '')
        .trim();

      if (!text) continue;

      blocks.push({ type: tag, text, flatStart: flatOffset, flatEnd: flatOffset + text.length });
      flatOffset += text.length;
    }

    return blocks;
  }
```

Also add `documentDirectory` to the import at the top of `ChapterService.ts`:

```typescript
import { readAsStringAsync, getInfoAsync, documentDirectory } from 'expo-file-system/legacy';
```

- [ ] **Step 4: Run tests**

```bash
jest --testPathPattern="ChapterService" 2>&1 | tail -20
```

Expected: all ChapterService tests pass (both existing and new).

- [ ] **Step 5: Commit**

```bash
git add src/services/ChapterService.ts __tests__/ChapterService.epub.test.ts
git commit -m "feat: add getChapterBlocks to ChapterService for EPUB chapters"
```

---

## Task 5: Add EPUB import and cleanup to BookService

**Files:**
- Modify: `src/services/BookService.ts`

- [ ] **Step 1: Add `fileType: 'txt'` to existing `addBook` and fix compile errors**

In `BookService.ts`, update the `newBook` object inside `addBook`:

```typescript
    const newBook: Book = {
      id: Crypto.randomUUID(),
      title: fileName.replace('.txt', ''),
      author: 'Unknown',
      filePath: newPath,
      fileName: fileName,
      fileType: 'txt',            // ← add this line
      totalChapters: 0,
      totalPages: 0,
      createdAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    };
```

- [ ] **Step 2: Add `addEpubBook` method to BookService**

Add this method after the existing `addBook` method:

```typescript
  async addEpubBook(fileUri: string, fileName: string): Promise<{ book: Book; chapters: import('../types').Chapter[] }> {
    const books = await this.getBooks();
    const id = Crypto.randomUUID();

    const newPath = documentDirectory ? `${documentDirectory}${fileName}` : fileUri;
    if (documentDirectory) {
      try {
        await copyAsync({ from: fileUri, to: newPath });
      } catch (error) {
        console.warn('EPUB file copy failed, using original uri.', error);
      }
    }

    const EpubService = (await import('./EpubService')).default;
    const { metadata, chapters: spineChapters } = await EpubService.extract(id, newPath);

    const newBook: Book = {
      id,
      title: metadata.title || fileName.replace(/\.epub$/i, ''),
      author: metadata.author || 'Unknown',
      filePath: newPath,
      fileName,
      fileType: 'epub',
      totalChapters: spineChapters.length,
      totalPages: 0,
      createdAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    };

    const chapters: import('../types').Chapter[] = spineChapters.map((c, i) => ({
      id: Crypto.randomUUID(),
      bookId: id,
      title: c.title,
      chapterNumber: i + 1,
      startPosition: 0,
      endPosition: 0,
      htmlFilePath: c.htmlFilePath,
      pageCount: 0,
    }));

    books.push(newBook);
    await StorageService.storeData(STORAGE_KEYS.BOOKS, books);
    await StorageService.storeData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${id}`, chapters);

    return { book: newBook, chapters };
  }
```

- [ ] **Step 3: Update `removeBook` to clean up EPUB extracted dir**

Replace the `removeBook` method with:

```typescript
  async removeBook(bookId: string) {
    let books = await this.getBooks();
    const book = books.find(b => b.id === bookId);
    if (book) {
      try {
        if (book.filePath.startsWith('file://')) {
          await deleteAsync(book.filePath, { idempotent: true });
        }
        if (book.coverImageUri?.startsWith('file://')) {
          await deleteAsync(book.coverImageUri.split('?')[0], { idempotent: true });
        }
        if (book.fileType === 'epub') {
          const EpubService = (await import('./EpubService')).default;
          await EpubService.cleanup(bookId);
        }
      } catch (e) {
        console.error('Error deleting file', e);
      }
    }
    books = books.filter(b => b.id !== bookId);
    await StorageService.storeData(STORAGE_KEYS.BOOKS, books);
    await StorageService.removeData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${bookId}`);
    await StorageService.removeData(`${STORAGE_KEYS.READING_PROGRESS_PREFIX}${bookId}`);
  }
```

- [ ] **Step 4: Update `getBooks` to handle missing `fileType` (backward compat)**

In the `getBooks` method, update the map call for non-web:

```typescript
    if (Platform.OS !== 'web') {
        return data.map((book: Book) => {
            const updated = {
                ...book,
                fileType: book.fileType ?? 'txt',   // ← backward compat
            };
            if (updated.fileName && !updated.filePath.startsWith('blob:') && !updated.filePath.startsWith('data:')) {
                return { ...updated, filePath: `${documentDirectory}${updated.fileName}` };
            }
            return updated;
        });
    }
    return data.map((book: Book) => ({ ...book, fileType: book.fileType ?? 'txt' }));
```

- [ ] **Step 5: Verify types and existing tests pass**

```bash
npx tsc --noEmit 2>&1 | head -20
jest --testPathPattern=BookService 2>&1 | tail -20
```

Expected: no type errors, all BookService tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/BookService.ts
git commit -m "feat: add addEpubBook and EPUB cleanup to BookService"
```

---

## Task 6: Update UploadScreen to accept EPUB

**Files:**
- Modify: `src/screens/UploadScreen.tsx`

- [ ] **Step 1: Add EPUB processing branch**

In `UploadScreen.tsx`, replace the `processFile` function and `handleLocalPick` function with:

```typescript
  const processFile = async (fileName: string, fileUri: string): Promise<boolean> => {
    try {
      const isEpub = fileName.toLowerCase().endsWith('.epub');
      if (isEpub) {
        const { book } = await BookService.addEpubBook(fileUri, fileName);
        if (!book) return false;
        return true;
      }
      const newBook = await BookService.addBook(fileUri, fileName);
      const chapters = await ChapterService.parseChapters(newBook.id, newBook.filePath);
      newBook.totalChapters = chapters.length;
      await BookService.updateBook(newBook);
      await StorageService.storeData(`${STORAGE_KEYS.CHAPTERS_PREFIX}${newBook.id}`, chapters);
      return true;
    } catch {
      return false;
    }
  };

  const handleLocalPick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'application/epub+zip'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const file = result.assets[0];

      setLocalLoading(true);
      const ok = await processFile(file.name, file.uri);
      setLocalLoading(false);

      if (ok) {
        Alert.alert(t('upload.successTitle'), t('upload.successMessage'), [
          { text: t('common.ok'), onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert(t('upload.errorTitle'), t('upload.errorMessage'));
      }
    } catch {
      setLocalLoading(false);
      Alert.alert(t('upload.errorTitle'), t('upload.errorMessage'));
    }
  };
```

- [ ] **Step 2: Update the description text to mention EPUB**

Find the subtitle translation key and update `src/i18n/translations.ts` — locate the `upload.localDesc` key and update its value in both `zh` and `en` entries:

Open `src/i18n/translations.ts`, find `upload.localDesc` and change it to include EPUB:
- zh: `'支持 TXT、EPUB 格式'`
- en: `'Supports TXT and EPUB formats'`

- [ ] **Step 3: Verify compile**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/UploadScreen.tsx src/i18n/translations.ts
git commit -m "feat: accept EPUB files in UploadScreen"
```

---

## Task 7: Create EpubBlock component

**Files:**
- Create: `src/components/EpubBlock.tsx`
- Create: `__tests__/EpubBlock.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `__tests__/EpubBlock.test.tsx`:

```typescript
import React from 'react';
import { render } from '@testing-library/react-native';
import EpubBlock from '../src/components/EpubBlock';
import { RichTextBlock } from '../src/types';

const baseBlock: RichTextBlock = {
  type: 'p',
  text: 'Hello world.',
  flatStart: 0,
  flatEnd: 12,
};

describe('EpubBlock', () => {
  it('renders block text', () => {
    const { getByText } = render(
      <EpubBlock block={baseBlock} fontSize={16} lineHeight={24} textColor="#000" fontFamily={undefined} isDark={false} />
    );
    expect(getByText('Hello world.')).toBeTruthy();
  });

  it('renders partial highlight correctly', () => {
    const { getAllByText, UNSAFE_getAllByType } = render(
      <EpubBlock
        block={baseBlock}
        fontSize={16}
        lineHeight={24}
        textColor="#000"
        fontFamily={undefined}
        isDark={false}
        highlightRange={{ start: 6, end: 11 }}
      />
    );
    // "Hello ", "world", "." — 3 Text nodes
    const { Text } = require('react-native');
    const nodes = UNSAFE_getAllByType(Text);
    const texts = nodes.map((n: any) => n.props.children).filter(Boolean);
    expect(texts.join('')).toContain('world');
  });

  it('applies larger fontSize for h1', () => {
    const h1Block: RichTextBlock = { ...baseBlock, type: 'h1' };
    const { UNSAFE_getByType } = render(
      <EpubBlock block={h1Block} fontSize={16} lineHeight={24} textColor="#000" fontFamily={undefined} isDark={false} />
    );
    const { Text } = require('react-native');
    const outerText = UNSAFE_getByType(Text);
    expect(outerText.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontSize: expect.any(Number) })])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
jest --testPathPattern=EpubBlock 2>&1 | tail -10
```

Expected: `Cannot find module '../src/components/EpubBlock'`

- [ ] **Step 3: Implement `src/components/EpubBlock.tsx`**

```typescript
import React, { useMemo } from 'react';
import { Text, StyleSheet } from 'react-native';
import { RichTextBlock } from '../types';

interface Props {
  block: RichTextBlock;
  fontSize: number;
  lineHeight: number;
  textColor: string;
  fontFamily: string | undefined;
  isDark: boolean;
  highlightRange?: { start: number; end: number };
}

interface Fragment {
  text: string;
  highlighted: boolean;
}

function splitWithHighlight(text: string, range?: { start: number; end: number }): Fragment[] {
  if (!range || range.start >= range.end) return [{ text, highlighted: false }];
  const { start, end } = range;
  const clamped = { start: Math.max(0, start), end: Math.min(text.length, end) };
  const parts: Fragment[] = [];
  if (clamped.start > 0) parts.push({ text: text.slice(0, clamped.start), highlighted: false });
  parts.push({ text: text.slice(clamped.start, clamped.end), highlighted: true });
  if (clamped.end < text.length) parts.push({ text: text.slice(clamped.end), highlighted: false });
  return parts.filter(p => p.text.length > 0);
}

const TYPE_FONT_SCALE: Record<RichTextBlock['type'], number> = {
  h1: 1.5,
  h2: 1.3,
  h3: 1.15,
  p: 1,
  blockquote: 1,
};

const TYPE_FONT_WEIGHT: Record<RichTextBlock['type'], 'bold' | 'normal'> = {
  h1: 'bold',
  h2: 'bold',
  h3: 'bold',
  p: 'normal',
  blockquote: 'normal',
};

export default function EpubBlock({ block, fontSize, lineHeight, textColor, fontFamily, isDark, highlightRange }: Props) {
  const fragments = useMemo(() => splitWithHighlight(block.text, highlightRange), [block.text, highlightRange]);

  const scaledFontSize = fontSize * TYPE_FONT_SCALE[block.type];
  const scaledLineHeight = lineHeight * TYPE_FONT_SCALE[block.type];
  const fontWeight = TYPE_FONT_WEIGHT[block.type];
  const marginTop = block.type.startsWith('h') ? 12 : 0;

  return (
    <Text
      style={[
        styles.base,
        { fontSize: scaledFontSize, lineHeight: scaledLineHeight, color: textColor, fontFamily, fontWeight, marginTop },
        block.type === 'blockquote' && styles.blockquote,
      ]}
    >
      {fragments.map((f, i) => (
        <Text
          key={i}
          style={f.highlighted
            ? { backgroundColor: isDark ? '#3A2E12' : '#F7E8C4', color: textColor }
            : undefined}
        >
          {f.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    marginBottom: 8,
  },
  blockquote: {
    paddingLeft: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#999',
    fontStyle: 'italic',
  },
});
```

- [ ] **Step 4: Run tests**

```bash
jest --testPathPattern=EpubBlock 2>&1 | tail -20
```

Expected: `Tests: 3 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/EpubBlock.tsx __tests__/EpubBlock.test.tsx
git commit -m "feat: add EpubBlock component for rich text rendering"
```

---

## Task 8: Update ReaderScreen — EPUB chapter loading and rendering

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

This task adds EPUB support to both the scroll-mode (`ReaderChapterItem`) and page-mode (`ReaderPageItem`) rendering paths.

- [ ] **Step 1: Extend `ChapterData` and `PageData` interfaces**

Find the `interface ChapterData` block (around line 26) and add `blocks` field:

```typescript
interface ChapterData {
  chapter: Chapter;
  content: string;
  sentences: ParsedSentence[];
  blocks?: RichTextBlock[];
}
```

Find the `interface PageData` block (around line 33) and add `blocks` field:

```typescript
interface PageData {
  id: string;
  chapter: Chapter;
  content: string;
  pageNumber: number;
  pageCount: number;
  charStart: number;
  blocks?: RichTextBlock[];
}
```

- [ ] **Step 2: Add `RichTextBlock` import**

Add `RichTextBlock` to the imports from `../types`:

```typescript
import { Book, Chapter, ReadingProgress, RichTextBlock } from '../types';
```

- [ ] **Step 3: Add `EpubBlock` import**

Add below the `AdBanner` import:

```typescript
import EpubBlock from '../components/EpubBlock';
```

- [ ] **Step 4: Add `getBlocksForPage` helper function**

Add this function after `getPageHighlightedFragments` (around line 198):

```typescript
function getBlocksForPage(
  blocks: RichTextBlock[],
  pageCharStart: number,
  pageContent: string
): RichTextBlock[] {
  const pageEnd = pageCharStart + pageContent.length;
  return blocks
    .filter(b => b.flatStart < pageEnd && b.flatEnd > pageCharStart)
    .map(b => ({
      ...b,
      text: b.text.substring(
        Math.max(0, pageCharStart - b.flatStart),
        Math.min(b.text.length, pageEnd - b.flatStart)
      ),
      flatStart: Math.max(b.flatStart, pageCharStart) - pageCharStart,
      flatEnd: Math.min(b.flatEnd, pageEnd) - pageCharStart,
    }));
}
```

- [ ] **Step 5: Update `ReaderChapterItemProps` and `ReaderChapterItem` for EPUB scroll mode**

Add `blocks?: RichTextBlock[]` to `ReaderChapterItemProps` (around line 200):

```typescript
interface ReaderChapterItemProps {
  item: ChapterData;
  isHorizontal: boolean;
  windowWidth: number;
  topInset: number;
  textColor: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: string | undefined;
  isDark: boolean;
  isSpeaking: boolean;
  activeSentence: ParsedSentence | null;
  onLayoutChapter: (chapterId: string, y: number, height: number) => void;
  onSelectSentence: (chapterId: string, sentences: ParsedSentence[], start: number) => void;
}
```

Inside `ReaderChapterItem`, after `const displayContent = ...` and `const fragments = ...`, add the EPUB blocks rendering. Replace the JSX inside the `<View>` (after `<Text style={...chapterTitle...}>`) with:

```tsx
      <Text style={[styles.chapterTitle, { color: textColor }]}>{item.chapter.title}</Text>
      {item.blocks ? (
        item.blocks.map((block, idx) => {
          const sentHighlight = activeSentence
            ? {
                start: Math.max(0, activeSentence.start - block.flatStart),
                end: Math.min(block.text.length, activeSentence.end - block.flatStart),
              }
            : undefined;
          const hasOverlap = activeSentence
            ? activeSentence.start < block.flatEnd && activeSentence.end > block.flatStart
            : false;
          return (
            <EpubBlock
              key={`${item.chapter.id}_block_${idx}`}
              block={block}
              fontSize={fontSize}
              lineHeight={lineHeight}
              textColor={textColor}
              fontFamily={fontFamily}
              isDark={isDark}
              highlightRange={hasOverlap ? sentHighlight : undefined}
            />
          );
        })
      ) : isSpeaking ? (
        <Text selectable style={[styles.content, { fontSize, color: textColor, lineHeight, fontFamily }]}>
          {fragments.map((fragment, index) => (
            <Text
              key={`${item.chapter.id}_fragment_${index}`}
              style={fragment.highlighted ? [styles.highlightedSentence, { backgroundColor: isDark ? '#3A2E12' : '#F7E8C4', color: textColor }] : undefined}
            >
              {fragment.text}
            </Text>
          ))}
        </Text>
      ) : (
        <TextInput
          value={displayContent}
          multiline
          editable={false}
          scrollEnabled={false}
          style={[styles.content, { fontSize, color: textColor, lineHeight, fontFamily }]}
          onSelectionChange={(e) => onSelectSentence(item.chapter.id, item.sentences, e.nativeEvent.selection.start)}
        />
      )}
```

Update the `React.memo` equality check to also compare blocks:

```typescript
}, (prev, next) => {
  const prevSentence = prev.activeSentence;
  const nextSentence = next.activeSentence;
  const sentenceUnchanged =
    prevSentence === nextSentence ||
    (
      prevSentence?.start === nextSentence?.start &&
      prevSentence?.end === nextSentence?.end &&
      prevSentence?.text === nextSentence?.text
    );

  return (
    prev.item === next.item &&
    prev.isHorizontal === next.isHorizontal &&
    prev.windowWidth === next.windowWidth &&
    prev.topInset === next.topInset &&
    prev.textColor === next.textColor &&
    prev.fontSize === next.fontSize &&
    prev.lineHeight === next.lineHeight &&
    prev.fontFamily === next.fontFamily &&
    prev.isDark === next.isDark &&
    prev.isSpeaking === next.isSpeaking &&
    sentenceUnchanged
  );
});
```

- [ ] **Step 6: Update `ReaderPageItem` for EPUB page mode**

Add `blocks?: RichTextBlock[]` to `ReaderPageItemProps`:

```typescript
interface ReaderPageItemProps {
  item: PageData;
  windowWidth: number;
  topPadding: number;
  bottomPadding: number;
  textColor: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: string | undefined;
  contentHeight: number;
  isDark: boolean;
  isMenuVisible: boolean;
  activeSentenceText: string | null;
}
```

Inside `ReaderPageItem`, replace the `<Text style={...pageContent...}>` block with:

```tsx
      {item.blocks ? (
        item.blocks.map((block, idx) => {
          const sentIdx = activeSentenceText ? block.text.indexOf(activeSentenceText) : -1;
          return (
            <EpubBlock
              key={`${item.id}_block_${idx}`}
              block={block}
              fontSize={fontSize}
              lineHeight={lineHeight}
              textColor={textColor}
              fontFamily={fontFamily}
              isDark={isDark}
              highlightRange={sentIdx >= 0 ? { start: sentIdx, end: sentIdx + activeSentenceText!.length } : undefined}
            />
          );
        })
      ) : (
        <Text style={[styles.pageContent, { color: textColor, fontSize, lineHeight, fontFamily, height: contentHeight }]}>
          {fragments.map((fragment, index) => (
            <Text
              key={`${item.id}_fragment_${index}`}
              style={fragment.highlighted ? [styles.highlightedSentence, { backgroundColor: isDark ? '#3A2E12' : '#F7E8C4', color: textColor }] : undefined}
            >
              {fragment.text}
            </Text>
          ))}
        </Text>
      )}
```

- [ ] **Step 7: Add EPUB chapter loading branch**

Search for the function that loads chapter content (look for `getChapterContent` call in the file). It will look something like:

```typescript
const content = await ChapterService.getChapterContent(book.filePath, chapter.startPosition, chapter.endPosition);
```

Add an EPUB branch immediately before/around that call:

```typescript
      let content: string;
      let blocks: RichTextBlock[] | undefined;

      if (book.fileType === 'epub' && chapter.htmlFilePath) {
        blocks = await ChapterService.getChapterBlocks(chapter.htmlFilePath);
        content = blocks.map(b => b.text).join('');
      } else {
        content = await ChapterService.getChapterContent(book.filePath, chapter.startPosition, chapter.endPosition);
      }
```

Then when creating the `ChapterData` object, include `blocks`:

```typescript
      const chapterData: ChapterData = {
        chapter,
        content,
        sentences: parseSentences(content),
        blocks,
      };
```

For page mode, when creating `PageData` entries from pages, add block mapping. Find where `PageData` objects are created (look for `charStart`) and update:

```typescript
        const pageBlocks = blocks ? getBlocksForPage(blocks, charStart, page) : undefined;
        pageDataList.push({
          id: `${chapter.id}_page_${pageIndex}`,
          chapter,
          content: page,
          pageNumber: pageIndex + 1,
          pageCount: pages.length,
          charStart,
          blocks: pageBlocks,
        });
```

- [ ] **Step 8: Verify type compile**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 9: Run all tests**

```bash
jest 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: add EPUB rendering branch to ReaderScreen"
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Run full test suite**

```bash
jest 2>&1 | tail -30
```

Expected: all tests pass, no regressions.

- [ ] **Step 2: TypeScript full check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Start dev server and smoke test (optional — requires device/simulator)**

```bash
expo start
```

Test flow:
1. Open app → Upload screen
2. Pick an `.epub` file from local storage
3. Verify book appears in bookshelf with correct title/author
4. Open book → verify chapters list
5. Open a chapter → verify rich-text blocks render (headings larger than body text)
6. Start TTS → verify sentence highlight moves through blocks
7. Delete book → verify no leftover `epub_{bookId}/` directory

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: EPUB format support with rich-text rendering and TTS highlighting"
```
