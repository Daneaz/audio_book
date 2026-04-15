# TTS 跨章节滚动修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 TTS 朗读从章节 1 切换到章节 2 时滚动停止跟随的 bug。

**Architecture:** 在 TTS 滚动 effect 中新增一个 ref 追踪上一次的朗读章节 ID。当章节 ID 发生变化时，跳过 55% 阈值判断，直接滚动到当前句位置，确保章节切换时屏幕始终跟随。

**Tech Stack:** React Native, react-native-reanimated, Expo Speech

---

### Task 1: 新增 ref 并修改 TTS 滚动条件

**Files:**
- Modify: `src/screens/ReaderScreen.tsx:428-435`（ref 声明区）
- Modify: `src/screens/ReaderScreen.tsx:596-611`（滚动 effect 竖向逻辑）

- [ ] **Step 1: 在 `flatListRef` 声明附近（约第 429 行）新增 ref**

找到：
```ts
const flatListRef = useAnimatedRef<Animated.FlatList<ChapterData | PageData>>();
const chapterLayoutsRef = useRef<Record<string, { y: number; height: number }>>({});
```

在 `chapterLayoutsRef` 声明之后插入：
```ts
const prevSpeakingChapterIdRef = useRef<string | null>(null);
```

- [ ] **Step 2: 修改 TTS 滚动 effect 的竖向逻辑**

找到（约第 596-611 行）：
```ts
      const ratio = sentence.start / Math.max(1, chData.content.length);
      const estimatedY = chLayout.y + ratio * chLayout.height;
      const currentOffset = isAutoScrolling.value ? autoScrollOffset.value : scrollPos.value;
      const screenHeight = window.height;

      // Follow when it goes near the bottom (e.g. 80%)
      if (estimatedY > currentOffset + screenHeight * 0.55) {
        const targetOffset = Math.max(0, estimatedY);
        if (isAutoScrolling.value) {
          autoScrollOffset.value = targetOffset;
        }
        flatListRef.current?.scrollToOffset({
          offset: targetOffset,
          animated: true,
        });
      }
```

替换为：
```ts
      const ratio = sentence.start / Math.max(1, chData.content.length);
      const estimatedY = chLayout.y + ratio * chLayout.height;
      const currentOffset = isAutoScrolling.value ? autoScrollOffset.value : scrollPos.value;
      const screenHeight = window.height;

      const isChapterTransition =
        prevSpeakingChapterIdRef.current !== null &&
        prevSpeakingChapterIdRef.current !== currentSpeakingChapterId;
      prevSpeakingChapterIdRef.current = currentSpeakingChapterId;

      if (isChapterTransition || estimatedY > currentOffset + screenHeight * 0.55) {
        const targetOffset = Math.max(0, estimatedY);
        if (isAutoScrolling.value) {
          autoScrollOffset.value = targetOffset;
        }
        flatListRef.current?.scrollToOffset({
          offset: targetOffset,
          animated: true,
        });
      }
```

- [ ] **Step 3: 确认改动不影响其他分支**

检查以下几点（阅读代码，不需要运行）：
- `prevSpeakingChapterIdRef.current = currentSpeakingChapterId` 位于 `if (!chLayout)` 分支的下方，确保 `chLayout` 为 null 时 ref 也会被正确更新（避免下次有 layout 时误判为章节切换）

  如果该赋值位于 `if (!chLayout) { ... return; }` 的 return 前面，则需要在 return 前也更新 ref。检查实际代码位置，确保 ref 在 `!chLayout` 的 return 路径上也被更新。

  具体：在 `if (!chLayout) { ... return; }` 块内，`return` 之前插入：
  ```ts
  prevSpeakingChapterIdRef.current = currentSpeakingChapterId;
  ```

- [ ] **Step 4: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "fix: TTS 跨章节时强制滚动，修复章节切换滚动失效"
```

---

### Task 2: 手动验证

由于该 bug 依赖 TTS 和渲染时序，无法用单元测试覆盖。通过 iOS Simulator 手动验证。

- [ ] **Step 1: 启动开发服务器（如未启动）**

```bash
expo start
```

- [ ] **Step 2: 打开一本多章节书，定位到章节末尾附近**

选取一本章节较短的书，或将阅读进度跳到章节接近末尾的位置。

- [ ] **Step 3: 开启 TTS 朗读**

点击朗读按钮，确认章节内滚动正常（高亮句跟随屏幕滚动）。

- [ ] **Step 4: 等待 TTS 读到章节结尾，自动切换到下一章节**

观察：切换后屏幕是否继续跟随高亮句滚动。

**预期结果：** 章节切换后滚动继续正常，高亮句始终保持在屏幕可见区域。

**修复前的现象（对照）：** 章节切换后屏幕停止滚动，直到 TTS 读到下一章节的较深位置才恢复。
