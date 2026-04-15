import { parseSentences, sanitizeSentenceForSpeech, splitIntoSubClauses } from '../src/utils/textUtils';

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
    expect(sanitizeSentenceForSpeech('`”你好。”`')).toBe('你好。');
  });

  it('keeps normal sentence punctuation inside the sentence', () => {
    expect(sanitizeSentenceForSpeech('你好，世界。')).toBe('你好，世界。');
  });
});

describe('splitIntoSubClauses', () => {
  it('不含逗号时原样返回', () => {
    expect(splitIntoSubClauses('她走进房间。')).toEqual(['她走进房间。']);
  });

  it('按逗号分割并保留标点', () => {
    const result = splitIntoSubClauses('她走进房间，打开窗户，望向远处的山。');
    expect(result).toEqual(['她走进房间，', '打开窗户，', '望向远处的山。']);
  });

  it('按顿号分割', () => {
    const result = splitIntoSubClauses('苹果、香蕉、橙子真的都很好吃。');
    expect(result).toEqual(['苹果、香蕉、', '橙子真的都很好吃。']);
  });

  it('过短子句合并到前一个', () => {
    // “啊，” 只有1个汉字，应合并到前面
    const result = splitIntoSubClauses('她惊叫了一声，啊，然后跑开了。');
    expect(result).toEqual(['她惊叫了一声，啊，', '然后跑开了。']);
  });

  it('汉字数少于4的子句合并到前一个', () => {
    // “好的，” = 2 汉字 < 4, 应合并到前一个；”明天一起见面” = 6 汉字 >= 4, 不合并
    const result = splitIntoSubClauses('他答应说，好的，明天一起见面。');
    expect(result).toEqual(['他答应说，好的，', '明天一起见面。']);
  });

  it('空字符串返回空数组', () => {
    expect(splitIntoSubClauses('')).toEqual([]);
  });

  it('无法分割时不返回空数组', () => {
    const result = splitIntoSubClauses('好。');
    expect(result.length).toBeGreaterThan(0);
  });
});
