import { parseSentences, sanitizeSentenceForSpeech } from '../src/utils/textUtils';

describe('parseSentences', () => {
  it('merges a trailing backtick into the previous sentence', () => {
    const sentences = parseSentences('xxxx，xxx。`下一句');

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('xxxx，xxx。`');
    expect(sentences[1].text).toBe('下一句');
  });

  it('merges trailing closing punctuation marks into the previous sentence', () => {
    const sentences = parseSentences('他说：“你好。”）后面');

    expect(sentences).toHaveLength(2);
    expect(sentences[0].text).toBe('他说：“你好。”）');
    expect(sentences[1].text).toBe('后面');
  });
});

describe('sanitizeSentenceForSpeech', () => {
  it('drops symbol-only fragments so TTS stays silent', () => {
    expect(sanitizeSentenceForSpeech('`”）')).toBe('');
    expect(sanitizeSentenceForSpeech(' ，。！？ ')).toBe('');
  });

  it('strips wrapping closing symbols while keeping readable text', () => {
    expect(sanitizeSentenceForSpeech('`“你好。”`')).toBe('你好。');
  });

  it('keeps normal sentence punctuation inside the sentence', () => {
    expect(sanitizeSentenceForSpeech('你好，世界。')).toBe('你好，世界。');
  });
});
