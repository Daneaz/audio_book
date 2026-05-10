# Now Playing 控件 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 iOS lock screen / 控制中心、Android 通知栏 / lock screen 加播放、暂停、上一句、下一句四个控件，支持来电抢断自动暂停/恢复，本地与云端 TTS 行为一致。

**Architecture:** 项目内部 expo module（`modules/expo-now-playing/`），native 层（iOS Swift / Android Kotlin + media3）只做"显示控件 + 转发用户事件"，**不接管音频引擎**。RN 侧新增 `src/utils/nowPlaying.ts` 适配层取代废弃的 `react-native-music-control`。`ReaderScreen.tsx` 业务逻辑保持不变，仅替换 import。

**Tech Stack:**
- iOS：Swift, MPNowPlayingInfoCenter, MPRemoteCommandCenter, AVAudioSession
- Android：Kotlin, androidx.media3 (`MediaSessionService` + `MediaSession`)，前台 service
- 跨端：Expo SDK 54 module + config plugin（注入 AndroidManifest service 声明）
- RN：项目已有的 React 19 + RN 0.81

**Spec：** [`docs/superpowers/specs/2026-05-10-now-playing-controls-design.md`](../specs/2026-05-10-now-playing-controls-design.md)

**Commit policy（重要）：** 项目 `CLAUDE.md` 规定 *"不要自动提交或推送代码"*。本 plan 的每个 commit step 写出了完整命令，但**执行 agent 必须停下来询问用户授权**，得到明确同意才运行 `git commit`。如执行模式是 subagent-driven，主 agent 在 review 通过后由用户决定是否 commit。

---

## 文件总览

**新建：**
- `modules/expo-now-playing/expo-module.config.json`
- `modules/expo-now-playing/package.json`
- `modules/expo-now-playing/src/ExpoNowPlayingModule.ts`
- `modules/expo-now-playing/src/ExpoNowPlaying.types.ts`
- `modules/expo-now-playing/ios/ExpoNowPlaying.podspec`
- `modules/expo-now-playing/ios/ExpoNowPlayingModule.swift`
- `modules/expo-now-playing/ios/NowPlayingController.swift`
- `modules/expo-now-playing/ios/RemoteCommandHandler.swift`
- `modules/expo-now-playing/ios/AudioInterruptionObserver.swift`
- `modules/expo-now-playing/android/build.gradle`
- `modules/expo-now-playing/android/src/main/AndroidManifest.xml`
- `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/ExpoNowPlayingModule.kt`
- `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/NowPlayingService.kt`
- `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/PlayerStub.kt`
- `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/ArtworkLoader.kt`
- `modules/expo-now-playing/plugin/src/withExpoNowPlaying.ts`
- `modules/expo-now-playing/plugin/build.gradle.no` *(占位 — 实际 plugin 入口见下)*
- `modules/expo-now-playing/app.plugin.js`
- `modules/expo-now-playing/plugin/tsconfig.json`
- `modules/expo-now-playing/plugin/package.json`
- `src/utils/nowPlaying.ts`
- `__tests__/utils/nowPlaying.test.ts`

**修改：**
- `package.json` — 删除 `react-native-music-control` 依赖
- `app.json` — `plugins` 列表加入 `"./modules/expo-now-playing/app.plugin.js"`
- `src/screens/ReaderScreen.tsx` — 替换 `MusicControl` 为 `nowPlaying`，加 `wasPlayingBeforeInterruptionRef`，加 interruption listener，加 next/previous 处理，加 `POST_NOTIFICATIONS` 权限请求

**删除：**
- `src/utils/musicControl.ts`
- `src/utils/musicControl.native.ts`
- `__tests__/musicControlFallback.test.ts`

---

## Task 1：清理废弃的 react-native-music-control 依赖

**目的：** 把当前未实际工作的旧依赖与 fallback 文件清理干净，避免后续误引入。

**Files:**
- Modify: `package.json` — 删除 `react-native-music-control`
- Delete: `src/utils/musicControl.ts`
- Delete: `src/utils/musicControl.native.ts`
- Delete: `__tests__/musicControlFallback.test.ts`

- [ ] **Step 1.1：删除 package.json 里的 react-native-music-control 依赖**

```bash
cd /Users/eugenewu/code/audio_book
```

打开 `package.json`，找到第 65 行附近：

```json
"react-native-music-control": "^1.4.1",
```

整行删除。保持 JSON 合法（注意逗号）。

- [ ] **Step 1.2：删除 fallback 文件与测试**

```bash
rm src/utils/musicControl.ts
rm src/utils/musicControl.native.ts
rm __tests__/musicControlFallback.test.ts
```

- [ ] **Step 1.3：刷新 package-lock.json**

```bash
npm install
```

预期：lockfile 不再包含 `react-native-music-control`。`npm ls react-native-music-control` 应输出 `(empty)`。

- [ ] **Step 1.4：grep 确认无残留**

```bash
grep -rn "music-control\|MusicControl" src/ __tests__/ App.tsx index.ts
```

预期：**只有** `src/screens/ReaderScreen.tsx` 中现有 `MusicControl` 调用（这些会在 Task 7 中被替换）。其他位置 0 命中。

- [ ] **Step 1.5：跑一遍 jest，确认基线**

```bash
npx jest --listTests
```

预期：`musicControlFallback.test.ts` 不在列表中（已删除）。其他测试文件齐全。

```bash
npx jest --testPathPattern='paginationUtils|textUtils' 2>&1 | tail -10
```

预期：随机两个无关测试通过，证明 jest 配置仍然健康。

- [ ] **Step 1.6：Commit（询问用户授权后执行）**

```bash
git add package.json package-lock.json src/utils/musicControl.ts src/utils/musicControl.native.ts __tests__/musicControlFallback.test.ts
git commit -m "chore: remove unused react-native-music-control dependency

The package was never actually installed (incompatible with RN 0.81 / React 19) and all calls in ReaderScreen routed to a noop fallback. Removed dependency, fallback files, and the fallback test in preparation for the new ExpoNowPlaying native module."
```

注意：项目规则禁止自动提交。先把命令展示给用户、确认后才执行。

---

## Task 2：创建 expo module 骨架

**目的：** 用 expo 官方模板生成 module 目录结构，作为后续 iOS/Android/plugin 实现的容器。

**Files:**
- Create: `modules/expo-now-playing/` 完整目录

- [ ] **Step 2.1：创建本地 expo module**

```bash
cd /Users/eugenewu/code/audio_book
npx create-expo-module@latest --local modules/expo-now-playing
```

模板提示填写：
- `npm package name`: `expo-now-playing`
- `Native module name`: `ExpoNowPlaying`
- `iOS bundle identifier`: `com.eugenewwj.inkvoice.expo-now-playing`
- `Android package name`: `expo.modules.nowplaying`
- `Description`: `Now Playing controls for background TTS`
- `Author`: `Eugene`
- `License`: `MIT`
- `Repository URL`: 留空

- [ ] **Step 2.2：删除模板生成的样例代码**

模板会生成几个示例文件（hello world style）。删除：

```bash
cd modules/expo-now-playing
rm -rf example
rm -f ios/ExpoNowPlayingView.swift ios/ExpoNowPlayingViewManager.swift
rm -f android/src/main/java/expo/modules/nowplaying/ExpoNowPlayingView.kt
rm -f android/src/main/java/expo/modules/nowplaying/ExpoNowPlayingViewManager.kt
rm -f src/ExpoNowPlayingView.tsx src/ExpoNowPlayingView.web.tsx
rm -f src/index.ts          # 我们自己写
rm -f src/ExpoNowPlayingModule.ts   # 同上，会重写
```

只保留：
- `expo-module.config.json`
- `package.json`
- `ios/ExpoNowPlaying.podspec`
- `ios/ExpoNowPlayingModule.swift`
- `android/build.gradle`
- `android/src/main/AndroidManifest.xml`
- `android/src/main/java/expo/modules/nowplaying/ExpoNowPlayingModule.kt`

iOS 与 Android 主入口文件会在 Task 4 / Task 5 重写。

- [ ] **Step 2.3：检查 expo-module.config.json**

```bash
cat modules/expo-now-playing/expo-module.config.json
```

应类似：

```json
{
  "platforms": ["apple", "android"],
  "apple": {
    "modules": ["ExpoNowPlayingModule"]
  },
  "android": {
    "modules": ["expo.modules.nowplaying.ExpoNowPlayingModule"]
  }
}
```

如果模板生成的格式不同，调整为上述形态。`platforms` 不应包含 `web`。

- [ ] **Step 2.4：app.json 注册本地 module 自动发现**

打开 `app.json`，在 `expo` 顶层添加 `autolinkedModulesPath`（如果模板没自动加），并把 plugin 入口加进 `plugins`。先确认 plugin 文件，**Task 6 才创建** —— 此 step 暂不改 plugins 字段。

只验证：

```bash
ls modules/expo-now-playing/expo-module.config.json
```

预期：文件存在。本地 expo module 会被 autolink，无需手动改 app.json。

- [ ] **Step 2.5：Commit（询问用户授权后执行）**

```bash
git add modules/expo-now-playing
git commit -m "chore: scaffold expo-now-playing local module

Generated via 'npx create-expo-module --local', stripped sample View code. iOS/Android implementations and config plugin land in subsequent commits."
```

---

## Task 3：定义 TS 接口与 jest fallback（含单元测试）

**目的：** 先把 RN 侧适配层用 TDD 钉死。这是后续 native 实现的对照基准。本任务**不依赖** native 代码就绪：jest 测试在 mock 环境下跑。

**Files:**
- Create: `modules/expo-now-playing/src/ExpoNowPlaying.types.ts`
- Create: `modules/expo-now-playing/src/ExpoNowPlayingModule.ts`
- Create: `modules/expo-now-playing/src/index.ts`
- Create: `src/utils/nowPlaying.ts`
- Create: `__tests__/utils/nowPlaying.test.ts`

- [ ] **Step 3.1：写 types 文件**

创建 `modules/expo-now-playing/src/ExpoNowPlaying.types.ts`：

```ts
export type NowPlayingMetadata = {
  title: string;
  subtitle: string;
  artworkUri?: string;
};

export type NowPlayingState = 'playing' | 'paused' | 'stopped';

export type NowPlayingEvent =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'interruption-begin'
  | 'interruption-end';

export type ExpoNowPlayingEvents = {
  [K in NowPlayingEvent]: () => void;
};
```

- [ ] **Step 3.2：写 module 入口**

创建 `modules/expo-now-playing/src/ExpoNowPlayingModule.ts`：

```ts
import { NativeModule, requireNativeModule } from 'expo';
import {
  ExpoNowPlayingEvents,
  NowPlayingMetadata,
  NowPlayingState,
} from './ExpoNowPlaying.types';

declare class ExpoNowPlayingModule extends NativeModule<ExpoNowPlayingEvents> {
  update(metadata: NowPlayingMetadata): Promise<void>;
  setState(state: NowPlayingState): Promise<void>;
  reset(): Promise<void>;
}

export default requireNativeModule<ExpoNowPlayingModule>('ExpoNowPlaying');
```

创建 `modules/expo-now-playing/src/index.ts`：

```ts
export { default } from './ExpoNowPlayingModule';
export * from './ExpoNowPlaying.types';
```

- [ ] **Step 3.3：写适配层（先空壳，等测试驱动实现）**

创建 `src/utils/nowPlaying.ts`：

```ts
import {
  NowPlayingEvent,
  NowPlayingMetadata,
  NowPlayingState,
} from '../../modules/expo-now-playing/src/ExpoNowPlaying.types';

export interface NowPlaying {
  update(metadata: NowPlayingMetadata): Promise<void>;
  setState(state: NowPlayingState): Promise<void>;
  reset(): Promise<void>;
  addListener(event: NowPlayingEvent, handler: () => void): () => void;
}

const nowPlaying: NowPlaying = {
  async update() {},
  async setState() {},
  async reset() {},
  addListener() {
    return () => {};
  },
};

export default nowPlaying;
```

- [ ] **Step 3.4：写测试 — listener 增删**

创建 `__tests__/utils/nowPlaying.test.ts`：

```ts
const mockNative = {
  update: jest.fn(),
  setState: jest.fn(),
  reset: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
};

jest.mock('../../modules/expo-now-playing/src/ExpoNowPlayingModule', () => ({
  __esModule: true,
  default: mockNative,
}));

import nowPlaying from '../../src/utils/nowPlaying';

describe('nowPlaying adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('addListener returns an unsubscribe function that detaches the handler', () => {
    let stored: (() => void) | null = null;
    mockNative.addListener.mockImplementation((event: string, handler: () => void) => {
      stored = handler;
      return { remove: () => { stored = null; } };
    });

    const handler = jest.fn();
    const unsub = nowPlaying.addListener('play', handler);
    expect(mockNative.addListener).toHaveBeenCalledWith('play', handler);

    unsub();
    expect(stored).toBeNull();
  });

  it('multiple listeners for same event are independent', () => {
    const subs: Array<{ remove: () => void; handler: () => void }> = [];
    mockNative.addListener.mockImplementation((_e: string, handler: () => void) => {
      const s = { handler, remove: () => { /* removed flag */ } };
      subs.push(s);
      return s;
    });

    const h1 = jest.fn();
    const h2 = jest.fn();
    const u1 = nowPlaying.addListener('next', h1);
    const u2 = nowPlaying.addListener('next', h2);

    expect(subs.length).toBe(2);
    u1();
    u2();
    // unsubscribe each separately works
    expect(typeof u1).toBe('function');
    expect(typeof u2).toBe('function');
  });
});

describe('nowPlaying delegations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('update forwards metadata to native', async () => {
    await nowPlaying.update({ title: 'Book', subtitle: 'Ch 1', artworkUri: 'file:///cover.jpg' });
    expect(mockNative.update).toHaveBeenCalledWith({
      title: 'Book',
      subtitle: 'Ch 1',
      artworkUri: 'file:///cover.jpg',
    });
  });

  it('setState forwards state to native', async () => {
    await nowPlaying.setState('playing');
    expect(mockNative.setState).toHaveBeenCalledWith('playing');
  });

  it('reset forwards to native', async () => {
    await nowPlaying.reset();
    expect(mockNative.reset).toHaveBeenCalled();
  });

  it('update -> setState ordering preserved', async () => {
    await nowPlaying.update({ title: 'Book', subtitle: 'Ch' });
    await nowPlaying.setState('playing');
    const order = (mockNative.update.mock.invocationCallOrder[0]
      < mockNative.setState.mock.invocationCallOrder[0]);
    expect(order).toBe(true);
  });

  it('setState("stopped") followed by update does not throw', async () => {
    await nowPlaying.setState('stopped');
    await expect(
      nowPlaying.update({ title: 'Book', subtitle: 'Ch' })
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3.5：跑测试，看失败**

```bash
npx jest __tests__/utils/nowPlaying.test.ts 2>&1 | tail -30
```

预期：所有 6 个 test 失败（`mockNative.update` 等 `toHaveBeenCalled` 断言失败），因为当前 `nowPlaying.ts` 的方法都是空 noop。

- [ ] **Step 3.6：实现适配层让测试通过**

完整改写 `src/utils/nowPlaying.ts`：

```ts
import ExpoNowPlaying from '../../modules/expo-now-playing/src/ExpoNowPlayingModule';
import {
  NowPlayingEvent,
  NowPlayingMetadata,
  NowPlayingState,
} from '../../modules/expo-now-playing/src/ExpoNowPlaying.types';

export interface NowPlaying {
  update(metadata: NowPlayingMetadata): Promise<void>;
  setState(state: NowPlayingState): Promise<void>;
  reset(): Promise<void>;
  addListener(event: NowPlayingEvent, handler: () => void): () => void;
}

const nowPlaying: NowPlaying = {
  update(metadata) {
    return ExpoNowPlaying.update(metadata);
  },
  setState(state) {
    return ExpoNowPlaying.setState(state);
  },
  reset() {
    return ExpoNowPlaying.reset();
  },
  addListener(event, handler) {
    const sub = ExpoNowPlaying.addListener(event, handler);
    return () => {
      sub.remove();
    };
  },
};

export default nowPlaying;
```

- [ ] **Step 3.7：跑测试，看通过**

```bash
npx jest __tests__/utils/nowPlaying.test.ts 2>&1 | tail -15
```

预期：6 个 test 全部 PASS。

- [ ] **Step 3.8：跑全套 jest 不带 native，确认无回归**

```bash
npx jest 2>&1 | tail -10
```

预期：所有现有测试通过，包括新加的 `nowPlaying.test.ts`。如有失败，调查根因，不要 skip。

- [ ] **Step 3.9：Commit（询问用户授权后执行）**

```bash
git add modules/expo-now-playing/src src/utils/nowPlaying.ts __tests__/utils/nowPlaying.test.ts
git commit -m "feat(now-playing): add JS adapter layer with unit tests

Defines NowPlayingMetadata/State/Event types and a thin TS wrapper around the (yet-to-be-implemented) native module. Jest tests cover delegation, ordering, and listener subscribe/unsubscribe."
```

---

## Task 4：iOS native 实现

**目的：** Swift 实现 Now Playing 控件、远程命令、抢断处理。完成后从 RN 端调用应在锁屏 / 控制中心看到控件并能操作。

**Files:**
- Create: `modules/expo-now-playing/ios/ExpoNowPlaying.podspec`（模板已生成，可能需要微调）
- Create: `modules/expo-now-playing/ios/ExpoNowPlayingModule.swift`（重写）
- Create: `modules/expo-now-playing/ios/NowPlayingController.swift`
- Create: `modules/expo-now-playing/ios/RemoteCommandHandler.swift`
- Create: `modules/expo-now-playing/ios/AudioInterruptionObserver.swift`

- [ ] **Step 4.1：检查并修正 podspec**

打开 `modules/expo-now-playing/ios/ExpoNowPlaying.podspec`，确认包含框架链接：

```ruby
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoNowPlaying'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = { :ios => '15.1', :tvos => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'AVFoundation', 'MediaPlayer'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
```

关键差别 vs 模板默认：`s.frameworks` 必须加 `AVFoundation`、`MediaPlayer`。

- [ ] **Step 4.2：写 NowPlayingController**

创建 `modules/expo-now-playing/ios/NowPlayingController.swift`：

```swift
import Foundation
import MediaPlayer
import UIKit

final class NowPlayingController {
  static let shared = NowPlayingController()

  private var currentTitle: String = ""
  private var currentSubtitle: String = ""
  private var currentArtworkUri: String?
  private var artworkTask: URLSessionDataTask?

  func update(title: String, subtitle: String, artworkUri: String?) {
    currentTitle = title
    currentSubtitle = subtitle

    var info: [String: Any] = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    info[MPMediaItemPropertyTitle] = title
    info[MPMediaItemPropertyArtist] = subtitle
    // 不设置 PlaybackDuration / ElapsedPlaybackTime — 不要进度条
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info

    if artworkUri != currentArtworkUri {
      currentArtworkUri = artworkUri
      loadArtworkAsync(artworkUri)
    }
  }

  func setPlaying(_ isPlaying: Bool) {
    var info: [String: Any] = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  func reset() {
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    artworkTask?.cancel()
    artworkTask = nil
    currentArtworkUri = nil
  }

  private func loadArtworkAsync(_ uri: String?) {
    artworkTask?.cancel()
    artworkTask = nil
    guard let uri = uri, let url = URL(string: uri) else { return }

    let snapshotTitle = currentTitle
    let task = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard let self = self,
            let data = data,
            let image = UIImage(data: data),
            self.currentTitle == snapshotTitle else { return }
      let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
      DispatchQueue.main.async {
        var info: [String: Any] = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyArtwork] = artwork
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
      }
    }
    task.resume()
    artworkTask = task
  }
}
```

要点：
- artwork 异步加载，加载期间不阻塞 metadata 显示
- `snapshotTitle` 防止旧加载完成后覆盖新 metadata
- 只用 URLSession（支持 `file://` 与 `http(s)://`）；本项目封面是文件路径，URL 构造同样可处理

- [ ] **Step 4.3：写 RemoteCommandHandler**

创建 `modules/expo-now-playing/ios/RemoteCommandHandler.swift`：

```swift
import Foundation
import MediaPlayer

final class RemoteCommandHandler {
  static let shared = RemoteCommandHandler()

  private var registered = false
  private var playTarget: Any?
  private var pauseTarget: Any?
  private var nextTarget: Any?
  private var prevTarget: Any?

  var onPlay: (() -> Void)?
  var onPause: (() -> Void)?
  var onNext: (() -> Void)?
  var onPrevious: (() -> Void)?

  func register() {
    guard !registered else { return }
    registered = true

    let center = MPRemoteCommandCenter.shared()

    playTarget = center.playCommand.addTarget { [weak self] _ in
      self?.onPlay?()
      return .success
    }
    pauseTarget = center.pauseCommand.addTarget { [weak self] _ in
      self?.onPause?()
      return .success
    }
    nextTarget = center.nextTrackCommand.addTarget { [weak self] _ in
      self?.onNext?()
      return .success
    }
    prevTarget = center.previousTrackCommand.addTarget { [weak self] _ in
      self?.onPrevious?()
      return .success
    }

    // 显式禁用我们不想要的命令
    center.skipForwardCommand.isEnabled = false
    center.skipBackwardCommand.isEnabled = false
    center.changePlaybackPositionCommand.isEnabled = false
    center.seekForwardCommand.isEnabled = false
    center.seekBackwardCommand.isEnabled = false

    center.playCommand.isEnabled = true
    center.pauseCommand.isEnabled = true
    center.nextTrackCommand.isEnabled = true
    center.previousTrackCommand.isEnabled = true
  }

  func unregister() {
    guard registered else { return }
    registered = false

    let center = MPRemoteCommandCenter.shared()
    if let t = playTarget { center.playCommand.removeTarget(t) }
    if let t = pauseTarget { center.pauseCommand.removeTarget(t) }
    if let t = nextTarget { center.nextTrackCommand.removeTarget(t) }
    if let t = prevTarget { center.previousTrackCommand.removeTarget(t) }
    playTarget = nil
    pauseTarget = nil
    nextTarget = nil
    prevTarget = nil

    center.playCommand.isEnabled = false
    center.pauseCommand.isEnabled = false
    center.nextTrackCommand.isEnabled = false
    center.previousTrackCommand.isEnabled = false
  }
}
```

- [ ] **Step 4.4：写 AudioInterruptionObserver**

创建 `modules/expo-now-playing/ios/AudioInterruptionObserver.swift`：

```swift
import Foundation
import AVFoundation

final class AudioInterruptionObserver {
  static let shared = AudioInterruptionObserver()

  var onBegin: (() -> Void)?
  var onEnd: (() -> Void)?

  private var registered = false

  func start() {
    guard !registered else { return }
    registered = true
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
  }

  func stop() {
    guard registered else { return }
    registered = false
    NotificationCenter.default.removeObserver(self,
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
  }

  @objc private func handleInterruption(_ notification: Notification) {
    guard let info = notification.userInfo,
          let typeRaw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeRaw) else { return }

    switch type {
    case .began:
      onBegin?()
    case .ended:
      let optsRaw = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
      let opts = AVAudioSession.InterruptionOptions(rawValue: optsRaw)
      if opts.contains(.shouldResume) {
        onEnd?()
      }
    @unknown default:
      break
    }
  }
}
```

- [ ] **Step 4.5：写 ExpoNowPlayingModule 主入口**

完整重写 `modules/expo-now-playing/ios/ExpoNowPlayingModule.swift`：

```swift
import ExpoModulesCore
import AVFoundation

public class ExpoNowPlayingModule: Module {
  private var sessionActivated = false

  public func definition() -> ModuleDefinition {
    Name("ExpoNowPlaying")

    Events("play", "pause", "next", "previous", "interruption-begin", "interruption-end")

    OnCreate {
      RemoteCommandHandler.shared.onPlay = { [weak self] in self?.sendEvent("play") }
      RemoteCommandHandler.shared.onPause = { [weak self] in self?.sendEvent("pause") }
      RemoteCommandHandler.shared.onNext = { [weak self] in self?.sendEvent("next") }
      RemoteCommandHandler.shared.onPrevious = { [weak self] in self?.sendEvent("previous") }

      AudioInterruptionObserver.shared.onBegin = { [weak self] in
        // native 内部自动 paused，避免 lock screen 图标错位
        NowPlayingController.shared.setPlaying(false)
        self?.sendEvent("interruption-begin")
      }
      AudioInterruptionObserver.shared.onEnd = { [weak self] in
        // 不主动 setPlaying(true)，等 RN 调 setState('playing')
        self?.sendEvent("interruption-end")
      }
    }

    OnDestroy {
      RemoteCommandHandler.shared.unregister()
      AudioInterruptionObserver.shared.stop()
      deactivateAudioSessionIfActive()
    }

    AsyncFunction("update") { (metadata: [String: Any]) in
      let title = (metadata["title"] as? String) ?? ""
      let subtitle = (metadata["subtitle"] as? String) ?? ""
      let artworkUri = metadata["artworkUri"] as? String
      DispatchQueue.main.async {
        NowPlayingController.shared.update(title: title, subtitle: subtitle, artworkUri: artworkUri)
      }
    }

    AsyncFunction("setState") { (state: String) in
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        switch state {
        case "playing":
          self.activateAudioSessionIfNeeded()
          RemoteCommandHandler.shared.register()
          AudioInterruptionObserver.shared.start()
          NowPlayingController.shared.setPlaying(true)
        case "paused":
          NowPlayingController.shared.setPlaying(false)
        case "stopped":
          NowPlayingController.shared.reset()
          RemoteCommandHandler.shared.unregister()
          AudioInterruptionObserver.shared.stop()
          self.deactivateAudioSessionIfActive()
        default:
          break
        }
      }
    }

    AsyncFunction("reset") {
      DispatchQueue.main.async { [weak self] in
        NowPlayingController.shared.reset()
        RemoteCommandHandler.shared.unregister()
        AudioInterruptionObserver.shared.stop()
        self?.deactivateAudioSessionIfActive()
      }
    }
  }

  private func activateAudioSessionIfNeeded() {
    guard !sessionActivated else { return }
    do {
      // 不主动设置 category — 依赖 expo-speech / expo-audio 自身的配置
      try AVAudioSession.sharedInstance().setActive(true, options: [])
      sessionActivated = true
    } catch {
      print("[ExpoNowPlaying] AVAudioSession setActive(true) failed:", error)
    }
  }

  private func deactivateAudioSessionIfActive() {
    guard sessionActivated else { return }
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
      sessionActivated = false
    } catch {
      print("[ExpoNowPlaying] AVAudioSession setActive(false) failed:", error)
    }
  }
}
```

- [ ] **Step 4.6：iOS prebuild + 构建**

```bash
cd /Users/eugenewu/code/audio_book
npx expo prebuild --platform ios --clean
```

预期：成功，`ios/Pods/ExpoNowPlaying` 出现。

```bash
npx expo run:ios
```

预期：构建成功并启动模拟器。Swift 编译报错时按错误修代码（最常见：拼写错误、漏导入框架）。

**注意：** 项目 CLAUDE.md 禁止改动 ios/ 目录。`expo prebuild` 是允许的（它**重生成** ios/ 而非手动改）。

- [ ] **Step 4.7：模拟器烟雾测试**

模拟器中：进入一本书，点开始朗读。模拟器 control center（Cmd+Shift+H 两次回桌面 → 下拉控制中心）应显示：
- 标题：书名
- 副标题：章节名
- 控件：⏯/⏭/⏮（封面在模拟器上可能空，本地文件 URI 加载在模拟器需测，OK 移到真机验证）

按播放/暂停/上一首/下一首，确认 RN 端 `console.log` 输出收到对应事件（**Task 7 完成前**这些事件会被 RN 端忽略，但模块不应崩溃）。

如果控制中心**没出现控件**，最常见原因：`AVAudioSession.setActive(true)` 失败，或 `Info.plist` 没 `UIBackgroundModes: audio`（已确认存在）。打开 Xcode console 查日志。

- [ ] **Step 4.8：Commit（询问用户授权后执行）**

```bash
git add modules/expo-now-playing/ios ios
git commit -m "feat(now-playing): implement iOS native module

Adds NowPlayingController, RemoteCommandHandler, AudioInterruptionObserver. Module activates AVAudioSession only on first setState('playing') and tears down on reset. Audio session category is left to expo-speech/expo-audio."
```

注意 `ios/` 是 prebuild 重生成的，按项目规则不能手改但可纳入提交（重新生成的快照）。

---

## Task 5：Android native 实现

**目的：** Kotlin + media3 实现 MediaSession + 前台 service + 通知，行为对齐 iOS。

**Files:**
- Modify: `modules/expo-now-playing/android/build.gradle`
- Modify: `modules/expo-now-playing/android/src/main/AndroidManifest.xml`
- Create: `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/ExpoNowPlayingModule.kt`（重写）
- Create: `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/NowPlayingService.kt`
- Create: `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/PlayerStub.kt`
- Create: `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/ArtworkLoader.kt`

- [ ] **Step 5.1：build.gradle 加 media3 依赖**

打开 `modules/expo-now-playing/android/build.gradle`，找到 `dependencies { ... }`，加入：

```gradle
dependencies {
  implementation project(':expo-modules-core')

  // media3：固定到 1.4.x 小版本，升级前回归测
  implementation 'androidx.media3:media3-session:1.4.1'
  implementation 'androidx.media3:media3-common:1.4.1'

  // ArtworkLoader 用 OkHttp 拉远程 URI；本项目封面是 file:// 也能走
  implementation 'com.squareup.okhttp3:okhttp:4.12.0'
}
```

如果模板已有不同的 dependencies 块，**追加**而不是替换。

- [ ] **Step 5.2：AndroidManifest.xml 声明 service**

打开 `modules/expo-now-playing/android/src/main/AndroidManifest.xml`，确保完整内容是：

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application>
    <service
      android:name="expo.modules.nowplaying.NowPlayingService"
      android:exported="false"
      android:foregroundServiceType="mediaPlayback">
      <intent-filter>
        <action android:name="androidx.media3.session.MediaSessionService"/>
      </intent-filter>
    </service>
  </application>
</manifest>
```

`FOREGROUND_SERVICE_MEDIA_PLAYBACK` 权限不在这里加（已在主 app 的 `app.json` 声明）。

- [ ] **Step 5.3：写 PlayerStub**

创建 `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/PlayerStub.kt`：

```kotlin
package expo.modules.nowplaying

import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.DeviceInfo
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.Timeline
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.text.CueGroup
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * Empty Player implementation. We only update its state from RN; play/pause/seekToNext/seekToPrevious
 * commands forward to the module via callbacks (no actual audio playback here).
 */
class PlayerStub(
  private val onPlay: () -> Unit,
  private val onPause: () -> Unit,
  private val onNext: () -> Unit,
  private val onPrevious: () -> Unit,
) : SimpleBasePlayer(Looper.getMainLooper()) {

  private var playWhenReady = false
  private var currentMediaItem: MediaItem = MediaItem.EMPTY

  fun setMetadata(title: String, subtitle: String, artworkUri: android.net.Uri?) {
    val metadata = MediaMetadata.Builder()
      .setTitle(title)
      .setArtist(subtitle)
      .apply { if (artworkUri != null) setArtworkUri(artworkUri) }
      .build()
    currentMediaItem = MediaItem.Builder()
      .setMediaId("now-playing")
      .setMediaMetadata(metadata)
      .build()
    invalidateState()
  }

  fun setIsPlaying(isPlaying: Boolean) {
    playWhenReady = isPlaying
    invalidateState()
  }

  override fun getState(): State {
    return State.Builder()
      .setAvailableCommands(
        Player.Commands.Builder()
          .add(Player.COMMAND_PLAY_PAUSE)
          .add(Player.COMMAND_SEEK_TO_NEXT)
          .add(Player.COMMAND_SEEK_TO_PREVIOUS)
          .build()
      )
      .setPlayWhenReady(playWhenReady, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
      .setPlaybackState(if (playWhenReady) Player.STATE_READY else Player.STATE_READY)
      .setPlaylist(
        listOf(MediaItemData.Builder("now-playing")
          .setMediaItem(currentMediaItem)
          .setIsSeekable(false)
          .setDurationUs(C.TIME_UNSET)
          .build()
        )
      )
      .build()
  }

  override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
    if (playWhenReady) onPlay() else onPause()
    return Futures.immediateVoidFuture()
  }

  override fun handleSeekToNext(): ListenableFuture<*> {
    onNext()
    return Futures.immediateVoidFuture()
  }

  override fun handleSeekToPrevious(): ListenableFuture<*> {
    onPrevious()
    return Futures.immediateVoidFuture()
  }
}
```

要点：
- 继承 `SimpleBasePlayer`（media3 1.x 推荐基类，省去手写 30+ Player 接口方法）
- 仅声明 4 个可用命令
- handle* 回调把 RN 想要的事件转发出去；不真的播放任何东西

**完整 imports 提示**：上面代码块顶部 imports 需要补全为：

```kotlin
package expo.modules.nowplaying

import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
```

`MediaItemData` 是 `SimpleBasePlayer` 的内嵌类，可在 `getState()` 内用全限定 `SimpleBasePlayer.MediaItemData.Builder(...)`，或加 `import androidx.media3.common.SimpleBasePlayer.MediaItemData`。如编译报"unresolved reference"，按错误调整。

- [ ] **Step 5.4：写 ArtworkLoader**

创建 `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/ArtworkLoader.kt`：

```kotlin
package expo.modules.nowplaying

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.atomic.AtomicReference

object ArtworkLoader {
  private val client = OkHttpClient()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val currentToken = AtomicReference<String?>(null)

  fun load(uri: Uri?, onLoaded: (Bitmap?) -> Unit) {
    val token = uri?.toString()
    currentToken.set(token)
    if (uri == null) {
      mainHandler.post { onLoaded(null) }
      return
    }
    val scheme = uri.scheme ?: ""
    Thread {
      val bitmap = try {
        when (scheme) {
          "http", "https" -> {
            val req = Request.Builder().url(uri.toString()).build()
            client.newCall(req).execute().use { resp ->
              if (!resp.isSuccessful) null
              else resp.body?.byteStream()?.let { BitmapFactory.decodeStream(it) }
            }
          }
          "file", "" -> {
            val path = uri.path
            if (path != null) BitmapFactory.decodeFile(path) else null
          }
          else -> null
        }
      } catch (_: IOException) {
        null
      } catch (_: Exception) {
        null
      }
      // 只有当 token 仍是当前 token 时才回调
      if (currentToken.get() == token) {
        mainHandler.post { onLoaded(bitmap) }
      }
    }.start()
  }
}
```

- [ ] **Step 5.5：写 NowPlayingService**

创建 `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/NowPlayingService.kt`：

```kotlin
package expo.modules.nowplaying

import android.app.PendingIntent
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

class NowPlayingService : MediaSessionService(), AudioManager.OnAudioFocusChangeListener {

  private var mediaSession: MediaSession? = null
  private var player: PlayerStub? = null
  private var audioManager: AudioManager? = null
  private var focusRequest: AudioFocusRequest? = null
  private var hasTransientLoss = false

  companion object {
    @Volatile var instance: NowPlayingService? = null
    @Volatile var eventCallbacks: Callbacks? = null
  }

  interface Callbacks {
    fun onRemotePlay()
    fun onRemotePause()
    fun onRemoteNext()
    fun onRemotePrevious()
    fun onInterruptionBegin()
    fun onInterruptionEnd()
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    audioManager = getSystemService(AUDIO_SERVICE) as AudioManager

    val stub = PlayerStub(
      onPlay = { eventCallbacks?.onRemotePlay() },
      onPause = { eventCallbacks?.onRemotePause() },
      onNext = { eventCallbacks?.onRemoteNext() },
      onPrevious = { eventCallbacks?.onRemotePrevious() },
    )
    player = stub

    val sessionActivityIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(
        this, 0, it,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
    }

    mediaSession = MediaSession.Builder(this, stub)
      .apply { sessionActivityIntent?.let { setSessionActivity(it) } }
      .build()
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = mediaSession

  override fun onDestroy() {
    abandonAudioFocus()
    mediaSession?.run {
      player.release()
      release()
    }
    mediaSession = null
    player = null
    instance = null
    super.onDestroy()
  }

  fun updateMetadata(title: String, subtitle: String, artworkUri: android.net.Uri?) {
    player?.setMetadata(title, subtitle, artworkUri)
  }

  fun applyState(state: String) {
    when (state) {
      "playing" -> {
        requestAudioFocus()
        player?.setIsPlaying(true)
      }
      "paused" -> {
        player?.setIsPlaying(false)
      }
      "stopped" -> {
        player?.setIsPlaying(false)
        abandonAudioFocus()
      }
    }
  }

  fun stopFromRn() {
    abandonAudioFocus()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun requestAudioFocus() {
    val am = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val attrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
      val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(attrs)
        .setOnAudioFocusChangeListener(this)
        .build()
      focusRequest = req
      am.requestAudioFocus(req)
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    }
  }

  private fun abandonAudioFocus() {
    val am = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { am.abandonAudioFocusRequest(it) }
      focusRequest = null
    } else {
      @Suppress("DEPRECATION")
      am.abandonAudioFocus(this)
    }
  }

  override fun onAudioFocusChange(focusChange: Int) {
    when (focusChange) {
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        hasTransientLoss = true
        player?.setIsPlaying(false)
        eventCallbacks?.onInterruptionBegin()
      }
      AudioManager.AUDIOFOCUS_GAIN -> {
        if (hasTransientLoss) {
          hasTransientLoss = false
          eventCallbacks?.onInterruptionEnd()
        }
      }
      AudioManager.AUDIOFOCUS_LOSS -> {
        hasTransientLoss = false
        eventCallbacks?.onRemotePause()
      }
    }
  }
}
```

要点：
- `eventCallbacks` 是 module 与 service 的通信桥；module 在 OnCreate 里设；service 在 OnCreate 拿
- `MediaSessionService` 自动管理 MediaStyle Notification（无需手写）
- AudioFocus 监听抢断
- `stopFromRn()` 由 module 在 reset() 时调

**imports 提示**：注意 `STOP_FOREGROUND_REMOVE` 是 `android.app.Service` 的静态常量，在 Service 子类内可直接引用；如 Kotlin 编译报 unresolved，加 `import android.app.Service` 后写 `Service.STOP_FOREGROUND_REMOVE`。Build target 需 ≥ Android API 24（项目已满足）。

- [ ] **Step 5.6：写 ExpoNowPlayingModule（Kotlin 主入口）**

完整重写 `modules/expo-now-playing/android/src/main/java/expo/modules/nowplaying/ExpoNowPlayingModule.kt`：

```kotlin
package expo.modules.nowplaying

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoNowPlayingModule : Module(), NowPlayingService.Callbacks {

  private var serviceStarted = false

  override fun definition() = ModuleDefinition {
    Name("ExpoNowPlaying")

    Events("play", "pause", "next", "previous", "interruption-begin", "interruption-end")

    OnCreate {
      NowPlayingService.eventCallbacks = this@ExpoNowPlayingModule
    }
    OnDestroy {
      NowPlayingService.eventCallbacks = null
      NowPlayingService.instance?.stopFromRn()
      serviceStarted = false
    }

    AsyncFunction("update") { metadata: Map<String, Any?> ->
      val title = metadata["title"] as? String ?: ""
      val subtitle = metadata["subtitle"] as? String ?: ""
      val artworkStr = metadata["artworkUri"] as? String
      val artworkUri = artworkStr?.let { Uri.parse(it) }

      NowPlayingService.instance?.updateMetadata(title, subtitle, artworkUri)
    }

    AsyncFunction("setState") { state: String ->
      when (state) {
        "playing" -> {
          ensureServiceStarted()
          NowPlayingService.instance?.applyState("playing")
        }
        "paused" -> {
          NowPlayingService.instance?.applyState("paused")
        }
        "stopped" -> {
          NowPlayingService.instance?.applyState("stopped")
          NowPlayingService.instance?.stopFromRn()
          serviceStarted = false
        }
      }
    }

    AsyncFunction("reset") {
      NowPlayingService.instance?.stopFromRn()
      serviceStarted = false
    }
  }

  // ───────── service callbacks ─────────

  override fun onRemotePlay() = sendEvent("play")
  override fun onRemotePause() = sendEvent("pause")
  override fun onRemoteNext() = sendEvent("next")
  override fun onRemotePrevious() = sendEvent("previous")
  override fun onInterruptionBegin() = sendEvent("interruption-begin")
  override fun onInterruptionEnd() = sendEvent("interruption-end")

  // ───────── private ─────────

  private fun ensureServiceStarted() {
    if (serviceStarted) return
    val ctx = appContext.reactContext ?: return
    val intent = Intent(ctx, NowPlayingService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      ctx.startForegroundService(intent)
    } else {
      ctx.startService(intent)
    }
    serviceStarted = true
  }
}
```

- [ ] **Step 5.7：Android prebuild + 构建**

```bash
cd /Users/eugenewu/code/audio_book
npx expo prebuild --platform android --clean
npx expo run:android
```

预期：构建成功并安装到 emulator / 真机。Kotlin 编译报错按错误修；最常见：import 缺失、SimpleBasePlayer API 在 media3 版本间略有差异。如版本不匹配：先尝试调整 PlayerStub 的 override 签名，对照 media3 1.4.x 文档。

- [ ] **Step 5.8：Android emulator 烟雾测试**

启动应用、进书、点开始朗读。预期：
- emulator 通知栏出现 MediaStyle 通知（书名 / 章节 / play/pause/prev/next 三按钮）
- 锁屏后 lock screen 出现同样控件
- 点通知按钮 → adb logcat 能看到 `sendEvent` 相关日志（具体功能要等 Task 7）

如果通知**没出现**：
- 看 logcat 有无 `MediaSessionService` / `ExpoNowPlaying` 相关错误
- Android 13+ 检查是否给了 `POST_NOTIFICATIONS` 权限（可手动到设置打开）

- [ ] **Step 5.9：Commit（询问用户授权后执行）**

```bash
git add modules/expo-now-playing/android android
git commit -m "feat(now-playing): implement Android native module

Adds NowPlayingService (MediaSessionService), PlayerStub (SimpleBasePlayer), ArtworkLoader, AudioFocus interruption handling. Foreground service starts on first setState('playing') and is torn down on reset. Notification persists during pause."
```

---

## Task 6：Expo Config Plugin

**目的：** 让 expo prebuild 自动注入 AndroidManifest 的 service 声明。理论上 module 自己的 AndroidManifest.xml 会被合入主 app（manifest merger），所以这个 plugin 大部分情况下**不需要做事**，但保留作为以下用途：
- 万一未来要往主 app Info.plist / AndroidManifest 加权限/字段
- 把 module 的 plugin 接入路径标准化

**Files:**
- Create: `modules/expo-now-playing/plugin/package.json`
- Create: `modules/expo-now-playing/plugin/tsconfig.json`
- Create: `modules/expo-now-playing/plugin/src/withExpoNowPlaying.ts`
- Create: `modules/expo-now-playing/app.plugin.js`
- Modify: `app.json` — `plugins` 加入 `"./modules/expo-now-playing/app.plugin.js"`

- [ ] **Step 6.1：创建 plugin/package.json**

```json
{
  "name": "expo-now-playing-plugin",
  "version": "1.0.0",
  "private": true,
  "main": "build/withExpoNowPlaying.js",
  "scripts": {
    "build": "tsc"
  },
  "devDependencies": {
    "@expo/config-plugins": "~9.0.0",
    "expo-modules-autolinking": "*",
    "typescript": "~5.9.0"
  }
}
```

- [ ] **Step 6.2：创建 plugin/tsconfig.json**

```json
{
  "compilerOptions": {
    "outDir": "build",
    "module": "commonjs",
    "target": "es2019",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 6.3：写 plugin 主体**

创建 `modules/expo-now-playing/plugin/src/withExpoNowPlaying.ts`：

```ts
import { ConfigPlugin, withAndroidManifest } from '@expo/config-plugins';

const SERVICE_NAME = 'expo.modules.nowplaying.NowPlayingService';

const withExpoNowPlaying: ConfigPlugin = (config) => {
  // The module's own AndroidManifest.xml declares the service via manifest merger.
  // This plugin is currently a no-op placeholder for future native config injection.
  // Verify the service is present after prebuild — if manifest merger fails,
  // re-enable the explicit injection below.
  return config;
};

// Optional explicit-injection helper — kept for future use:
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function injectServiceIntoMainManifest(): ConfigPlugin {
  return (config) =>
    withAndroidManifest(config, (cfg) => {
      const app = cfg.modResults.manifest.application?.[0];
      if (!app) return cfg;
      app.service = app.service || [];
      const exists = app.service.some(
        (s: any) => s.$['android:name'] === SERVICE_NAME
      );
      if (!exists) {
        app.service.push({
          $: {
            'android:name': SERVICE_NAME,
            'android:exported': 'false',
            'android:foregroundServiceType': 'mediaPlayback',
          },
          'intent-filter': [
            {
              action: [
                { $: { 'android:name': 'androidx.media3.session.MediaSessionService' } },
              ],
            },
          ],
        });
      }
      return cfg;
    });
}

export default withExpoNowPlaying;
```

- [ ] **Step 6.4：编译 plugin**

```bash
cd modules/expo-now-playing/plugin
npm install
npm run build
```

预期：`build/withExpoNowPlaying.js` 生成。

- [ ] **Step 6.5：写 app.plugin.js**

创建 `modules/expo-now-playing/app.plugin.js`：

```js
module.exports = require('./plugin/build/withExpoNowPlaying').default;
```

- [ ] **Step 6.6：app.json 注册 plugin**

打开根目录 `app.json`，在 `plugins` 数组中加入：

```json
"plugins": [
  [
    "react-native-google-mobile-ads",
    { /* 现有配置 */ }
  ],
  "expo-font",
  "expo-audio",
  "./modules/expo-now-playing/app.plugin.js"
]
```

- [ ] **Step 6.7：跑 prebuild 验证 plugin 链路**

```bash
cd /Users/eugenewu/code/audio_book
npx expo prebuild --clean
```

预期：成功，无 plugin 相关错误。检查 `android/app/src/main/AndroidManifest.xml` 里**应**包含 `expo.modules.nowplaying.NowPlayingService`（来自 module 自己的 manifest merger）。

```bash
grep -n "NowPlayingService" android/app/src/main/AndroidManifest.xml
```

预期：至少 1 行命中。如未命中，说明 manifest merger 没生效，重启用 `injectServiceIntoMainManifest()` 替换 plugin 主体（把 step 6.3 的两个函数对换）。

- [ ] **Step 6.8：Commit（询问用户授权后执行）**

```bash
git add modules/expo-now-playing/plugin modules/expo-now-playing/app.plugin.js app.json android ios
git commit -m "feat(now-playing): add expo config plugin scaffolding

Plugin is currently a no-op (module's AndroidManifest is merged automatically). The injection helper is retained as a fallback in case manifest merger fails on future Expo SDK upgrades."
```

---

## Task 7：ReaderScreen 集成

**目的：** 把 ReaderScreen 中所有 `MusicControl.*` 调用替换为 `nowPlaying.*`，新增 next/previous/interruption 处理与 `POST_NOTIFICATIONS` 权限请求。

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

每个 step 都涉及精确行号 — 实施前先 `grep -n "MusicControl" src/screens/ReaderScreen.tsx` 拿到当前最新行号，因为前面任务可能不会修改这文件，但保险起见。

- [ ] **Step 7.1：替换 import**

`ReaderScreen.tsx` 第 7 行：

```ts
import MusicControl from '../utils/musicControl';
```

替换为：

```ts
import nowPlaying from '../utils/nowPlaying';
import { Platform, PermissionsAndroid } from 'react-native';
```

注意：`Platform` 已在第 2 行 import 里有，**不要重复**。`PermissionsAndroid` 需要追加到第 2 行的 react-native import。

具体改第 2 行：

```ts
import { View, Text, TextInput, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator, StatusBar, Platform, ViewToken, useColorScheme, FlatListProps, AppState, Modal, Animated as RNAnimated, PermissionsAndroid } from 'react-native';
```

第 7 行替换为：

```ts
import nowPlaying from '../utils/nowPlaying';
```

- [ ] **Step 7.2：替换 startSpeech 中的 MusicControl 调用**

定位 `startSpeech` 中的 MusicControl 块（spec 时第 1278–1298 行附近）：

```ts
// @ts-ignore
MusicControl.enableControl('play', true);
// @ts-ignore
MusicControl.enableControl('pause', true);
// @ts-ignore
MusicControl.enableControl('stop', true);
// @ts-ignore
MusicControl.enableControl('nextTrack', false);
// @ts-ignore
MusicControl.enableControl('previousTrack', false);

const startingChapter = chaptersData.find(c => c.chapter.id === startChapterId);
// @ts-ignore
MusicControl.setNowPlaying({
  title: book?.title ?? '',
  artist: startingChapter?.chapter.title ?? '',
});
// @ts-ignore
MusicControl.updatePlayback({ state: MusicControl.STATE_PLAYING });
// @ts-ignore
if (Platform.OS === 'ios') MusicControl.handleAudioInterruptions(true);
```

整段替换为：

```ts
const startingChapter = chaptersData.find(c => c.chapter.id === startChapterId);
await ensurePostNotificationsPermission();
nowPlaying.update({
  title: book?.title ?? '',
  subtitle: startingChapter?.chapter.title ?? '',
  artworkUri: book?.coverUri ?? undefined,
});
nowPlaying.setState('playing');
```

注意：
- `startSpeech` 函数本身不是 async — 加 `await ensurePostNotificationsPermission()` 之前先把 `startSpeech` 改成 `async`（看下一步）
- `book.coverUri` 字段名以 `Book` 类型实际定义为准；先 `grep -n "coverUri\|cover" src/types.ts` 确认；若是 `coverPath` / `cover` / 别的，对应改

- [ ] **Step 7.3：把 startSpeech 标记为 async**

定位 `startSpeech = (` 行（约 1230 行附近）：

```ts
const startSpeech = () => {
```

改为：

```ts
const startSpeech = async () => {
```

确认调用方（如 `startSpeechRef.current()` 的地方）不依赖同步返回。如果有 `.then(...)` 之类的，按需调整。

- [ ] **Step 7.4：实现 ensurePostNotificationsPermission**

在 ReaderScreen 函数体顶部（其他工具函数附近）添加：

```ts
const ensurePostNotificationsPermission = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  if (Platform.Version < 33) return;
  try {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (granted) return;
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  } catch (e) {
    console.warn('[ReaderScreen] POST_NOTIFICATIONS request error:', e);
  }
};
```

放在 ReaderScreen 函数体最顶部（在 useState 之前，作为 helper），或作为模块级常量（如果不依赖 React 状态，更佳 — 我推荐模块级）。

模块级版本（放在 import 之后、`interface ChapterData` 之前）：

```ts
async function ensurePostNotificationsPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (Platform.Version < 33) return;
  try {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (granted) return;
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
  } catch (e) {
    console.warn('[ReaderScreen] POST_NOTIFICATIONS request error:', e);
  }
}
```

- [ ] **Step 7.5：替换 stopSpeech 中的 MusicControl**

定位 `stopSpeech` 函数（约 1305 行）：

```ts
const stopSpeech = () => {
  speakSessionRef.current++;
  tts.stop();
  pausedPositionRef.current = null;
  MusicControl.resetNowPlaying();
  ...
};
```

把 `MusicControl.resetNowPlaying();` 替换为：

```ts
nowPlaying.reset();
```

- [ ] **Step 7.6：替换 pauseSpeech 中的 MusicControl**

定位 `pauseSpeech`（约 1321 行）：

```ts
const pauseSpeech = () => {
  tts.stop();
  ...
  // @ts-ignore
  if (Platform.OS === 'ios') MusicControl.enableBackgroundMode(true);

  const chData = chaptersData.find(c => c.chapter.id === pausedChapterId);
  // @ts-ignore
  MusicControl.setNowPlaying({
    title: book?.title ?? '',
    artist: chData?.chapter.title ?? '',
  });
  // @ts-ignore
  MusicControl.updatePlayback({ state: MusicControl.STATE_PAUSED });
};
```

整段（从 `if (Platform.OS === 'ios')` 到 `STATE_PAUSED` 行）替换为：

```ts
const chData = chaptersData.find(c => c.chapter.id === pausedChapterId);
nowPlaying.update({
  title: book?.title ?? '',
  subtitle: chData?.chapter.title ?? '',
  artworkUri: book?.coverUri ?? undefined,
});
nowPlaying.setState('paused');
```

- [ ] **Step 7.7：替换 resumeSpeech 中的 MusicControl**

定位 `resumeSpeech`（约 1343 行）：

```ts
if (savedPos) {
  setIsSpeaking(true);
  isSpeakingRef.current = true;
  const chData = chaptersData.find(c => c.chapter.id === savedPos.chapterId);
  // @ts-ignore
  MusicControl.setNowPlaying({
    title: book?.title ?? '',
    artist: chData?.chapter.title ?? '',
  });
  // @ts-ignore
  MusicControl.updatePlayback({ state: MusicControl.STATE_PLAYING });
  speakSentence(savedPos.chapterId, savedPos.sentenceIndex);
}
```

整段（从 `MusicControl.setNowPlaying` 到 `STATE_PLAYING` 行）替换为：

```ts
nowPlaying.update({
  title: book?.title ?? '',
  subtitle: chData?.chapter.title ?? '',
  artworkUri: book?.coverUri ?? undefined,
});
nowPlaying.setState('playing');
```

- [ ] **Step 7.8：替换 useEffect 注册的远程命令监听**

定位 `useEffect` 中的 `MusicControl.on(...)` 块（约 1381 行）：

```ts
useEffect(() => {
  // @ts-ignore
  MusicControl.enableBackgroundMode(true);
  // @ts-ignore
  MusicControl.on('play', () => {
    if (!isSpeakingRef.current) resumeSpeechRef.current();
  });
  // @ts-ignore
  MusicControl.on('pause', () => {
    if (isSpeakingRef.current) pauseSpeechRef.current();
  });
  // @ts-ignore
  MusicControl.on('stop', () => {
    stopSpeechRef.current();
  });

  return () => {
    // @ts-ignore
    MusicControl.off('play');
    // @ts-ignore
    MusicControl.off('pause');
    // @ts-ignore
    MusicControl.off('stop');
    MusicControl.resetNowPlaying();
  };
}, []);
```

整个 useEffect 替换为：

```ts
useEffect(() => {
  const unsubs: Array<() => void> = [];

  unsubs.push(nowPlaying.addListener('play', () => {
    if (!isSpeakingRef.current) resumeSpeechRef.current();
  }));
  unsubs.push(nowPlaying.addListener('pause', () => {
    if (isSpeakingRef.current) pauseSpeechRef.current();
  }));
  unsubs.push(nowPlaying.addListener('next', () => {
    handleRemoteSkipRef.current(+1);
  }));
  unsubs.push(nowPlaying.addListener('previous', () => {
    handleRemoteSkipRef.current(-1);
  }));
  unsubs.push(nowPlaying.addListener('interruption-begin', () => {
    if (isSpeakingRef.current) {
      wasPlayingBeforeInterruptionRef.current = true;
      pauseSpeechRef.current();
    } else {
      wasPlayingBeforeInterruptionRef.current = false;
    }
  }));
  unsubs.push(nowPlaying.addListener('interruption-end', () => {
    if (wasPlayingBeforeInterruptionRef.current) {
      wasPlayingBeforeInterruptionRef.current = false;
      resumeSpeechRef.current();
    }
  }));

  return () => {
    unsubs.forEach(u => u());
    nowPlaying.reset();
  };
}, []);
```

- [ ] **Step 7.9：声明 wasPlayingBeforeInterruptionRef + handleRemoteSkipRef**

定位 ReaderScreen 函数体内的其他 `useRef` 声明（grep `useRef`），在它们附近加：

```ts
const wasPlayingBeforeInterruptionRef = useRef(false);
const handleRemoteSkipRef = useRef<(delta: 1 | -1) => void>(() => {});
```

- [ ] **Step 7.10：实现 handleRemoteSkip**

在 `speakSentence` 定义之后（约 1462 行之后）加：

```ts
const handleRemoteSkip = (delta: 1 | -1) => {
  const cId = currentSpeakingChapterId;
  if (cId === null) return;
  const chData = chaptersData.find(c => c.chapter.id === cId);
  if (!chData) return;

  const targetIdx = currentSentenceIndex + delta;

  if (targetIdx >= 0 && targetIdx < chData.sentences.length) {
    speakSessionRef.current++;
    tts.stop();
    speakSentence(cId, targetIdx);
    return;
  }

  // 跨章
  const chIdx = chaptersData.findIndex(c => c.chapter.id === cId);
  if (delta === 1) {
    const nextCh = chaptersData[chIdx + 1];
    if (nextCh) {
      speakSessionRef.current++;
      tts.stop();
      speakSentence(nextCh.chapter.id, 0);
    } else {
      stopSpeech();
    }
  } else {
    const prevCh = chaptersData[chIdx - 1];
    if (prevCh && prevCh.sentences.length > 0) {
      speakSessionRef.current++;
      tts.stop();
      speakSentence(prevCh.chapter.id, prevCh.sentences.length - 1);
    }
    // 全书首：忽略
  }
};
```

并在 `useEffect` 同步 ref 块（约 1364 行 `startSpeechRef.current = startSpeech;` 那个 useEffect）的最后一行加：

```ts
handleRemoteSkipRef.current = handleRemoteSkip;
```

- [ ] **Step 7.11：替换跨章节自动更新 metadata 的 useEffect**

定位另一处 `MusicControl.setNowPlaying` 块（约 1806 行）：

```ts
useEffect(() => {
  if (!isSpeaking || !currentSpeakingChapterId) return;
  const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
  // @ts-ignore
  MusicControl.setNowPlaying({
    title: book?.title ?? '',
    artist: chData?.chapter.title ?? '',
  });
  // @ts-ignore
  MusicControl.updatePlayback({ state: MusicControl.STATE_PLAYING });
}, [currentSpeakingChapterId, isSpeaking, book, chaptersData]);
```

替换为：

```ts
useEffect(() => {
  if (!isSpeaking || !currentSpeakingChapterId) return;
  const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
  nowPlaying.update({
    title: book?.title ?? '',
    subtitle: chData?.chapter.title ?? '',
    artworkUri: book?.coverUri ?? undefined,
  });
  // 不调 setState — 跨章不需要重设 state（保持 playing）
}, [currentSpeakingChapterId, isSpeaking, book, chaptersData]);
```

- [ ] **Step 7.12：grep 验证无 MusicControl 残留**

```bash
grep -n "MusicControl\|musicControl" src/screens/ReaderScreen.tsx
```

预期：0 命中。

```bash
grep -rn "MusicControl\|musicControl" src/ __tests__/ App.tsx index.ts
```

预期：0 命中。

- [ ] **Step 7.13：TypeScript 编译检查**

```bash
npx tsc --noEmit 2>&1 | head -30
```

预期：无错误（如有，是 `Book.coverUri` 字段名错、`startSpeech` async 改动后调用方等问题，按错信修）。

- [ ] **Step 7.14：跑 jest 全套**

```bash
npx jest 2>&1 | tail -10
```

预期：全部通过。

- [ ] **Step 7.15：Commit（询问用户授权后执行）**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat(now-playing): wire ReaderScreen to ExpoNowPlaying

Replaces the noop MusicControl calls with the new nowPlaying adapter. Adds remote next/previous handlers, audio interruption auto-pause/resume via wasPlayingBeforeInterruptionRef, and POST_NOTIFICATIONS permission request on Android 13+."
```

---

## Task 8：集成验证（手工 checklist）

**目的：** 实际在 iOS / Android 真机上跑 spec 中规定的全部集成测试用例。

**Files:** 不修改。仅运行与验证。

- [ ] **Step 8.1：iOS 构建**

```bash
cd /Users/eugenewu/code/audio_book
npx expo run:ios --device
```

选择真机（不选模拟器）。

- [ ] **Step 8.2：iOS checklist 全过**

逐条勾选 spec [`docs/superpowers/specs/2026-05-10-now-playing-controls-design.md`](../specs/2026-05-10-now-playing-controls-design.md) #测试策略 → iOS 真机 列表中的 10 条用例。每条记录"PASS / FAIL + 说明"。

任何 FAIL 都停下来报告 — 不要进入 Android。

- [ ] **Step 8.3：Android 构建**

```bash
npx expo run:android --device
```

- [ ] **Step 8.4：Android checklist 全过**

逐条勾选 spec → Android 真机 列表中的 11 条用例。

- [ ] **Step 8.5：第 3 层回归**

```bash
grep -rn "MusicControl\|musicControl" .   --include='*.ts' --include='*.tsx' --include='*.js' --exclude-dir=node_modules --exclude-dir=ios --exclude-dir=android --exclude-dir=.git
```

预期：0 命中。

```bash
npx expo prebuild --clean
npm run ios
npm run android
```

均成功，无 NowPlaying 相关警告。

```bash
npx jest
```

预期：全套通过。

- [ ] **Step 8.6：写 PR description**

把 8.2 / 8.4 的 checklist 结果整理为 PR description 草稿（文件 `.git/PR_DESCRIPTION.md`，不进版本库），等待用户决定是否创建 PR。

格式示例：

```markdown
## Summary
- 替换废弃的 react-native-music-control 为新的项目内 expo module
- iOS lock screen / 控制中心 + Android 通知栏 / lock screen 显示书名/章节/封面/控件
- 支持 play / pause / 上一句 / 下一句、来电抢断自动恢复
- 本地与云端 TTS 行为一致

## Test plan
- [x] iOS 真机 集成 checklist 全过（10/10）
- [x] Android 真机 集成 checklist 全过（11/11）
- [x] jest 全套 ✓
- [x] grep MusicControl 0 命中 ✓
```

- [ ] **Step 8.7：是否提交 / 推送 / 创建 PR — 询问用户**

按项目规则：不自动 commit / push / 创 PR。把 PR 草稿展示给用户，等用户明确说"提交"才动作。

---

## 后续可能的遗留工作

下面三项**不在本 plan 范围**，列出供未来参考：

1. 锁屏后本地 `expo-speech` 出声不稳定的修复（需要把本地 TTS 改为预合成 wav 路径，等于重写 LocalTtsProvider）
2. 蓝牙耳机硬件按键的专门测试（理论上是远程命令副产品，应工作）
3. CarPlay / Android Auto 集成
