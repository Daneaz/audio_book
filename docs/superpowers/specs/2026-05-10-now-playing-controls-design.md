# Now Playing 控件（后台朗读 Media Player）设计

**日期**: 2026-05-10
**状态**: 待批准
**取代**: [`2026-04-14-ios-media-player-integration-design.md`](./2026-04-14-ios-media-player-integration-design.md)（基于 `react-native-music-control`，因依赖与 RN 0.81 / React 19 不兼容、`node_modules` 中实际未安装、调用全部走 noop fallback，方案废弃）

## 背景

应用支持本地 TTS（`expo-speech`）与云端 TTS（讯飞，通过 `expo-audio` 播单句 mp3）两条朗读路径。`UIBackgroundModes: ["audio"]` / `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 已声明，云端路径已设 `shouldPlayInBackground: true`，所以朗读在后台**能持续出声**（见已知风险一节关于本地 TTS 的限制）。

但用户在 iOS lock screen / 控制中心、Android 通知栏 / lock screen 上**看不到任何控件**：暂停、继续、跳句必须解锁回到 app 内操作，体验显著低于市面成熟听书 app。

`ReaderScreen.tsx` 已写有 `MusicControl.setNowPlaying / updatePlayback / on('play'|'pause'|'stop')` 调用骨架，但因依赖空缺，全部命中 `src/utils/musicControl.ts` 的 noop fallback。

## 目标

1. iOS lock screen / 控制中心、Android 通知栏 / lock screen 显示 **书名 / 章节名 / 书封**
2. 暴露四个控件：**播放、暂停、上一句、下一句**
3. 控件操作正确驱动现有朗读流（`pauseSpeech / resumeSpeech / speakSentence`）
4. 来电、其他音频抢占时**自动暂停**，抢占结束**自动恢复**
5. 本地 TTS 与云端 TTS **同样支持**（控件层与音频引擎解耦）
6. 后台朗读期间 Android 进程**不被系统轻易杀**（前台 service + MediaSession）

## 非目标

- ❌ 进度条 / seek
- ❌ ±15 秒 跳跃 / 倍速控件（倍速由设置页控制，不上 lock screen）
- ❌ 睡眠定时器在 lock screen 的可视化（定时器仍工作，仅不显示）
- ❌ CarPlay / Android Auto
- ❌ Web 平台（项目本身禁用 web）
- ❌ 锁屏后本地 `expo-speech` 出声不稳定的修复（见已知风险）

## 方案选型

**选项**：自实现 expo config plugin + 项目内 native module，仅做"显示控件 + 转发用户事件"，**不接管音频引擎**。

**对比已否决方案**：

| 方案 | 否决理由 |
|---|---|
| 继续用 `react-native-music-control` | 已与 RN 0.81 / React 19 不兼容，`node_modules` 中实际未安装；上游多年未更新 |
| 接入 `react-native-track-player` | 设计为"音频文件队列播放器"。云端 mp3 可套，但本地 `expo-speech` 不是文件、套不进 `Player` 接口；为此造"静音占位轨道"破坏抽象 |
| 复用 androidx media3 `Player` 接口直接驱动 | 本项目朗读引擎在 RN 侧（expo-speech / expo-audio），把音频流抽到 native 等于重写 TTS 层，远超本特性范围 |

**关键判断**：用户已确认不要进度条 / 不要 seek，标准媒体框架最大价值（统一进度 + seek）用不上。"显示控件 + 转发事件"职责窄，自实现成本可控（约 iOS 150 行 + Android 250 行 + 80 行 config plugin）。

## 架构

```
┌──────────────────────────────────────────────────────────┐
│ ReaderScreen.tsx  (UI / 朗读控制流，几乎保持原样)         │
│   start/pause/resume/stop/speakSentence                  │
└──────────────┬───────────────────────────────────────────┘
               │ 调用                       订阅
               ▼                           ▲
┌──────────────────────────────┐   ┌──────────────────────┐
│ NowPlaying  (新增 JS 适配层)  │   │ NowPlayingEvents     │
│ - update(metadata)           │   │  play / pause /      │
│ - setState('playing'|...)    │   │  next / previous /   │
│ - reset()                    │   │  interruption-begin/ │
│ - addListener(...)           │   │  interruption-end    │
└──────────────┬───────────────┘   └──────────▲───────────┘
               │ NativeModules                │ DeviceEventEmitter
               ▼                              │
┌──────────────────────────────────────────────────────────┐
│ ExpoNowPlaying (新增 expo module + config plugin)        │
│  ┌──────────────────────┐  ┌─────────────────────────┐  │
│  │ iOS (Swift)          │  │ Android (Kotlin)        │  │
│  │ MPNowPlayingInfoCenter│  │ MediaSessionService +   │  │
│  │ MPRemoteCommandCenter │  │ MediaSession + Notif.   │  │
│  │ AVAudioSession (intr.)│  │ AudioFocus + media3     │  │
│  └──────────────────────┘  └─────────────────────────┘  │
└──────────────────────────────────────────────────────────┘

[音频引擎层] ── 完全不变 ──
LocalTtsProvider ─ expo-speech
XfyunTtsProvider ─ expo-audio (createAudioPlayer)
```

### 模块边界（关键）

- **`NowPlaying` 适配层**（`src/utils/nowPlaying.ts`）替换现有 `src/utils/musicControl.ts/.native.ts`；API 收紧到 4 个方法
- **`ExpoNowPlaying` native module** 不持有任何音频引擎引用；不知道是 expo-speech 还是 mp3；只负责"显示什么 + 转发用户按了什么"
- **TTS provider 不需要改动**；ReaderScreen 业务逻辑保持原样，仅替换 import + 调用名
- **Android service 生命周期** 由 native module 内部管理；RN 不直接启停 service

## JS 接口

`src/utils/nowPlaying.ts` 单文件导出，全平台统一；jest 环境 fallback 为 noop。

```ts
export type NowPlayingMetadata = {
  title: string;          // 书名
  subtitle: string;       // 章节名
  artworkUri?: string;    // 本地文件 URI 或 http URL；缺失/失败时不显示封面
};

export type NowPlayingState = 'playing' | 'paused' | 'stopped';

export type NowPlayingEvent =
  | 'play' | 'pause' | 'next' | 'previous'
  | 'interruption-begin' | 'interruption-end';

export interface NowPlaying {
  update(metadata: NowPlayingMetadata): Promise<void>;
  setState(state: NowPlayingState): Promise<void>;
  reset(): Promise<void>;
  addListener(event: NowPlayingEvent, handler: () => void): () => void;
}

export default nowPlaying as NowPlaying;
```

### 调用契约

| 时机 | 调用 |
|---|---|
| 用户点"开始朗读" | `update({title, subtitle, artworkUri})` → `setState('playing')` |
| 句子切换（同章内） | 不调用 |
| 章节切换 | `update({title, subtitle: 新章节, artworkUri})`，state 保持 |
| 用户点暂停 / 远程暂停 | `setState('paused')` |
| 用户点继续 / 远程播放 | `setState('playing')` |
| 用户停止 / 退出 ReaderScreen | `reset()` |
| 收到 `interruption-begin` | native 自动 `setState('paused')`，RN 标记 `wasPlaying=true` |
| 收到 `interruption-end` | RN 若 `wasPlaying`，调 `resumeSpeech()`（resume 内部会调 `setState('playing')`）|

设计要点：
- `update` 与 `setState` 拆开：metadata 在跨章变化、state 在播放/暂停切换时变化，分开避免无意义更新
- 不暴露 `enableControl(name, bool)`：四控件固定显示，简化 API
- artwork 用 URI（BookService 封面已是文件路径），native 层异步加载，失败静默
- `addListener` 返回 unsubscribe 函数，避免 `off(event)` 漏调

## 数据流与状态机

### 出向（RN → native）

```
ReaderScreen 业务事件             NowPlaying 调用                native 行为
─────────────────────────────────────────────────────────────────
startSpeech()           ──►  update(book, ch1)    ──►  写 nowPlayingInfo / MediaSession metadata
                        ──►  setState('playing')  ──►  iOS: state=playing
                                                      Android: startForegroundService + 通知出现

speakSentence(ch, n)    ──►  (无调用)              ──►  (lock screen 不变)

跨章 (ch1 → ch2)         ──►  update(book, ch2)    ──►  仅 metadata 改变，state 保持

pauseSpeech()           ──►  setState('paused')   ──►  iOS: state=paused（控件保留）
                                                      Android: 通知保留、playPause 图标翻转、service 仍在前台

resumeSpeech()          ──►  setState('playing')  ──►  state=playing

stopSpeech()            ──►  reset()              ──►  iOS: nowPlayingInfo=nil + audioSession setActive(false)
                                                      Android: stopForeground(REMOVE) + stopSelf
退出 ReaderScreen       ──►  reset()              ──►  同上
```

### 入向（native → RN）

```
源                              事件                ReaderScreen 处理
─────────────────────────────────────────────────────────────────
iOS MPRemoteCommand         ── 'play'        ──►  resumeSpeech()
                            ── 'pause'       ──►  pauseSpeech()
                            ── 'nextTrack'   ──►  speakSentence(curCh, curIdx + 1)
                            ── 'previousTrack' ──►  speakSentence(curCh, curIdx - 1)

Android MediaSession.Callback 同上四种

iOS AVAudioSession.interruption / Android AudioFocus
                            ── 'interruption-begin' ─►  pauseSpeech() (内部 wasPlayingBeforeInterruption=true)
                            ── 'interruption-end'   ─►  if wasPlayingBeforeInterruption: resumeSpeech()
```

### 上一句 / 下一句 精确语义

- **next**：立即 `tts.stop()` → 句子游标 `curIdx + 1` → `speakSentence` 重启朗读。本章末句则跳下一章首句；全书末则触发 `stopSpeech()`
- **previous**：永远跳到上一句重新朗读（不做"5 秒内回当前句开头"的播客式启发）。本章首句则跳上一章末句；全书首则忽略

理由：TTS 句子普遍 8–25 秒，"回当前句开头" ≈ "重读当前句"。统一为"上一句"行为可预测。

### Reader 端最小新增状态

```ts
// 仅为处理 interruption 自动恢复
const wasPlayingBeforeInterruptionRef = useRef(false);
```

其他全部复用现有：`currentSpeakingChapterId` / `currentSentenceIndex` / `pausedPositionRef` / `isSpeakingRef`。

### 边界情况

| 情况 | 处理 |
|---|---|
| Reader 还没开始朗读，但收到 'play' 事件 | 忽略（防御；`reset()` 时已撤销控件，不应发生）|
| native 收到 'next' 但当前正在加载云端 mp3 | 标记新游标 + `tts.stop()`；`XfyunTtsProvider._gen` 自然吃掉旧任务 |
| 用户在 lock screen 反复狂按 next | 每次都 `tts.stop()` + `speakSentence(idx+1)`；provider generation 机制保证不串读 |
| 抢占期间用户已在系统层手动暂停 | `interruption-end` 不自动恢复（`wasPlayingBeforeInterruption === false`）|
| 抢占两秒后 ReaderScreen 卸载 | `reset()` 清掉所有；后续 interruption-end 找不到订阅自然丢弃 |

## Native 层细节

### iOS（Swift，约 150 行）

文件结构（`npx create-expo-module --local` 模板）：

```
modules/expo-now-playing/
├── expo-module.config.json
├── ios/
│   ├── ExpoNowPlayingModule.swift        // 主入口
│   ├── NowPlayingController.swift        // MPNowPlayingInfoCenter 封装
│   └── RemoteCommandHandler.swift        // MPRemoteCommandCenter 封装
└── src/
    └── ExpoNowPlayingModule.ts           // 仅声明 native 接口；nowPlaying.ts 包裹
```

**MPNowPlayingInfoCenter 字段映射**：
- `MPMediaItemPropertyTitle` ← `metadata.title`
- `MPMediaItemPropertyArtist` ← `metadata.subtitle`
- `MPMediaItemPropertyArtwork` ← 异步加载 `artworkUri`，成功后 patch 一次
- **故意不设** `MPMediaItemPropertyPlaybackDuration` / `MPNowPlayingInfoPropertyElapsedPlaybackTime`
- `MPNowPlayingInfoPropertyPlaybackRate` 取 0.0 / 1.0 配合 state（系统据此显示 ▶/⏸）

**MPRemoteCommandCenter 注册（仅 4 个）**：

```swift
center.playCommand.addTarget          { sendEvent("play") }
center.pauseCommand.addTarget         { sendEvent("pause") }
center.nextTrackCommand.addTarget     { sendEvent("next") }
center.previousTrackCommand.addTarget { sendEvent("previous") }
// 显式禁用 seek / skip(±15s) / changePlaybackPosition / rating
```

**AVAudioSession**：
- 监听 `AVAudioSession.interruptionNotification`：`.began` → 发 `interruption-begin` + native 内部自动 `setState('paused')`（同步翻 ▶/⏸ 图标）；`.ended` 且 `.shouldResume` 选项存在 → 发 `interruption-end`（不主动 setState，等 RN 调 resume）
- `setActive(true)` 时机：首次 `setState('playing')` 调用
- `setActive(false)` 时机：`reset()` 调用
- **契约**：`ExpoNowPlaying` 不主动设置 audio session category，依赖 expo-speech / expo-audio 自身的 category 配置；任何音频引擎组件不得直接调用 `MPRemoteCommandCenter`
- 由 RN 侧 `pauseSpeech()` 触发的 `setState('paused')` 与 native 自动 setState 重复时是**幂等无副作用**的，不需要去重

### Android（Kotlin，约 250 行）

文件结构：

```
modules/expo-now-playing/
└── android/
    ├── src/main/java/expo/modules/nowplaying/
    │   ├── ExpoNowPlayingModule.kt       // 主入口
    │   ├── NowPlayingService.kt          // foreground service (extends MediaSessionService)
    │   ├── PlayerStub.kt                 // 实现 androidx.media3.common.Player 的最小子集
    │   └── ArtworkLoader.kt              // 异步加载封面位图
    └── build.gradle                      // androidx.media3 依赖
```

**为什么需要 `PlayerStub`**：AndroidX media3 `MediaSession` 强制绑定 `Player` 实例。本项目音频引擎在 RN 侧，故 `PlayerStub` 是空壳：
- `play()` / `pause()` / `seekToNext()` / `seekToPrevious()` → 转发为 module 事件
- `getPlaybackState()` / `getPlayWhenReady()` → 由最近一次 `setState` 驱动
- `getCurrentMediaItem()` → 由 `update(metadata)` 构造
- 其他 30+ `Player` 接口方法 → `throw UnsupportedOperationException` 或返回安全默认值

**MediaSessionService 生命周期**：

```
RN: setState('playing')  ─► 若 service 未起：startForegroundService(NowPlayingService)
                            └─► onCreate: 创建 MediaSession + PlayerStub
                                         注册 MediaStyle Notification
                                         请求 AudioFocus
                            若 service 已起：仅更新 PlayerStub 状态 (幂等)
RN: update(metadata)     ─► service.updateMetadata()
                            (改 PlayerStub.currentMediaItem，Notification 自动刷新)
RN: setState('paused')   ─► PlayerStub 状态切换；service 仍在前台 (通知不可被滑掉)
RN: setState('playing') 再次 ─► PlayerStub 状态切换 (幂等)
RN: reset()              ─► stopForeground(STOP_FOREGROUND_REMOVE) + stopSelf()
                            释放 MediaSession + AudioFocus
```

设计要点：service 在第一次 `setState('playing')` 时启动，在 `reset()` 时停止。中间任意 paused ↔ playing 切换不影响 service 生命周期。

**AudioFocus**：
- 注册 `AudioFocusRequest` (USAGE_MEDIA + CONTENT_TYPE_SPEECH)
- `AUDIOFOCUS_LOSS_TRANSIENT` → 发 `interruption-begin` + native 内部自动 `setState('paused')`（与 iOS 行为对齐）
- `AUDIOFOCUS_GAIN`（紧跟 transient loss 之后）→ 发 `interruption-end`（不主动 setState，等 RN 调 resume）
- `AUDIOFOCUS_LOSS`（永久丢失）→ 发 `pause` 事件（不发 interruption-end）

**Notification**：
- MediaStyle，紧凑视图：play/pause + previous + next
- channel id `now_playing`，IMPORTANCE_LOW（不弹横幅、无声）
- 点击通知主体 → `PendingIntent` 拉起 main activity（不携带额外数据）

**`POST_NOTIFICATIONS` 权限**：
- 首次点击"开始朗读"时由 RN 端调用 `PermissionsAndroid.request(POST_NOTIFICATIONS)`
- 拒绝后**不再追问**；朗读仍工作，仅通知 / lock screen 控件不显示
- 实现位置：`ReaderScreen.startSpeech` 入口，仅 Android 13+ 执行

### Expo Config Plugin（约 80 行）

职责：
1. **iOS**：注入 podspec 引用模块；不需要改 Info.plist（`UIBackgroundModes: audio` 已存在）
2. **Android**：往 `AndroidManifest.xml` 注入：

   ```xml
   <service
     android:name="expo.modules.nowplaying.NowPlayingService"
     android:exported="false"
     android:foregroundServiceType="mediaPlayback">
     <intent-filter>
       <action android:name="androidx.media3.session.MediaSessionService"/>
     </intent-filter>
   </service>
   ```

3. **Android**：复制 notification icon 到 `res/drawable`（mono 白色矢量图，由项目 assets 提供）
4. 不新增权限：`FOREGROUND_SERVICE_MEDIA_PLAYBACK` / `POST_NOTIFICATIONS` 已在 `app.json`

### 模块放置

`modules/expo-now-playing/` —— 项目内部 expo module（`npx create-expo-module --local`），不发 npm。`app.json` 的 `plugins` 列表加入 `"./modules/expo-now-playing"`。

## 错误处理

| 失败点 | 影响 | 处理 |
|---|---|---|
| `update()` 时 artwork 文件不存在 / 解码失败 | lock screen 无封面 | 静默：异步加载失败时不再 patch metadata，已设的 title/subtitle 保留 |
| `setState('playing')` 时 native module 未初始化 | 第一句已开始读但 lock screen 没控件 | RN 端 try/catch + console.warn；不抛给业务层；下一次 setState 自动恢复 |
| iOS RemoteCommand handler 内 sendEvent 抛错 | 系统认为 app 没处理这个键 | Swift 内 try? 包住；handler 永远 return `.success` |
| Android service 启动失败（系统拒绝前台权限） | 后台被杀风险增加但播放继续 | catch + console.warn；不阻塞 RN 主流程；MediaSession 仍能更新 |
| Android `POST_NOTIFICATIONS` 被拒 | 通知与 lock screen 控件均不显示 | 不重复请求；朗读仍工作 |
| `interruption-end` 在 ReaderScreen 已卸载后到达 | 监听已 unsubscribe，事件丢弃 | 自然行为，无需处理 |
| 同一时间多次远程命令（用户快按）| 现有 `_gen` 机制吃掉旧任务 | 无需新增 |

## 已知风险

1. **iOS 锁屏后 `expo-speech` 行为**：Apple 未官方保证 `AVSpeechSynthesizer` 在锁屏 / 长时间后台持续合成；社区报告两种结果都有。**云端 TTS 路径不受影响**（`expo-audio` 播 mp3 是 `AVAudioPlayer`，后台是一等公民）。控件本身不受影响（NowPlaying 控件由 `MPNowPlayingInfoCenter` 驱动，与谁出声无关）。**不在本特性修复范围**。
2. **Android OEM 杀后台**：小米 / 华为 / OPPO 等深度修改 ROM 会忽略前台 service 在屏幕关闭后的进程保护。前台 service + MediaSession 是 Google 给出的最大努力。
3. **media3 1.x → 2.x**：未来升级 androidx.media3 可能要改 `PlayerStub`。**缓解**：固定到具体小版本（写进 `build.gradle`），升级前回归测试。
4. **MPRemoteCommand 与 expo-audio 双重监听**：`createAudioPlayer` 默认不会注册 RemoteCommand，但若未来开启某些选项可能冲突。**契约**：任何音频引擎组件不得直接调用 `MPRemoteCommandCenter`（写在本 spec 与代码注释中）。
5. **package.json 残留 `react-native-music-control`**：实施时必须一并删除并 `expo prebuild --clean`，否则可能被开发者误引入。

## 测试策略

### 第 1 层：JS 单元测试（jest）

新增 `__tests__/utils/nowPlaying.test.ts`：

| 测试用例 | 断言 |
|---|---|
| `update + setState('playing')` 调用顺序 | mock 的 native module 收到正确参数顺序 |
| `setState('stopped')` 之后再 `update` | 不应抛错（容错）|
| `addListener` 返回的 unsubscribe 调用后 | handler 不再被触发 |
| 同一事件多次 `addListener` | 各 handler 独立触发，独立 unsubscribe |
| `reset()` 之后再 setState | 应能正常工作（重新激活）|

不为 `ReaderScreen` 增补测试：当前 `ReaderScreen.tsx` 3000+ 行无相关测试覆盖，本次只做"等价替换"不引入新业务逻辑。

### 第 2 层：手工集成测试 checklist

每条都需在 **iOS 真机 + Android 真机** 各跑一遍（模拟器锁屏行为不可信）。

#### iOS 真机
- [ ] 本地音色：开始朗读 → 锁屏 → lock screen 出现书名 / 章节 / 封面 / 控件
- [ ] 本地音色：lock screen 按 ⏸ → 朗读暂停 → 按 ▶ → 继续
- [ ] 本地音色：lock screen 按 next → 跳到下一句
- [ ] 本地音色：lock screen 按 prev → 跳到上一句
- [ ] 云端音色：上述四条同样行为
- [ ] 朗读中来电话 → 暂停；挂断 → 自动恢复
- [ ] 朗读中开 Apple Music 播歌 → 暂停；停 Music → 不自动恢复（Music 不发 `.shouldResume`）
- [ ] 退出 ReaderScreen → lock screen 控件消失
- [ ] 章节自动切换 → lock screen subtitle 更新但播放不间断
- [ ] 控制中心反复狂按 next → 不卡死、不串读

#### Android 真机
- [ ] 本地 / 云端音色：朗读启动 → 通知栏出现 MediaStyle 通知（书名 / 章节 / 封面 / 控件）
- [ ] 锁屏 → lock screen 出现同款控件
- [ ] 通知栏按 ⏸ / ▶ / next / prev 行为正确
- [ ] 暂停状态下通知不能滑掉
- [ ] 退出 ReaderScreen → 通知消失
- [ ] 朗读中来电话 → 暂停；挂断 → 恢复
- [ ] 朗读中开 YouTube 播视频 → 暂停；切回本 app → 不自动恢复
- [ ] 蓝牙耳机硬件 play / pause 键 → 工作（远程命令副产品）
- [ ] **Android 13+ 设备首次点击"开始朗读"** → 弹 `POST_NOTIFICATIONS` 权限对话框
- [ ] 拒绝权限后 → 朗读仍工作但通知不出现（不崩）
- [ ] 屏幕熄灭 30 分钟后回来 → 朗读仍在进行（标准 Android 设备；OEM 设备视为已知风险）

### 第 3 层：回归

- [ ] 卸载 `react-native-music-control` 依赖 + `expo prebuild --clean` 成功
- [ ] `npm run ios` / `npm run android` 干净构建无 NowPlaying 相关警告
- [ ] 现有 jest 测试套件全绿（删除 musicControl 相关 mock 后仍跑通）
- [ ] 全文 grep `MusicControl` / `musicControl` 无残留

### 测试风险

- iOS 模拟器无法测锁屏：必须真机
- Android emulator 部分情况能测：MediaSession + 通知能在 emulator 上验证；锁屏 + AudioFocus 抢占需真机

## 实施顺序（高层）

下游 writing-plans skill 将基于此细化为可执行步骤。高层顺序：

1. 删除 `react-native-music-control` 依赖与 `src/utils/musicControl.ts/.native.ts`
2. `npx create-expo-module --local modules/expo-now-playing` 生成骨架
3. 实现 iOS native 层
4. 实现 Android native 层
5. 写 expo config plugin
6. 写 `src/utils/nowPlaying.ts` 适配层 + jest 测试
7. 替换 `ReaderScreen.tsx` 中所有 `MusicControl.*` 调用为 `nowPlaying.*`，加 `wasPlayingBeforeInterruptionRef` 与 interruption 监听
8. `expo prebuild --clean` + iOS/Android 真机集成测试 checklist 全过
