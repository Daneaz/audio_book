# iOS Media Player 集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 expo-speech 朗读时与 iOS 锁屏/控制中心 media player 联动，支持 Now Playing 展示和远程控制（播放/暂停/停止）。

**Architecture:** 安装 `react-native-music-control`，在 `ReaderScreen.tsx` 的 `startSpeech`/`stopSpeech`/`speakSentence` 处集成 Now Playing 更新和远程控制注册。同时移除 `useApplicationAudioSession: false` 并配置 expo-av audio session 为 playback 模式。远程控制 handler 通过 ref 持有最新函数引用，避免 stale closure。

**Tech Stack:** expo-speech（现有）、react-native-music-control（新增）、expo-av（现有，已安装）

---

### Task 1: 安装并链接 react-native-music-control

**Files:**
- Modify: `package.json`（npm install 自动更新）

- [ ] **Step 1: 安装依赖**

```bash
cd /Users/eugenewu/code/audio_book
npm install react-native-music-control
```

Expected: 安装成功，`package.json` 中出现 `"react-native-music-control"`。

- [ ] **Step 2: Prebuild 重新生成 native 项目**

```bash
expo prebuild --clean
```

Expected: ios/ 和 android/ 目录重新生成，`react-native-music-control` native 模块自动链接（autolinking）。

- [ ] **Step 3: 重新构建并运行**

```bash
expo run:ios
```

Expected: App 成功编译并在模拟器启动，无报错。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: 安装 react-native-music-control"
```

---

### Task 2: 移除 useApplicationAudioSession:false，配置 audio session

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

**背景：** `speakSentence`（ReaderScreen.tsx:1147）中有 `useApplicationAudioSession: false`，导致 TTS 绕过 app audio session，无法与 media player 联动。`startSpeech` 需要在调用前配置 audio session 为 playback 模式。

- [ ] **Step 1: 在 ReaderScreen 顶部 import Audio**

找到 `src/screens/ReaderScreen.tsx` 顶部：

```ts
import * as Speech from 'expo-speech';
```

在其后一行加入：

```ts
import { Audio } from 'expo-av';
```

- [ ] **Step 2: 移除 useApplicationAudioSession: false**

找到 `src/screens/ReaderScreen.tsx:1147`（在 `speakSentence` 中的 `Speech.speak` 调用内）：

```ts
          useApplicationAudioSession: false,
```

删除整行。

- [ ] **Step 3: 在 startSpeech 中配置 audio session**

在 `src/screens/ReaderScreen.tsx`，找到 `startSpeech` 函数的第一行 `setIsSpeaking(true);`，在其**之前**插入：

```ts
      Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        allowsRecordingIOS: false,
      }).catch(() => {});
```

- [ ] **Step 4: 验证朗读正常**

保存后热更新，在 App 内开始朗读，确认朗读功能正常无报错。

- [ ] **Step 5: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "fix: 移除 useApplicationAudioSession:false，配置 audio session"
```

---

### Task 3: 集成 Now Playing 信息展示

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

**背景：** `book` 是 `useState<Book | null>` 存储当前书籍（含 `.title`）。`chaptersData` 是章节数组（每项有 `.chapter.title`）。`currentSpeakingChapterId` 在 `speakSentence` 中随章节切换更新。

- [ ] **Step 1: Import MusicControl**

在 `src/screens/ReaderScreen.tsx` 顶部，在 `import { Audio } from 'expo-av';` 之后加入：

```ts
import MusicControl from 'react-native-music-control';
```

- [ ] **Step 2: 在 startSpeech 末尾设置 Now Playing**

在 `startSpeech` 函数末尾的 `if (startChapterId) { speakSentence(startChapterId, startSentenceIndex); }` 之后加入：

```ts
      MusicControl.enableControl('play', true);
      MusicControl.enableControl('pause', true);
      MusicControl.enableControl('stop', true);
      MusicControl.enableControl('nextTrack', false);
      MusicControl.enableControl('previousTrack', false);

      const startingChapter = chaptersData.find(c => c.chapter.id === startChapterId);
      MusicControl.setNowPlaying({
        title: book?.title ?? '',
        artist: startingChapter?.chapter.title ?? '',
      });
      MusicControl.updatePlayback({ state: MusicControl.STATE_PLAYING });
```

- [ ] **Step 3: 在 stopSpeech 中重置 Now Playing**

在 `stopSpeech` 函数中，`Speech.stop();` 之后加入：

```ts
      MusicControl.resetNowPlaying();
```

- [ ] **Step 4: 章节切换时更新 Now Playing**

在 ReaderScreen 现有 useEffect 列表末尾（清理 effect 之前）加入：

```ts
  useEffect(() => {
    if (!isSpeaking || !currentSpeakingChapterId) return;
    const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
    MusicControl.setNowPlaying({
      title: book?.title ?? '',
      artist: chData?.chapter.title ?? '',
    });
  }, [currentSpeakingChapterId, isSpeaking]);
```

- [ ] **Step 5: 验证 Now Playing 展示**

开始朗读后按 Home 键切至后台，在控制中心或锁屏确认能看到书名和章节名。

- [ ] **Step 6: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: 集成 iOS Now Playing 信息展示"
```

---

### Task 4: 注册远程控制命令

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

**背景：** 远程控制 handler 在 mount 时注册（useEffect with `[]`），但 `startSpeech`/`stopSpeech` 是每次 render 重新创建的函数。需要用 ref 持有最新版本，避免 stale closure。`isSpeakingRef` 的使用与此相同，参照现有模式。

- [ ] **Step 1: 新增 startSpeechRef 和 stopSpeechRef**

在 `src/screens/ReaderScreen.tsx`，找到：

```ts
  const isSpeakingRef = useRef(false);
```

在其后加入：

```ts
  const startSpeechRef = useRef<() => void>(() => {});
  const stopSpeechRef = useRef<() => void>(() => {});
```

- [ ] **Step 2: 在每次 render 后同步 ref**

在 `stopSpeech` 函数定义之后（Task 2、3 改动之后）加入：

```ts
  useEffect(() => {
    startSpeechRef.current = startSpeech;
    stopSpeechRef.current = stopSpeech;
  });
```

注意：无依赖数组，每次 render 后都同步，确保 handler 始终调用最新版本。

- [ ] **Step 3: 注册远程控制监听（mount 时）**

在现有 useEffect 列表中，加入以下 effect（放在 Step 2 effect 之后）：

```ts
  useEffect(() => {
    MusicControl.handleAudioInterruptions(true);

    MusicControl.on('play', () => {
      if (!isSpeakingRef.current) startSpeechRef.current();
    });
    MusicControl.on('pause', () => {
      if (isSpeakingRef.current) stopSpeechRef.current();
    });
    MusicControl.on('stop', () => {
      stopSpeechRef.current();
    });

    return () => {
      MusicControl.resetNowPlaying();
    };
  }, []);
```

- [ ] **Step 4: 验证远程控制**

1. 开始朗读
2. 按 Home 键后台，在控制中心点暂停 → 朗读停止，Now Playing 消失
3. 点播放 → 朗读从当前页重新开始
4. 若有 AirPods：双击暂停/播放

- [ ] **Step 5: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: 注册 iOS 远程控制命令（锁屏/AirPods/耳机线控）"
```
