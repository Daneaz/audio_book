import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import {
  documentDirectory,
  readAsStringAsync,
  writeAsStringAsync,
  makeDirectoryAsync,
  deleteAsync,
  getInfoAsync,
  EncodingType,
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
    const info = await getInfoAsync(epubPath);
    if (!info.exists) throw new Error(`EPUB file not found: ${epubPath}`);

    if (info.isDirectory) {
      return this._extractFromDir(bookId, epubPath);
    }
    return this._extractFromZip(bookId, epubPath);
  }

  private async _extractFromDir(bookId: string, dirPath: string): Promise<EpubExtractResult> {
    const dir = dirPath.endsWith('/') ? dirPath.slice(0, -1) : dirPath;

    const containerXml = await readAsStringAsync(`${dir}/META-INF/container.xml`);
    const opfRelPath = this._parseContainerXml(containerXml);
    const opfXml = await readAsStringAsync(`${dir}/${opfRelPath}`);
    const opfDir = opfRelPath.includes('/') ? opfRelPath.substring(0, opfRelPath.lastIndexOf('/') + 1) : '';
    const { metadata, spine, manifest } = this._parseOpf(opfXml, opfDir);

    const ncxItem = manifest.find(m => m.mediaType === 'application/x-dtbncx+xml');
    const navItem = manifest.find(m => m.properties === 'nav');
    let titleMap: Record<string, string> = {};
    if (ncxItem) {
      const ncxXml = await readAsStringAsync(`${dir}/${ncxItem.href}`);
      titleMap = this._parseNcx(ncxXml, opfDir);
    } else if (navItem) {
      const navHtml = await readAsStringAsync(`${dir}/${navItem.href}`);
      titleMap = this._parseNav(navHtml, opfDir);
    }

    const extractDir = this.getExtractDir(bookId);
    await makeDirectoryAsync(extractDir, { intermediates: true } as any);

    const chapters: EpubChapterInfo[] = [];
    for (let i = 0; i < spine.length; i++) {
      const item = manifest.find(m => m.id === spine[i]);
      if (!item) continue;
      const content = await readAsStringAsync(`${dir}/${item.href}`);

      const relPath = `epub_${bookId}/${item.href}`;
      const absPath = `${documentDirectory}${relPath}`;
      const parentDir = absPath.substring(0, absPath.lastIndexOf('/') + 1);
      await makeDirectoryAsync(parentDir, { intermediates: true } as any);
      await writeAsStringAsync(absPath, content);

      const chapterTitle = titleMap[item.href] ?? titleMap[item.href.split('#')[0]];
      chapters.push({ htmlFilePath: relPath, title: chapterTitle || `Chapter ${i + 1}` });
    }

    return { metadata, chapters };
  }

  private async _extractFromZip(bookId: string, epubPath: string): Promise<EpubExtractResult> {
    const base64data = await readAsStringAsync(epubPath, { encoding: EncodingType.Base64 });
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

      const chapterTitle = titleMap[item.href] ?? titleMap[item.href.split('#')[0]];
      chapters.push({ htmlFilePath: relPath, title: chapterTitle || `Chapter ${i + 1}` });
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
