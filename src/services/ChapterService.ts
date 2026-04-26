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
}

export default new ChapterService();
