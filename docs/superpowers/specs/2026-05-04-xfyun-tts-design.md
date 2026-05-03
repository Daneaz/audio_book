# 讯飞 TTS 接入设计

## 背景

当前 App 使用 `expo-speech` 调用系统 TTS，中文效果依赖用户设备安装的语音包，质量参差不齐。本次在保留现有本地 TTS 能力的基础上，接入讯飞在线 TTS，提供两个高质量中文音色（晓燕、晓宇）。用户选中讯飞音色时启用云端 TTS 模式，选其他音色时沿用本地模式。

---

## 文件结构

### 新建文件

```
src/services/tts/
  TtsProvider.ts          # 接口定义
  LocalTtsProvider.ts     # 封装现有 expo-speech 逻辑
  XfyunTtsProvider.ts     # 讯飞 WebSocket API + expo-av 播放 + 本地缓存
src/hooks/useTts.ts       # 根据 voiceType 路由到对应 Provider
```

### 修改文件

```
src/utils/voiceUtils.ts       # 增加讯飞音色条目
src/utils/constants.ts        # 增加讯飞 API 配置（APPID / APIKey / APISecret）
src/screens/ReaderScreen.tsx  # Speech.speak() 替换为 tts.speak()，增加 prefetch 调用
src/screens/SettingsScreen.tsx # previewVoice 改用 tts.speak()，增加清缓存按钮
```

---

## Provider 接口

```typescript
interface TtsOptions {
  rate?: number;
  language?: string;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (e: Error) => void;
}

interface TtsProvider {
  speak(text: string, options: TtsOptions): void;
  prefetch(text: string): void;   // 后台预取并缓存，不触发播放
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}
```

`prefetch` 在 `LocalTtsProvider` 中是 no-op。

---

## useTts Hook

```typescript
function useTts(voiceType: string): {
  speak(text: string, options: TtsOptions): void;
  prefetch(text: string): void;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  isSpeaking: boolean;
  isPaused: boolean;
}
```

**路由规则**：
- `voiceType` 以 `xfyun:` 开头 → `XfyunTtsProvider`，voice 参数取冒号后部分（如 `xiaoyan`）
- 否则 → `LocalTtsProvider`

**voiceType 变化时**：先调 `stop()` 再切换 Provider 实例。

签名与现有 `useSpeech` 完全兼容，`ReaderScreen` 迁移成本最低。

---

## XfyunTtsProvider

### API

讯飞在线 TTS WebSocket 接口：`wss://tts-api.xfyun.cn/v2/tts`

鉴权：HMAC-SHA256 签名，参数来自 `constants.ts` 中的 `XFYUN_APPID` / `XFYUN_API_KEY` / `XFYUN_API_SECRET`。

返回数据为 base64 分片，拼接完整后写入本地 MP3 文件，再用 `expo-av` 播放。

### 缓存

```
FileSystem.cacheDirectory/xfyun_tts/<voiceId>/<md5(text)>.mp3
```

- cache key = `voiceId + text` 的 MD5（使用已有依赖 `expo-crypto`）
- `speak()` 和 `prefetch()` 调用前均先查缓存，命中则跳过 API 调用
- 所有缓存永久保留，直到用户手动清除
- 清缓存 = 删除 `xfyun_tts/` 整个目录

### 网络失败回退

API 请求或 WebSocket 连接失败时，静默 catch，改调 `LocalTtsProvider.speak()` 以相同参数继续朗读，用户无感知。

### pause / resume / stop

使用 `expo-av` 的 `Sound.pauseAsync()` / `Sound.playAsync()` / `Sound.stopAsync()`，行为与本地 TTS 一致。

### Mock 阶段

`constants.ts` 中 `XFYUN_APPID` / `XFYUN_API_KEY` / `XFYUN_API_SECRET` 填占位字符串。`XfyunTtsProvider.speak()` 在鉴权失败时触发回退，整体流程可跑通。

---

## 音色列表扩展

`voiceUtils.ts` 新增讯飞音色常量，`mergeWithInstalledVoices` 返回结果中置于中文区顶部：

```typescript
const XFYUN_VOICES: VoiceEntry[] = [
  { identifier: 'xfyun:xiaoyan', name: '晓燕', language: 'zh-CN', quality: 'Premium', installed: true },
  { identifier: 'xfyun:xiaoyu', name: '晓宇', language: 'zh-CN', quality: 'Premium', installed: true },
];
```

`installed: true` 避免显示"未安装"提示。音色条目在 SettingsScreen 中显示 `· 云端` 标签（区别于本地 Premium 音色）。

---

## SettingsScreen 变更

1. `previewVoice` 改用 `useTts` 的 `speak()`
2. 讯飞音色预览音频首次合成后永久缓存，后续预览直接播本地文件（预览文本固定，cache key 稳定）
3. 朗读设置组底部增加「清除讯飞语音缓存」按钮：
   - 仅当缓存目录存在且非空时可点击
   - 点击后删除缓存目录，显示已释放空间大小的 Toast 提示

---

## 端到端数据流

### 朗读流程（讯飞模式，含预取）

```
speakSentence(cId, sIndex)
  → tts.speak(sentences[sIndex], { onDone })   # 播放当前句
  → tts.prefetch(sentences[sIndex + 1])         # 后台预取 N+1
  → tts.prefetch(sentences[sIndex + 2])         # 后台预取 N+2

tts.speak / tts.prefetch (XfyunTtsProvider):
  → 查缓存：xfyun_tts/xiaoyan/<md5>.mp3 存在？
      是 → expo-av 直接播放（prefetch 则跳过）
      否 → WebSocket 请求讯飞 API
             成功 → 写 MP3 到缓存 → expo-av 播放（prefetch 则只写缓存）
             失败 → LocalTtsProvider.speak()（静默回退，prefetch 则静默丢弃）

播放完成 → onDone() → speakSentence(cId, sIndex + 1)
```

### 切换音色流程

```
用户在设置页选 xfyun:xiaoyan
  → updateSettings({ voiceType: 'xfyun:xiaoyan' })
  → useTts 检测到 voiceType 变化 → stop() → 切换到 XfyunTtsProvider
```

### pause / resume / stop

统一由 `useTts` 委托给当前激活的 Provider，调用方无感知。

---

## 约束与边界

- 不修改 `ios/` 或 `android/` 目录
- 不新增 npm 依赖（`expo-av`、`expo-crypto`、`expo-file-system` 均已在依赖中）
- API 凭证通过 `constants.ts` 注入，不硬编码在 Provider 逻辑中
- 讯飞音色仅支持 `zh-CN`，rate 参数映射到讯飞 API 的 `speed` 字段：`speed = Math.round((rate / 2) * 100)`，范围 0-100，默认 50
- 讯飞模式下 `speakSentence` 发整句给 `tts.speak()`，不做子句拆分（避免碎片化缓存，减少 API 调用次数）；`LocalTtsProvider` 内部保留子句拆分逻辑，行为不变
