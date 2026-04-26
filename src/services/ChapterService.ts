import { readAsStringAsync, getInfoAsync, documentDirectory } from 'expo-file-system/legacy';
import { Chapter } from '../types';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

class ChapterService {
  async parseChapters(bookId: string, filePath: string): Promise<Chapter[]> {
    try {
      let content = '';
      if (Platform.OS === 'web' && (filePath.startsWith('blob:') || filePath.startsWith('data:'))) {
        // Handle Web Blob URL
        const response = await fetch(filePath);
        content = await response.text();
      } else {
        const fileInfo = await getInfoAsync(filePath);
        if (!fileInfo.exists) {
            console.warn(`File not found at ${filePath}`);
            return [];
        }
        content = await readAsStringAsync(filePath);
      }
      
      // Try to find chapter patterns
      // Patterns: "第X章 Title", "Chapter X Title", "Section X"
      // Using a regex that matches common chapter headers at the start of a line
      const chapterRegex = /(^|\n)\s*(第[0-9零一二三四五六七八九十百千]+[章卷回节]|Chapter\s+\d+|Section\s+\d+).*?(\r?\n|$)/g;
      
      const matches = [...content.matchAll(chapterRegex)];
      
      let chapters: Chapter[] = [];
      
      if (matches.length > 0) {
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          const start = match.index || 0;
          const end = (i < matches.length - 1) ? (matches[i + 1].index || content.length) : content.length;
          const title = match[0].trim();
          
          chapters.push({
            id: Crypto.randomUUID(),
            bookId,
            title,
            chapterNumber: i + 1,
            startPosition: start,
            endPosition: end,
            pageCount: 0 // Will be calculated by Reader
          });
        }
      } else {
        // Fallback: split by length (e.g., 5000 chars)
        const chunkSize = 5000;
        const totalChunks = Math.ceil(content.length / chunkSize);
        
        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = Math.min((i + 1) * chunkSize, content.length);
          
          chapters.push({
            id: Crypto.randomUUID(),
            bookId,
            title: `Part ${i + 1}`,
            chapterNumber: i + 1,
            startPosition: start,
            endPosition: end,
            pageCount: 0
          });
        }
      }
      
      return chapters;
    } catch (e) {
      console.error('Error parsing chapters', e);
      return [];
    }
  }

  async getChapterContent(filePath: string, start: number, end: number): Promise<string> {
      try {
          let content = '';
          if (Platform.OS === 'web' && (filePath.startsWith('blob:') || filePath.startsWith('data:'))) {
              const response = await fetch(filePath);
              content = await response.text();
          } else {
              const fileInfo = await getInfoAsync(filePath);
              if (!fileInfo.exists) {
                  throw new Error("Book file not found. Please remove and re-add the book.");
              }
              content = await readAsStringAsync(filePath);
          }
          return content.substring(start, end);
      } catch (e) {
          console.error("Error reading chapter content", e);
          return "";
      }
  }
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
    let flatOffset = 0;

    const decodeEntities = (s: string) =>
      s
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ');

    const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');

    const extractText = (raw: string) => decodeEntities(stripTags(raw)).trim();

    // First pass: extract blockquote blocks and blank out those regions
    let remaining = html;
    const bqRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    let bqMatch: RegExpExecArray | null;
    const blockquoteBlocks: { index: number; length: number; text: string }[] = [];

    while ((bqMatch = bqRegex.exec(html)) !== null) {
      const text = extractText(bqMatch[1]);
      if (text) {
        blockquoteBlocks.push({ index: bqMatch.index, length: bqMatch[0].length, text });
      }
    }

    // Blank out blockquote regions so inner <p> tags are not double-counted
    for (const bq of blockquoteBlocks) {
      remaining = remaining.substring(0, bq.index) + ' '.repeat(bq.length) + remaining.substring(bq.index + bq.length);
    }

    // Collect all block positions in document order
    const allBlocks: { index: number; type: import('../types').RichTextBlock['type']; text: string }[] = [];

    // Add blockquote blocks
    for (const bq of blockquoteBlocks) {
      allBlocks.push({ index: bq.index, type: 'blockquote', text: bq.text });
    }

    // Second pass: extract h1-h3, p blocks from remaining HTML (blockquotes blanked out)
    const blockRegex = /<(h[1-3]|p)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(remaining)) !== null) {
      const text = extractText(match[2]);
      if (text) {
        allBlocks.push({ index: match.index, type: match[1].toLowerCase() as import('../types').RichTextBlock['type'], text });
      }
    }

    // Sort by document order
    allBlocks.sort((a, b) => a.index - b.index);

    // Build final blocks with flatStart/flatEnd
    for (const b of allBlocks) {
      blocks.push({ type: b.type, text: b.text, flatStart: flatOffset, flatEnd: flatOffset + b.text.length });
      flatOffset += b.text.length;
    }

    return blocks;
  }
}

export default new ChapterService();
