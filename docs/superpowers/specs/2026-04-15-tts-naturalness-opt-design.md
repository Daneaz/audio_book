# TTS 中文朗读自然度优化设计文档

**日期：** 2026-04-15  
**范围：** 方案一 — 系统 TTS 优化（零依赖、离线可用）

---

## 背景

当前使用 `expo-speech`（系统 TTS），中文朗读存在三个问题：
1. **音色机械**：iOS 默认声音质量有限，用户不知道可以下载增强音质
2. **断句节奏差**：`parseSentences()` 只在 `。！？；` 处切割，逗号分隔的长句整段传给 TTS，没有自然停顿
3. **韵律均匀**：系统 TTS 本身限制，无法通过配置改变

---

## 目标

在不引入新依赖、不修改 iOS/Android 原生目录的前提下，通过以下三项改动提升中文朗读自然度：

1. 子句暂停（节奏改善）
2. iOS 增强音质引导（音色改善）
3. Android TTS 引擎引导（音色改善）

---

## 改动一：子句暂停

### 问题
`ReaderScreen.tsx` 直接将整个句子传给 `Speech.speak()`。一个句子可能包含多个逗号分隔的子句，TTS 会一气读完，缺乏停顿感。

### 方案
在 `textUtils.ts` 中新增 `splitIntoSubClauses(sentence: string): string[]`，按 `，、` 分割子句。

播放逻辑中（`ReaderScreen.tsx` 的 TTS 循环），将单次 `Speech.speak()` 改为：
- 依次播放各子句
- 子句之间插入 150ms 延迟（`setTimeout`）
- 所有子句播完后才触发 `onDone` 回调进入下一句

### 高亮不变
高亮仍以 `ParsedSentence`（句子）为单位，子句切割只发生在 TTS 播放层，`parseSentences()` 不修改。

### 子句分割规则
- 分割符：`，、`
- 子句长度下限：4 个汉字（过短的子句合并到前一个，避免切割过碎）
- 每个子句保留其尾部标点（含分割符本身）
- 最后一个子句携带原句的结尾标点

### 延迟参数
- 子句间延迟：150ms（可后续根据测试调整）
- 不对句子间的延迟做改动（保持现有 `onDone` → 下一句的逻辑）

---

## 改动二：iOS 增强音质引导

### 问题
iOS 增强版声音（如 `Tingting-premium`）已能通过现有白名单过滤（`id.includes('tingting'/'meijia')`），但用户不知道需要主动下载。

### 方案
在 `ReaderScreen.tsx` 和 `SettingsScreen.tsx` 的声音选择 UI 中，iOS 平台下加一行提示文字：

> 如需更自然的音色，请前往  
> **iOS 设置 → 辅助功能 → 朗读内容 → 声音** 下载「增强」版本

提示仅在 `Platform.OS === 'ios'` 时显示，样式使用当前 `textSub` 颜色，字号 12。

### 代码改动
- 不修改过滤逻辑
- 在声音列表底部添加 `<Text>` 提示组件

---

## 改动三：Android TTS 引擎引导

### 问题
Android 系统 TTS 引擎差异大，部分设备默认引擎中文质量差。

### 方案
Android 平台在声音选择 UI 顶部加一行提示：

> 建议在 **系统设置 → 语言和输入法 → 文字转语音** 中切换为「Google 文字转语音」引擎

提示仅在 `Platform.OS === 'android'` 时显示，样式同上。

---

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/utils/textUtils.ts` | 新增 `splitIntoSubClauses()` |
| `src/screens/ReaderScreen.tsx` | TTS 播放循环改为子句依次播放；iOS/Android 声音提示 UI |
| `src/screens/SettingsScreen.tsx` | iOS/Android 声音提示 UI |

---

## 不在本次范围内

- 云端 TTS（方案二）
- 修改 `parseSentences()` 的断句粒度（影响高亮）
- 新增 npm 依赖
- 修改 `ios/` 或 `android/` 目录

---

## 后续评估

完成方案一后，根据实际听感决定是否推进方案二（云端 TTS + 本地缓存）。评估标准：
- 断句是否自然
- iOS 增强音色是否明显提升
- Android 体验是否仍不达标
