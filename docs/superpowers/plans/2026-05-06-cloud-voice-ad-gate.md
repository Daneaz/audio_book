# Cloud Voice Ad Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 选择云端（Xfyun）音色时，非会员需观看激励广告解锁 30 分钟；到期后朗读自动 fallback 到本地 TTS。

**Architecture:** 在 `AdService` 扩展云端音色解锁状态；`useCloudVoiceAccess` hook 封装 Alert + 广告流程，在 `SettingsScreen` 和 `ReaderScreen` 复用；`XfyunTtsProvider._speakAsync` 每次发起 API 前检查解锁状态，到期则 throw 触发既有 fallback 机制。

**Tech Stack:** React Native, expo-speech, react-native-google-mobile-ads, AsyncStorage, Jest + @testing-library/react-native

**Pre-existing test failures (baseline, do not regress):** 14 failures across `voiceUtils.xfyun.test.ts`, `MembershipService.test.ts`, `useTts.test.ts`, `XfyunTtsProvider.test.ts`, `SettingsScreen.test.tsx` — all unrelated to this feature.

---

## File Map

| 操作 | 文件 |
|------|------|
| Modify | `src/services/AdService.ts` |
| Modify | `src/services/tts/XfyunTtsProvider.ts` |
| **Create** | `src/hooks/useCloudVoiceAccess.ts` |
| Modify | `src/i18n/translations.ts` |
| Modify | `src/screens/SettingsScreen.tsx` |
| Modify | `src/screens/ReaderScreen.tsx` |
| Modify | `__tests__/AdService.test.ts` |
| Modify | `__tests__/XfyunTtsProvider.test.ts` |
| **Create** | `__tests__/useCloudVoiceAccess.test.ts` |

---

## Task 1: AdService — 扩展云端音色解锁

**Files:**
- Modify: `src/services/AdService.ts`
- Modify: `__tests__/AdService.test.ts`

- [ ] **Step 1: 写失败测试**

在 `__tests__/AdService.test.ts` 的 `describe('AdService', ...)` 块末尾追加：

```typescript
describe('isCloudVoiceUnlocked', () => {
  it('returns true when user is a member', async () => {
    (MembershipService.isActive as jest.Mock).mockResolvedValue(true);
    expect(await AdService.isCloudVoiceUnlocked()).toBe(true);
  });

  it('returns true when cloudVoiceUnlockedUntil is in the future', async () => {
    (MembershipService.isActive as jest.Mock).mockResolvedValue(false);
    const future = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    (StorageService.getData as jest.Mock).mockResolvedValue({ cloudVoiceUnlockedUntil: future });
    expect(await AdService.isCloudVoiceUnlocked()).toBe(true);
  });

  it('returns false when cloudVoiceUnlockedUntil has expired', async () => {
    (MembershipService.isActive as jest.Mock).mockResolvedValue(false);
    const past = new Date(Date.now() - 1000).toISOString();
    (StorageService.getData as jest.Mock).mockResolvedValue({ cloudVoiceUnlockedUntil: past });
    expect(await AdService.isCloudVoiceUnlocked()).toBe(false);
  });

  it('returns false for non-member with no ad state', async () => {
    (MembershipService.isActive as jest.Mock).mockResolvedValue(false);
    (StorageService.getData as jest.Mock).mockResolvedValue(null);
    expect(await AdService.isCloudVoiceUnlocked()).toBe(false);
  });
});

describe('unlockCloudVoice', () => {
  it('writes cloudVoiceUnlockedUntil ~30 minutes from now, preserving existing state', async () => {
    const existingState = { bannerHiddenUntil: 'some-time' };
    (StorageService.getData as jest.Mock).mockResolvedValue(existingState);
    (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);

    await AdService.unlockCloudVoice();

    const call = (StorageService.storeData as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(STORAGE_KEYS.AD_STATE);
    expect(call[1].bannerHiddenUntil).toBe('some-time');
    const writtenTime = new Date(call[1].cloudVoiceUnlockedUntil).getTime();
    const expectedTime = Date.now() + 30 * 60 * 1000;
    expect(Math.abs(writtenTime - expectedTime)).toBeLessThan(1000);
  });
});
```

- [ ] **Step 2: 确认测试失败**

```bash
npx jest __tests__/AdService.test.ts --no-coverage
```

Expected: `isCloudVoiceUnlocked` 和 `unlockCloudVoice` 相关测试 FAIL（方法不存在）

- [ ] **Step 3: 实现 AdService 修改**

替换 `src/services/AdService.ts` 全文：

```typescript
import { AdEventType, RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';
import StorageService from './StorageService';
import MembershipService from './MembershipService';
import { AD_UNIT_IDS, STORAGE_KEYS } from '../utils/constants';

const BANNER_HIDDEN_DURATION_MS = 60 * 60 * 1000;
const CLOUD_VOICE_UNLOCK_DURATION_MS = 30 * 60 * 1000;

export interface AdState {
  bannerHiddenUntil: string | null;
  cloudVoiceUnlockedUntil: string | null;
}

class AdService {
  async shouldShowBanner(): Promise<boolean> {
    const isMember = await MembershipService.isActive();
    if (isMember) return false;

    const state: AdState | null = await StorageService.getData(STORAGE_KEYS.AD_STATE);
    if (state?.bannerHiddenUntil && new Date(state.bannerHiddenUntil) > new Date()) {
      return false;
    }
    return true;
  }

  async hideBannerForOneHour(): Promise<void> {
    const state = (await StorageService.getData(STORAGE_KEYS.AD_STATE)) ?? {};
    const until = new Date(Date.now() + BANNER_HIDDEN_DURATION_MS).toISOString();
    await StorageService.storeData(STORAGE_KEYS.AD_STATE, { ...state, bannerHiddenUntil: until });
  }

  async isCloudVoiceUnlocked(): Promise<boolean> {
    const isMember = await MembershipService.isActive();
    if (isMember) return true;
    const state: AdState | null = await StorageService.getData(STORAGE_KEYS.AD_STATE);
    if (state?.cloudVoiceUnlockedUntil && new Date(state.cloudVoiceUnlockedUntil) > new Date()) {
      return true;
    }
    return false;
  }

  async unlockCloudVoice(): Promise<void> {
    const state = (await StorageService.getData(STORAGE_KEYS.AD_STATE)) ?? {};
    const until = new Date(Date.now() + CLOUD_VOICE_UNLOCK_DURATION_MS).toISOString();
    await StorageService.storeData(STORAGE_KEYS.AD_STATE, { ...state, cloudVoiceUnlockedUntil: until });
  }

  async showRewardedAd(): Promise<void> {
    const rewardedAd = RewardedAd.createForAdRequest(AD_UNIT_IDS.REWARDED, {
      requestNonPersonalizedAdsOnly: true,
    });

    await new Promise<void>((resolve, reject) => {
      let unsubLoad: () => void;
      let unsubError: () => void;
      const cleanup = () => { unsubLoad?.(); unsubError?.(); };

      unsubLoad = rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => {
        cleanup();
        resolve();
      });
      unsubError = rewardedAd.addAdEventListener(AdEventType.ERROR, (error: Error) => {
        cleanup();
        reject(error);
      });
      rewardedAd.load();
    });

    await new Promise<void>((resolve, reject) => {
      let unsubEarned: () => void;
      let unsubError: () => void;
      let unsubClosed: () => void;
      const cleanup = () => { unsubEarned?.(); unsubError?.(); unsubClosed?.(); };

      unsubEarned = rewardedAd.addAdEventListener(
        RewardedAdEventType.EARNED_REWARD,
        async () => {
          cleanup();
          await this.hideBannerForOneHour();
          resolve();
        }
      );
      unsubError = rewardedAd.addAdEventListener(AdEventType.ERROR, (error: Error) => {
        cleanup();
        reject(error);
      });
      unsubClosed = rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
        cleanup();
        reject(new Error('ad closed without reward'));
      });
      rewardedAd.show().catch(reject);
    });
  }
}

export default new AdService();
```

- [ ] **Step 4: 确认测试通过**

```bash
npx jest __tests__/AdService.test.ts --no-coverage
```

Expected: 所有 AdService 测试 PASS（包括已有的 `shouldShowBanner`、`hideBannerForOneHour`、`showRewardedAd` 测试）

- [ ] **Step 5: Commit**

```bash
git add src/services/AdService.ts __tests__/AdService.test.ts
git commit -m "feat: extend AdService with cloud voice unlock (isCloudVoiceUnlocked, unlockCloudVoice)"
```

---

## Task 2: XfyunTtsProvider — 每句朗读前检查解锁状态

**Files:**
- Modify: `src/services/tts/XfyunTtsProvider.ts`
- Modify: `__tests__/XfyunTtsProvider.test.ts`

- [ ] **Step 1: 写失败测试**

在 `__tests__/XfyunTtsProvider.test.ts` 顶部的 `jest.mock` 块中增加 AdService mock（在现有 mock 之后）：

```typescript
jest.mock('../src/services/AdService', () => ({
  __esModule: true,
  default: {
    isCloudVoiceUnlocked: jest.fn().mockResolvedValue(true),
  },
}));
```

然后在 `describe('XfyunTtsProvider', ...)` 块内追加：

```typescript
describe('cloud voice access gate', () => {
  it('falls back to local TTS and skips cache when access is denied', async () => {
    const AdService = jest.requireMock('../src/services/AdService');
    (AdService.default.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(false);

    const { getInfoAsync } = jest.requireMock('expo-file-system');
    getInfoAsync.mockClear();

    const provider = new XfyunTtsProvider('x4_yezi');
    const onDone = jest.fn();
    provider.speak('你好', { onDone });

    await new Promise(r => setTimeout(r, 30));

    expect(getInfoAsync).not.toHaveBeenCalled();
    expect(mockLocalSpeak).toHaveBeenCalledWith('你好', expect.objectContaining({ onDone }));
  });

  it('proceeds to cache lookup when access is granted', async () => {
    const AdService = jest.requireMock('../src/services/AdService');
    (AdService.default.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(true);

    const { getInfoAsync } = jest.requireMock('expo-file-system');
    getInfoAsync.mockClear();

    const provider = new XfyunTtsProvider('x4_yezi');
    provider.speak('你好', {});

    await new Promise(r => setTimeout(r, 30));

    expect(getInfoAsync).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 确认测试失败**

```bash
npx jest __tests__/XfyunTtsProvider.test.ts --no-coverage
```

Expected: 新增的 `cloud voice access gate` 测试 FAIL

- [ ] **Step 3: 实现 XfyunTtsProvider 修改**

在 `src/services/tts/XfyunTtsProvider.ts` 顶部 import 块末尾追加：

```typescript
import AdService from '../../services/AdService';
```

在 `_speakAsync` 方法的 `await this._stopCurrentPlayer()` 和 `if (this._gen !== gen) return;` 之后、`const cachePath = ...` 之前，插入：

```typescript
    const hasAccess = await AdService.isCloudVoiceUnlocked();
    if (!hasAccess) {
      throw new Error('cloud voice access expired');
    }
```

修改后的 `_speakAsync` 开头应为：

```typescript
  private async _speakAsync(text: string, options: TtsOptions, gen: number): Promise<void> {
    await this._stopCurrentPlayer();
    if (this._gen !== gen) return;
    const hasAccess = await AdService.isCloudVoiceUnlocked();
    if (!hasAccess) {
      throw new Error('cloud voice access expired');
    }
    const cachePath = await this._getCachePath(text);
    // ... 其余代码不变
```

- [ ] **Step 4: 确认测试通过**

```bash
npx jest __tests__/XfyunTtsProvider.test.ts --no-coverage
```

Expected: 新增测试 PASS，已有测试（mock mode fallback 等）仍然 PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/tts/XfyunTtsProvider.ts __tests__/XfyunTtsProvider.test.ts
git commit -m "feat: check cloud voice access before each Xfyun TTS call, fallback on expiry"
```

---

## Task 3: useCloudVoiceAccess Hook — 封装广告门控逻辑

**Files:**
- Create: `src/hooks/useCloudVoiceAccess.ts`
- Create: `__tests__/useCloudVoiceAccess.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `__tests__/useCloudVoiceAccess.test.ts`：

```typescript
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useCloudVoiceAccess } from '../src/hooks/useCloudVoiceAccess';
import AdService from '../src/services/AdService';

jest.mock('../src/services/AdService', () => ({
  __esModule: true,
  default: {
    isCloudVoiceUnlocked: jest.fn(),
    showRewardedAd: jest.fn(),
    unlockCloudVoice: jest.fn(),
  },
}));

jest.mock('../src/hooks/useMembership', () => ({
  __esModule: true,
  default: () => ({ isActive: false }),
}));

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key }),
}));

jest.mock('../src/utils/voiceUtils', () => ({
  isXfyunVoice: (id: string) =>
    ['x4_yezi', 'x4_xiaoyan', 'xiaoyu', 'aisjiuxu', 'aisxping', 'aisjinger', 'aisbabyxu', 'x4_xiaoxi', 'x4_lingbosong'].includes(id),
}));

describe('useCloudVoiceAccess', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls onGranted immediately for non-cloud voices', async () => {
    const { result } = renderHook(() => useCloudVoiceAccess());
    const onGranted = jest.fn();

    await act(async () => {
      result.current.requestAccess('com.apple.voice.premium.zh-CN.Lili', 'zh-CN', { onGranted });
    });

    expect(onGranted).toHaveBeenCalledWith('com.apple.voice.premium.zh-CN.Lili', 'zh-CN');
    expect(AdService.isCloudVoiceUnlocked).not.toHaveBeenCalled();
  });

  it('calls onGranted immediately for cloud voice when already unlocked', async () => {
    (AdService.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(true);
    const { result } = renderHook(() => useCloudVoiceAccess());
    const onGranted = jest.fn();

    await act(async () => {
      result.current.requestAccess('x4_yezi', 'zh-CN', { onGranted });
    });

    expect(onGranted).toHaveBeenCalledWith('x4_yezi', 'zh-CN');
    expect(Alert.alert).not.toHaveBeenCalled?.();
  });

  it('shows Alert when cloud voice is locked', async () => {
    (AdService.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(false);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { result } = renderHook(() => useCloudVoiceAccess());

    await act(async () => {
      result.current.requestAccess('x4_yezi', 'zh-CN', { onGranted: jest.fn() });
    });

    expect(alertSpy).toHaveBeenCalled();
  });

  it('calls onBeforeAd, unlocks, and calls onGranted after successful ad', async () => {
    (AdService.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(false);
    (AdService.showRewardedAd as jest.Mock).mockResolvedValue(undefined);
    (AdService.unlockCloudVoice as jest.Mock).mockResolvedValue(undefined);

    let alertButtons: any[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      alertButtons = buttons ?? [];
    });

    const { result } = renderHook(() => useCloudVoiceAccess());
    const onGranted = jest.fn();
    const onBeforeAd = jest.fn();

    await act(async () => {
      result.current.requestAccess('x4_yezi', 'zh-CN', { onGranted, onBeforeAd });
    });

    // 模拟用户点击"观看广告"按钮（index 1）
    await act(async () => {
      await alertButtons[1].onPress();
    });

    expect(onBeforeAd).toHaveBeenCalled();
    expect(AdService.showRewardedAd).toHaveBeenCalled();
    expect(AdService.unlockCloudVoice).toHaveBeenCalled();
    expect(onGranted).toHaveBeenCalledWith('x4_yezi', 'zh-CN');
  });

  it('does not call onGranted when ad is dismissed without reward', async () => {
    (AdService.isCloudVoiceUnlocked as jest.Mock).mockResolvedValue(false);
    (AdService.showRewardedAd as jest.Mock).mockRejectedValue(new Error('ad closed without reward'));

    let alertButtons: any[] = [];
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      alertButtons = buttons ?? [];
    });

    const { result } = renderHook(() => useCloudVoiceAccess());
    const onGranted = jest.fn();

    await act(async () => {
      result.current.requestAccess('x4_yezi', 'zh-CN', { onGranted });
    });

    await act(async () => {
      await alertButtons[1].onPress();
    });

    expect(AdService.unlockCloudVoice).not.toHaveBeenCalled();
    expect(onGranted).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 确认测试失败**

```bash
npx jest __tests__/useCloudVoiceAccess.test.ts --no-coverage
```

Expected: FAIL — `useCloudVoiceAccess` 模块不存在

- [ ] **Step 3: 实现 hook**

创建 `src/hooks/useCloudVoiceAccess.ts`：

```typescript
import { useCallback } from 'react';
import { Alert } from 'react-native';
import AdService from '../services/AdService';
import useMembership from './useMembership';
import useI18n from '../i18n';
import { isXfyunVoice } from '../utils/voiceUtils';

interface RequestAccessOpts {
  onGranted: (id: string, lang: string) => void;
  onBeforeAd?: () => void;
}

export function useCloudVoiceAccess() {
  const { isActive } = useMembership();
  const { t } = useI18n();

  const requestAccess = useCallback((voiceId: string, lang: string, opts: RequestAccessOpts) => {
    if (!isXfyunVoice(voiceId)) {
      opts.onGranted(voiceId, lang);
      return;
    }

    if (isActive) {
      opts.onGranted(voiceId, lang);
      return;
    }

    AdService.isCloudVoiceUnlocked().then(unlocked => {
      if (unlocked) {
        opts.onGranted(voiceId, lang);
        return;
      }

      Alert.alert(
        t('voice.cloudAdTitle'),
        t('voice.cloudAdMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('voice.cloudAdConfirm'),
            onPress: async () => {
              opts.onBeforeAd?.();
              try {
                await AdService.showRewardedAd();
                await AdService.unlockCloudVoice();
                opts.onGranted(voiceId, lang);
              } catch {
                // 用户未看完广告，静默失败
              }
            },
          },
        ]
      );
    });
  }, [isActive, t]);

  return { requestAccess };
}
```

- [ ] **Step 4: 确认测试通过**

```bash
npx jest __tests__/useCloudVoiceAccess.test.ts --no-coverage
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCloudVoiceAccess.ts __tests__/useCloudVoiceAccess.test.ts
git commit -m "feat: add useCloudVoiceAccess hook with ad gate for cloud voices"
```

---

## Task 4: Translations — 新增 i18n key

**Files:**
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: 在 `TranslationKey` 联合类型末尾追加三个 key**

在 `translations.ts` 中找到最后一行 `| 'settings.xfyunCacheCleared';`，改为：

```typescript
  | 'settings.xfyunCacheCleared'
  | 'voice.cloudAdTitle'
  | 'voice.cloudAdMessage'
  | 'voice.cloudAdConfirm';
```

- [ ] **Step 2: 在中文翻译对象末尾追加（紧接 `'settings.xfyunCacheCleared': '已释放',` 之后）**

```typescript
    'voice.cloudAdTitle': '云端音色',
    'voice.cloudAdMessage': '观看一个广告，即可免费使用云端音色 30 分钟。会员可永久畅用。',
    'voice.cloudAdConfirm': '观看广告',
```

- [ ] **Step 3: 在英文翻译对象末尾追加**

```typescript
    'voice.cloudAdTitle': 'Cloud Voice',
    'voice.cloudAdMessage': 'Watch a short ad to use cloud voices free for 30 minutes. Members enjoy unlimited access.',
    'voice.cloudAdConfirm': 'Watch Ad',
```

- [ ] **Step 4: 确认 TypeScript 编译无报错**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 无新增错误（可能有已存在的错误，忽略与本 task 无关的）

- [ ] **Step 5: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "feat: add i18n keys for cloud voice ad gate dialog"
```

---

## Task 5: SettingsScreen + ReaderScreen — 接入 hook

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: 修改 SettingsScreen**

在 `src/screens/SettingsScreen.tsx` 顶部 import 区追加：

```typescript
import { useCloudVoiceAccess } from '../hooks/useCloudVoiceAccess';
```

在 `SettingsScreen` 函数体内，`const { settings, updateSettings, loading } = useSettings();` 之后追加：

```typescript
  const { requestAccess } = useCloudVoiceAccess();
```

找到 `VoicePickerModal` 的 `onVoiceTap` prop（约第 516 行），从：

```tsx
      onVoiceTap={(id, lang) => {
        updateSettings({ voiceType: id });
        setShowVoiceModal(false);
        previewVoice(id, lang);
      }}
```

改为：

```tsx
      onVoiceTap={(id, lang) => {
        requestAccess(id, lang, {
          onGranted: (grantedId, grantedLang) => {
            updateSettings({ voiceType: grantedId });
            setShowVoiceModal(false);
            previewVoice(grantedId, grantedLang);
          },
          onBeforeAd: () => setShowVoiceModal(false),
        });
      }}
```

- [ ] **Step 2: 修改 ReaderScreen**

在 `src/screens/ReaderScreen.tsx` 顶部 import 区追加：

```typescript
import { useCloudVoiceAccess } from '../hooks/useCloudVoiceAccess';
```

在 ReaderScreen 函数体内（靠近其他 hook 调用处）追加：

```typescript
  const { requestAccess } = useCloudVoiceAccess();
```

找到 `VoicePickerModal` 的 `onVoiceTap` prop（约第 2389 行），从：

```tsx
          onVoiceTap={(id, lang) => {
            updateSettings({ voiceType: id });
            setIsTtsVoicePickerVisible(false);
            previewVoice(id, lang);
          }}
```

改为：

```tsx
          onVoiceTap={(id, lang) => {
            requestAccess(id, lang, {
              onGranted: (grantedId, grantedLang) => {
                updateSettings({ voiceType: grantedId });
                setIsTtsVoicePickerVisible(false);
                previewVoice(grantedId, grantedLang);
              },
              onBeforeAd: () => setIsTtsVoicePickerVisible(false),
            });
          }}
```

- [ ] **Step 3: 确认 TypeScript 无新错误**

```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4: 跑全量测试，确认无新增失败**

```bash
npx jest --no-coverage 2>&1 | tail -5
```

Expected: 失败数不超过 14（基线），新增测试全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/SettingsScreen.tsx src/screens/ReaderScreen.tsx
git commit -m "feat: wire useCloudVoiceAccess into SettingsScreen and ReaderScreen voice picker"
```

---

## Self-Review

**Spec coverage:**
- ✅ 选中 Cloud 音色时弹出确认 → `useCloudVoiceAccess` Alert
- ✅ 确认后播放激励广告 → `AdService.showRewardedAd()`
- ✅ 广告完成后可用 30 分钟 → `AdService.unlockCloudVoice()`
- ✅ 会员无限制 → `isActive` 短路直接 `onGranted`
- ✅ 到期 fallback 本地 TTS → `XfyunTtsProvider` throw → `.catch` → `fallback.speak()`
- ✅ 两个页面（Settings + Reader）均覆盖

**Placeholder scan:** 无 TBD、无空方法体

**Type consistency:**
- `requestAccess(voiceId, lang, opts)` — Task 3 定义，Task 5 调用 ✓
- `AdService.isCloudVoiceUnlocked()` — Task 1 定义，Task 2、3 使用 ✓
- `AdService.unlockCloudVoice()` — Task 1 定义，Task 3 使用 ✓
- `'voice.cloudAdTitle'` / `'voice.cloudAdMessage'` / `'voice.cloudAdConfirm'` — Task 4 定义，Task 3 hook 使用 ✓

**Edge cases verified in design:**
- `hideBannerForOneHour` 改为 read-merge-write，防止覆盖 `cloudVoiceUnlockedUntil` ✓
- `unlockCloudVoice` 同样 read-merge-write，防止覆盖 `bannerHiddenUntil` ✓
- 广告中途关闭 → catch 静默，不调 `onGranted`，不调 `unlockCloudVoice` ✓
