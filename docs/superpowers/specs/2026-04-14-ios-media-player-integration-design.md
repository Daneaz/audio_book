# iOS Media Player 集成设计

**日期**: 2026-04-14  
**状态**: 已批准

## 背景

当前朗读功能使用 `expo-speech`，iOS 上设置了 `useApplicationAudioSession: false`，导致 TTS 绕过应用 audio session，无法与系统 media player 联动。用户在锁屏、控制中心、AirPods 均无法看到播放信息或控制朗读。

## 目标

1. 锁屏 / 控制中心显示正在朗读的书名和章节（Now Playing）
2. 锁屏按钮、AirPods、耳机线控能暂停 / 继续朗读（Remote Controls）

## 方案选型

选用 **`react-native-music-control`**：
- 轻量，专为 Now Playing + 远程控制设计
- 与 expo-speech 并行，不替换 TTS 引擎
- 改动集中在一个文件

## 架构

### 改动范围

仅修改 `src/hooks/useSpeech.ts`，以及调用 `speak()` 的地方传入 metadata。

### Audio Session

在 `speak()` 内部通过 `expo-av` 的 `Audio.setAudioModeAsync()` 将 audio session 设为 playback 模式（`playsInSilentModeIOS: true`, `staysActiveInBackground: false`），这是 Now Playing 显示的系统前提。

同时移除 `useApplicationAudioSession: false`，改为使用应用 audio session。

### useSpeech 接口变化

```ts
interface SpeechMetadata {
  title?: string;   // 书名
  artist?: string;  // 章节名（复用 artist 字段展示）
}

speak(text: string, options?: Speech.SpeechOptions & SpeechMetadata): void
```

`title` / `artist` 会从 options 中提取并传给 MusicControl，不影响 `expo-speech` 的 SpeechOptions。

### MusicControl 生命周期

| 事件 | MusicControl 操作 |
|------|-------------------|
| speak 调用时 | `setNowPlaying({ title, artist })` + `updatePlayback({ state: STATE_PLAYING })` + 启用控制 |
| onStart 回调 | 无需额外操作（speak 时已设置） |
| onDone / onStopped / onError | `resetNowPlaying()` + `updatePlayback({ state: STATE_STOPPED })` |
| pause 调用时 | `updatePlayback({ state: STATE_PAUSED })` |
| resume 调用时 | `updatePlayback({ state: STATE_PLAYING })` |

### 远程控制注册

在 `useSpeech` 初始化时（useEffect）注册以下命令，组件卸载时清理：

```
MusicControl.on('play',  () => resume())
MusicControl.on('pause', () => pause())
MusicControl.on('stop',  () => stop())
```

`nextTrack` / `previousTrack` 本期不实现。

### 调用方变化（ReaderScreen）

```ts
speak(text, {
  title: book.title,
  artist: chapter.title,
  rate, pitch, ...其他 SpeechOptions
})
```

## 依赖

新增：`react-native-music-control`  
安装后需要重新 `expo prebuild` + `expo run:ios`（native 模块需重新链接）。

## 不在范围内

- Android 集成（android/ 不可修改）
- nextTrack / previousTrack 控制
- 进度条（elapsed time）同步
