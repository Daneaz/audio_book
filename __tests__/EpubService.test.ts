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
