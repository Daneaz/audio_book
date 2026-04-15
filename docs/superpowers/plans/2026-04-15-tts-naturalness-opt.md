# TTS 中文朗读自然度优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过子句暂停和平台声音引导，提升中文 TTS 朗读的断句自然度和音色质量。

**Architecture:** 在 `textUtils.ts` 新增 `splitIntoSubClauses()`，将句子按 `，、` 分成子句；`ReaderScreen.tsx` 的 `speakSentence()` 改为逐子句顺序播放，子句间插入 150ms 停顿；两个声音选择 UI 分别加平台提示文字。

**Tech Stack:** expo-speech, React Native Platform API, i18n translations

---

## 文件地图

| 文件 | 改动 |
|------|------|
| `src/utils/textUtils.ts` | 新增 `splitIntoSubClauses()` |
| `__tests__/textUtils.test.ts` | 新增 `splitIntoSubClauses` 测试 |
| `src/i18n/translations.ts` | 新增两个 key：`settings.voiceHintIos` / `settings.voiceHintAndroid` |
| `src/screens/ReaderScreen.tsx` | `speakSentence()` 改为子句播放；声音下拉列表加平台提示 |
| `src/screens/SettingsScreen.tsx` | 声音列表加平台提示 |

---

## Task 1: 实现 `splitIntoSubClauses()`

**Files:**
- Modify: `src/utils/textUtils.ts`
- Test: `__tests__/textUtils.test.ts`

- [ ] **Step 1: 写失败测试**

在 `__tests__/textUtils.test.ts` 末尾追加：

```typescript
import { parseSentences, sanitizeSentenceForSpeech, splitIntoSubClauses } from '../src/utils/textUtils';

describe('splitIntoSubClauses', () => {
  it('不含逗号时原样返回', () => {
    expect(splitIntoSubClauses('她走进房间。')).toEqual(['她走进房间。']);
  });

  it('按逗号分割并保留标点', () => {
    const result = splitIntoSubClauses('她走进房间，打开窗户，望向远处的山。');
    expect(result).toEqual(['她走进房间，', '打开窗户，', '望向远处的山。']);
  });

  it('按顿号分割', () => {
    const result = splitIntoSubClauses('苹果、香蕉、橙子都很好吃。');
    expect(result).toEqual(['苹果、', '香蕉、', '橙子都很好吃。']);
  });

  it('过短子句合并到前一个', () => {
    // "啊，" 只有1个汉字，应合并到前面
    const result = splitIntoSubClauses('她惊叫了一声，啊，然后跑开了。');
    expect(result).toEqual(['她惊叫了一声，啊，', '然后跑开了。']);
  });

  it('空字符串返回空数组', () => {
    expect(splitIntoSubClauses('')).toEqual([]);
  });

  it('无法分割时不返回空数组', () => {
    const result = splitIntoSubClauses('好。');
    expect(result.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
jest --testPathPattern=textUtils -t 'splitIntoSubClauses'
```

预期：FAIL，提示 `splitIntoSubClauses is not a function`

- [ ] **Step 3: 实现 `splitIntoSubClauses()`**

在 `src/utils/textUtils.ts` 末尾追加（在 `normalizeDisplayParagraphSpacing` 之前）：

```typescript
export function splitIntoSubClauses(sentence: string, minChineseChars: number = 4): string[] {
  if (!sentence) return [];

  const rawParts = sentence.split(/(，|、)/);
  const segments: string[] = [];
  let current = '';

  for (const part of rawParts) {
    if (part === '，' || part === '、') {
      current += part;
    } else {
      if (current) segments.push(current);
      current = part;
    }
  }
  if (current) segments.push(current);

  const countChinese = (s: string) => (s.match(/[\u4e00-\u9fff]/g) || []).length;

  const result: string[] = [];
  for (const seg of segments) {
    if (countChinese(seg) < minChineseChars && result.length > 0) {
      result[result.length - 1] += seg;
    } else if (seg.trim().length > 0) {
      result.push(seg);
    }
  }

  return result.length > 0 ? result : [sentence];
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
jest --testPathPattern=textUtils -t 'splitIntoSubClauses'
```

预期：全部 PASS

- [ ] **Step 5: 跑全量测试确认无回归**

```bash
jest --testPathPattern=textUtils
```

预期：全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/utils/textUtils.ts __tests__/textUtils.test.ts
git commit -m "feat: 新增 splitIntoSubClauses，按逗号顿号分割子句"
```

---

## Task 2: 修改 `speakSentence()` 为子句顺序播放

**Files:**
- Modify: `src/screens/ReaderScreen.tsx:1188-1238`

- [ ] **Step 1: 在 ReaderScreen.tsx 顶部确认 import**

找到 `textUtils` 的 import 行（搜索 `from '../utils/textUtils'` 或 `from '../../utils/textUtils'`），确认已有 `prepareSentenceForTts`，在同一行加入 `splitIntoSubClauses`：

```typescript
import { parseSentences, sanitizeSentenceForSpeech, prepareSentenceForTts, splitIntoSubClauses } from '../utils/textUtils';
```

（路径以现有 import 为准，只加 `splitIntoSubClauses`）

- [ ] **Step 2: 替换 `speakSentence()` 函数体**

将现有的 `speakSentence`（约 1188-1238 行）整体替换为：

```typescript
const speakSentence = (cId: string, sIndex: number) => {
    const chData = chaptersData.find(c => c.chapter.id === cId);
    if (!chData) {
      stopSpeech();
      return;
    }

    if (sIndex >= chData.sentences.length) {
      const chIdx = chaptersData.findIndex(c => c.chapter.id === cId);
      const nextCh = chaptersData[chIdx + 1];
      if (nextCh) {
        speakSentence(nextCh.chapter.id, 0);
      } else {
        stopSpeech();
      }
      return;
    }

    const sentence = prepareSentenceForTts(chData.sentences[sIndex].text, 'offline');

    if (!sentence) {
      speakSentence(cId, sIndex + 1);
      return;
    }

    setCurrentSpeakingChapterId(cId);
    setCurrentSentenceIndex(sIndex);

    const subclauses = splitIntoSubClauses(sentence);

    const playSubClause = (idx: number) => {
      if (!isSpeakingRef.current) return;
      if (idx >= subclauses.length) {
        setTimeout(() => {
          if (isSpeakingRef.current) speakSentence(cId, sIndex + 1);
        }, 50);
        return;
      }
      Speech.speak(subclauses[idx], {
        language: 'zh-CN',
        rate: settingsRef.current.speechRate,
        voice: settingsRef.current.voiceType === 'default' ? undefined : settingsRef.current.voiceType,
        onDone: () => {
          if (idx < subclauses.length - 1) {
            setTimeout(() => playSubClause(idx + 1), 150);
          } else {
            setTimeout(() => {
              if (isSpeakingRef.current) speakSentence(cId, sIndex + 1);
            }, 50);
          }
        },
        onStopped: () => {},
        onError: (e) => {
          console.error('Speech error', e);
          stopSpeech();
        },
      });
    };

    playSubClause(0);
};
```

- [ ] **Step 3: 跑测试确认无回归**

```bash
jest --testPathPattern=ReaderScreen
```

预期：全部 PASS（不改 ReaderScreen 测试逻辑，只需不报错）

- [ ] **Step 4: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: TTS 按子句顺序播放，子句间加 150ms 停顿"
```

---

## Task 3: 新增平台引导 i18n key

**Files:**
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: 在 TranslationKey 联合类型中加两个 key**

找到 `| 'settings.voicePreviewEn'` 这一行，在其后插入：

```typescript
  | 'settings.voiceHintIos'
  | 'settings.voiceHintAndroid'
```

- [ ] **Step 2: 在中文翻译对象中加值**

找到 `'settings.voicePreviewEn': '...'`（中文翻译区域），在其后插入：

```typescript
    'settings.voiceHintIos': '如需更自然的音色，可前往 iOS 设置 → 辅助功能 → 朗读内容 → 声音，下载「增强」版本',
    'settings.voiceHintAndroid': '建议在系统设置 → 语言和输入法 → 文字转语音中，将引擎切换为「Google 文字转语音」',
```

- [ ] **Step 3: 在英文翻译对象中加值**

找到英文翻译区域的 `'settings.voicePreviewEn': '...'`，在其后插入：

```typescript
    'settings.voiceHintIos': 'For a more natural voice, go to iOS Settings → Accessibility → Spoken Content → Voices and download an "Enhanced" voice',
    'settings.voiceHintAndroid': 'For better Chinese quality, go to System Settings → Language & Input → Text-to-Speech and switch to "Google Text-to-Speech"',
```

- [ ] **Step 4: 跑测试**

```bash
jest
```

预期：全部 PASS（翻译文件无运行时逻辑，测试不会因此失败，但确认整体无回归）

- [ ] **Step 5: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "feat: 新增 iOS/Android 声音引导 i18n key"
```

---

## Task 4: SettingsScreen 加平台提示 UI

**Files:**
- Modify: `src/screens/SettingsScreen.tsx:371-400`

- [ ] **Step 1: 确认 Platform 已被 import**

查找 `import { ... Platform ... } from 'react-native'`，若没有 `Platform` 则加上。

- [ ] **Step 2: 在声音展开列表末尾加提示**

找到 `showVoices &&` 的展开区块，其结构为：

```tsx
{showVoices && (
  <View style={[styles.expandedList, { borderTopColor: sc.border }]}>
    {/* ... 声音列表 ... */}
  </View>
)}
```

在 `</View>` 的闭合标签（`expandedList` 的 View）之前、声音列表之后，插入：

```tsx
{Platform.OS === 'ios' && (
  <Text style={{ fontSize: 11, color: sc.textSub, paddingHorizontal: 12, paddingVertical: 8, lineHeight: 16 }}>
    {t('settings.voiceHintIos')}
  </Text>
)}
{Platform.OS === 'android' && (
  <Text style={{ fontSize: 11, color: sc.textSub, paddingHorizontal: 12, paddingVertical: 8, lineHeight: 16 }}>
    {t('settings.voiceHintAndroid')}
  </Text>
)}
```

- [ ] **Step 3: 跑测试**

```bash
jest --testPathPattern=Settings
```

预期：PASS 或无此文件（无 SettingsScreen 测试则跳过）

- [ ] **Step 4: Commit**

```bash
git add src/screens/SettingsScreen.tsx
git commit -m "feat: SettingsScreen 声音列表加 iOS/Android 平台引导提示"
```

---

## Task 5: ReaderScreen 声音下拉列表加平台提示 UI

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`（约 2085 行附近）

- [ ] **Step 1: 在声音下拉 `ScrollView` 结束后插入提示**

找到 `isVoiceDropdownVisible &&` 的下拉块，其结构末尾为：

```tsx
{isVoiceDropdownVisible && (
  <View style={[styles.voiceDropdownList, ...]}>
    <ScrollView ...>
      {/* 声音选项 */}
    </ScrollView>
  </View>
)}
```

在 `</ScrollView>` 和 `</View>`（`voiceDropdownList`）之间插入：

```tsx
{Platform.OS === 'ios' && (
  <Text style={{ fontSize: 10, color: isDark ? '#777' : '#999', paddingHorizontal: 10, paddingVertical: 6, lineHeight: 14 }}>
    {t('settings.voiceHintIos')}
  </Text>
)}
{Platform.OS === 'android' && (
  <Text style={{ fontSize: 10, color: isDark ? '#777' : '#999', paddingHorizontal: 10, paddingVertical: 6, lineHeight: 14 }}>
    {t('settings.voiceHintAndroid')}
  </Text>
)}
```

- [ ] **Step 2: 跑全量测试**

```bash
jest
```

预期：全部 PASS

- [ ] **Step 3: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: ReaderScreen 声音下拉列表加 iOS/Android 平台引导提示"
```

---

## 自检清单

完成全部 Task 后，在模拟器中手动验证：

- [ ] 朗读一段含多个逗号的长句，确认逗号处有停顿感
- [ ] 暂停/停止 TTS，确认子句间的 setTimeout 不会继续触发播放
- [ ] iOS：打开声音下拉，确认底部有引导提示文字
- [ ] Android（或用 Platform.OS mock）：确认 Android 提示正确显示
- [ ] SettingsScreen 声音区域也显示对应提示
