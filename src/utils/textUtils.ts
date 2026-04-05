export interface ParsedSentence {
  text: string;
  start: number;
  end: number;
}

const TRAILING_SENTENCE_CLOSERS_REGEX = /^[”’"'`）〕】〉》」』〗\]\)\s\n\r]*$/;
const LEADING_SENTENCE_CLOSERS_REGEX = /^[”’"'`）〕】〉》」』〗\]\)\s\n\r]+/;
const SPEECH_ONLY_SYMBOLS_REGEX = /^[`"'“”‘’（）()〔〕【】〈〉《》「」『』〖〗\[\]\-_=+~^|\\/<>.,!?;:，。！？；：、\s\n\r]+$/;
const SPEECH_STRIP_EDGE_SYMBOLS_REGEX = /^[`"'“”‘’（）()〔〕【】〈〉《》「」『』〖〗\[\]\s]+|[`"'“”‘’（）()〔〕【】〈〉《》「」『』〖〗\[\]\s]+$/g;

export function parseSentences(content: string): ParsedSentence[] {
  // First, normalize line breaks to avoid issues
  const normalizedContent = content.replace(/\r\n/g, '\n');
  
  // Split by common Chinese punctuation but capture the delimiter
  // The regex captures:
  // 1. The sentence content
  // 2. The punctuation mark (。！？；!?)
  // 3. Any closing quotes or brackets that immediately follow (”’"']*)
  
  // Pass 1: Split by sentence terminators
  const rawParts = normalizedContent.split(/([。！？；!?;]+)/);
  
  const tempSentences: string[] = [];
  for (let i = 0; i < rawParts.length; i++) {
      const part = rawParts[i];
      if (!part) continue; // Skip empty strings
      
      // If it's a punctuation mark, append to the last sentence
      if (/^[。！？；!?;]+$/.test(part)) {
           if (tempSentences.length > 0) {
               tempSentences[tempSentences.length - 1] += part;
           } else {
               tempSentences.push(part); // Should rarely happen (punctuation at start)
           }
      } else {
           tempSentences.push(part);
      }
  }
  
  // Pass 2: Merge trailing closing quotes/brackets/spaces into the previous sentence
  // so TTS won't read them as a standalone fragment.
  const finalSentences: string[] = [];
  for (let i = 0; i < tempSentences.length; i++) {
      let current = tempSentences[i];
      
      // Check if current segment is just closing quotes/brackets or whitespace
      // e.g. "”", "`", ")" or "  ”  "
      if (TRAILING_SENTENCE_CLOSERS_REGEX.test(current) && finalSentences.length > 0) {
          finalSentences[finalSentences.length - 1] += current;
      } else {
          if (finalSentences.length > 0) {
              const leadingClosers = current.match(LEADING_SENTENCE_CLOSERS_REGEX)?.[0];
              if (leadingClosers) {
                  finalSentences[finalSentences.length - 1] += leadingClosers;
                  current = current.slice(leadingClosers.length);
              }
          }

          if (!current) {
              continue;
          }

          finalSentences.push(current);
      }
  }
  
  // Calculate start and end indices
  const parsedSentences: ParsedSentence[] = [];
  let currentIndex = 0;
  
  for (const sentence of finalSentences) {
    const start = currentIndex;
    const end = start + sentence.length;
    parsedSentences.push({
      text: sentence,
      start,
      end
    });
    currentIndex = end;
  }
  
  return parsedSentences;
}

export function sanitizeSentenceForSpeech(sentence: string): string {
  const normalized = sentence.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return '';
  }

  if (SPEECH_ONLY_SYMBOLS_REGEX.test(normalized)) {
    return '';
  }

  return normalized.replace(SPEECH_STRIP_EDGE_SYMBOLS_REGEX, '').replace(/-/g, '').trim();
}

export function prepareSentenceForTts(sentence: string, mode: 'offline' | 'online'): string {
  if (mode === 'online') {
    return sentence.replace(/\r\n/g, '\n').trim();
  }

  return sanitizeSentenceForSpeech(sentence);
}

export function normalizeDisplayParagraphSpacing(content: string): string {
  return content.replace(/\r\n/g, '\n');
}
