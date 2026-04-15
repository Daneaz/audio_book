# TTS 跨章节滚动失效修复

**日期：** 2026-04-15

## 问题描述

TTS 朗读时会高亮当前句并跟随滚动。章节内滚动正常，但当朗读从章节 1 推进到章节 2 时，滚动停止跟随。

## 根因

`ReaderScreen.tsx` 中的 TTS 滚动 effect（约 567–613 行）使用如下阈值条件决定是否触发滚动：

```js
if (estimatedY > currentOffset + screenHeight * 0.55) {
  flatListRef.current?.scrollToOffset(...)
}
```

**边界失效场景：**

章节 1 最后一句被滚动至屏幕 55% 处，此时：
- `estimatedY_lastSentence ≈ currentOffset + screenHeight * 0.55`
- 章节 2 紧接章节 1 末尾：`chLayout2.y ≈ estimatedY_lastSentence`
- 切换到章节 2 第 0 句时：`estimatedY = chLayout2.y ≈ currentOffset + screenHeight * 0.55`
- 阈值判断结果为假（或边界），**滚动不触发**
- 章节 2 前段句子的 `estimatedY` 持续低于阈值，导致滚动长时间停滞

## 修复方案

**方案 A（已选）：检测章节切换，强制滚动**

在 TTS 滚动 effect 中，用一个 ref 追踪上一次的 `currentSpeakingChapterId`。当章节切换时，跳过阈值直接触发滚动。

### 改动范围

**文件：** `src/screens/ReaderScreen.tsx`

**改动 1：** 在 `flatListRef` 附近新增 ref：

```js
const prevSpeakingChapterIdRef = useRef<string | null>(null);
```

**改动 2：** 在滚动 effect 的竖向逻辑中，在计算 `estimatedY` 之后增加章节切换检测，并修改触发条件：

```js
const isChapterTransition =
  prevSpeakingChapterIdRef.current !== null &&
  prevSpeakingChapterIdRef.current !== currentSpeakingChapterId;
prevSpeakingChapterIdRef.current = currentSpeakingChapterId;

if (isChapterTransition || estimatedY > currentOffset + screenHeight * 0.55) {
  const targetOffset = Math.max(0, estimatedY);
  if (isAutoScrolling.value) {
    autoScrollOffset.value = targetOffset;
  }
  flatListRef.current?.scrollToOffset({ offset: targetOffset, animated: true });
}
```

### 边界情况

| 场景 | 处理 |
|------|------|
| `chLayout` 为 null（章节尚未渲染） | 走现有 `scrollToIndex` fallback，不受影响 |
| 章节内手动选句（`currentSpeakingChapterId` 不变） | `isChapterTransition = false`，不触发强制滚动 |
| 横向翻页模式 | ref 在 `if (horizontal)` 分支前更新，但强制滚动逻辑仅在 `else` 分支，横向不受影响 |
| TTS 从停止到重新开始（同一章节） | `prevSpeakingChapterIdRef` 上次记录的是同一章节 ID，`isChapterTransition = false` |

## 不改动的部分

- `!chLayout` fallback（`scrollToIndex`）
- 横向翻页模式滚动逻辑
- `USER_SCROLL_COOLDOWN` 防抖逻辑
- `speakSentence` 章节切换逻辑
