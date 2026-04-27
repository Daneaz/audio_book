# Free Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为月度和年度会员套餐新增 14 天 App Store 标准免费试用，检测 RevenueCat `periodType === 'trial'` 状态并在 MembershipScreen 和 SettingsScreen 展示试用倒计时。

**Architecture:** 数据层扩展 `MembershipState.isTrial`，由 `MembershipService._syncCache` 通过 RevenueCat entitlement `periodType` 字段写入，`useMembership` hook 消费并向 UI 层暴露。MembershipScreen 按试用状态切换按钮文案，SettingsScreen 新增会员入口行实时显示试用状态。

**Tech Stack:** React Native / Expo，RevenueCat (`react-native-purchases`)，`AsyncStorage`（通过 `StorageService`），`react-native` `Linking`

---

## 文件索引

| 文件 | 操作 |
|------|------|
| `src/services/MembershipService.ts` | 修改：`MembershipState` 加 `isTrial`，`_syncCache` 读 `periodType`，`_getCachedState` 补默认值 |
| `src/hooks/useMembership.ts` | 修改：`extractState` 派生 `isTrial`，hook 暴露 `isTrial` |
| `src/i18n/translations.ts` | 修改：新增 7 个翻译键 |
| `src/screens/MembershipScreen.tsx` | 修改：按钮文案逻辑、试用 banner、管理订阅按钮 |
| `src/screens/SettingsScreen.tsx` | 修改：接收 `navigation` prop，新增会员入口行 |
| `__tests__/MembershipService.test.ts` | 修改：`makeCustomerInfo` 支持 `periodType`，补 `isTrial` 断言，更新 fallback 缓存 mock，新增 trial 测试 |
| `__tests__/useMembership.test.tsx` | 修改：`makeCustomerInfo` 支持 `periodType`，新增 trial 测试，更新现有 mock 补 `isTrial: false` |
| `__tests__/MembershipScreen.test.tsx` | 修改：`makeDefaultHookState` 补 `isTrial: false`，更新按钮文案测试，新增 trial banner 测试 |
| `__tests__/SettingsScreen.test.tsx` | 创建：会员入口行三种状态测试 |

---

## Task 1: 扩展 MembershipState + 更新 MembershipService

**Files:**
- Modify: `src/services/MembershipService.ts`
- Modify: `__tests__/MembershipService.test.ts`

- [ ] **Step 1: 写失败测试 — periodType=trial 时 isTrial 写入缓存**

在 `__tests__/MembershipService.test.ts` 的 `makeCustomerInfo` 函数加 `periodType` 参数，并在 `describe('purchase')` 下方新增 `describe('_syncCache — isTrial')` 块：

```ts
// 更新 makeCustomerInfo（文件顶部）
function makeCustomerInfo(
  entitlementActive: boolean,
  productId = 'membership_monthly',
  expirationDate: string | null = new Date(Date.now() + 86400000).toISOString(),
  periodType: string = 'normal'
) {
  const active: Record<string, any> = {};
  if (entitlementActive) {
    active[MEMBERSHIP_ENTITLEMENT] = { productIdentifier: productId, expirationDate, periodType };
  }
  return { entitlements: { active } };
}
```

```ts
// 在 describe('restore') 下方新增
describe('_syncCache — isTrial', () => {
  it('writes isTrial=true when periodType is trial', async () => {
    const product = { identifier: 'membership_yearly' };
    (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
    const customerInfo = makeCustomerInfo(true, 'membership_yearly', new Date(Date.now() + 86400000 * 10).toISOString(), 'trial');
    (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue({ customerInfo });
    (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);

    await MembershipService.purchase('membership_yearly');

    expect(StorageService.storeData).toHaveBeenCalledWith(
      STORAGE_KEYS.MEMBERSHIP,
      expect.objectContaining({ isTrial: true })
    );
  });

  it('writes isTrial=false when periodType is normal', async () => {
    const product = { identifier: 'membership_monthly' };
    (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
    const customerInfo = makeCustomerInfo(true, 'membership_monthly', new Date(Date.now() + 86400000).toISOString(), 'normal');
    (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue({ customerInfo });
    (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);

    await MembershipService.purchase('membership_monthly');

    expect(StorageService.storeData).toHaveBeenCalledWith(
      STORAGE_KEYS.MEMBERSHIP,
      expect.objectContaining({ isTrial: false })
    );
  });
});
```

- [ ] **Step 2: 运行新测试确认失败**

```bash
jest --testPathPattern=MembershipService -t "_syncCache"
```

期望：FAIL — `isTrial` 不在 `storeData` 的调用参数里

- [ ] **Step 3: 更新现有 purchase/restore 测试的 fallback mock**

现有测试里 `StorageService.getData` 返回不含 `isTrial` 的对象，在 `isActive` 的 fallback 测试 mock 里补上 `isTrial: false`：

```ts
// isActive → falls back to local cache（第 96 行附近）
(StorageService.getData as jest.Mock).mockResolvedValue({
  isActive: true, type: 'lifetime', expiresAt: null, isTrial: false,
});

// isActive → returns false from cache when subscription expired（第 104 行附近）
(StorageService.getData as jest.Mock).mockResolvedValue({
  isActive: true, type: 'yearly', expiresAt: past, isTrial: false,
});

// isActive → returns true from cache when monthly type has future expiry（第 119 行附近）
(StorageService.getData as jest.Mock).mockResolvedValue({
  isActive: true, type: 'monthly', expiresAt: future, isTrial: false,
});

// isActive → returns false when expiresAt equals current time（第 128 行附近）
(StorageService.getData as jest.Mock).mockResolvedValue({
  isActive: true, type: 'monthly', expiresAt: '2026-01-01T00:00:00.000Z', isTrial: false,
});

// isActive → returns false from cache when type is null（第 140 行附近）
(StorageService.getData as jest.Mock).mockResolvedValue({
  isActive: true, type: null, expiresAt: null, isTrial: false,
});
```

- [ ] **Step 4: 实现 — 修改 MembershipService.ts**

```ts
// src/services/MembershipService.ts

export interface MembershipState {
  isActive: boolean;
  type: 'lifetime' | 'monthly' | 'yearly' | null;
  expiresAt: string | null;
  isTrial: boolean;
}

// _syncCache 方法（替换现有实现）
private async _syncCache(customerInfo: CustomerInfo): Promise<void> {
  const entitlement = customerInfo.entitlements.active[MEMBERSHIP_ENTITLEMENT];
  const isActive = !!entitlement;
  const type: MembershipType | null = entitlement ? inferType(entitlement.productIdentifier) : null;
  const expiresAt = entitlement?.expirationDate ?? null;
  const isTrial = entitlement?.periodType === 'trial' ?? false;
  await StorageService.storeData(STORAGE_KEYS.MEMBERSHIP, { isActive, type, expiresAt, isTrial });
}

// _getCachedState 方法（替换现有实现）
private async _getCachedState(): Promise<MembershipState> {
  const state = await StorageService.getData(STORAGE_KEYS.MEMBERSHIP);
  if (!state) return { isActive: false, type: null, expiresAt: null, isTrial: false };
  return { isTrial: false, ...(state as MembershipState) };
}
```

- [ ] **Step 5: 运行所有 MembershipService 测试确认全绿**

```bash
jest --testPathPattern=MembershipService
```

期望：全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/MembershipService.ts __tests__/MembershipService.test.ts
git commit -m "feat: add isTrial to MembershipState, detect periodType in _syncCache"
```

---

## Task 2: 更新 useMembership hook

**Files:**
- Modify: `src/hooks/useMembership.ts`
- Modify: `__tests__/useMembership.test.tsx`

- [ ] **Step 1: 写失败测试 — isTrial 从 CustomerInfo 更新监听器派生**

在 `__tests__/useMembership.test.tsx` 的 `makeCustomerInfo` 加 `periodType`，并在 `CustomerInfo 更新监听器` describe 块末尾追加：

```ts
// 更新 makeCustomerInfo（文件顶部）
function makeCustomerInfo(
  entitlementActive: boolean,
  productId = 'membership_monthly',
  expirationDate: string | null = new Date(Date.now() + 86400000).toISOString(),
  periodType: string = 'normal'
) {
  const active: Record<string, any> = {};
  if (entitlementActive) {
    active[MEMBERSHIP_ENTITLEMENT] = { productIdentifier: productId, expirationDate, periodType };
  }
  return { entitlements: { active } };
}
```

```ts
// 追加到 describe('CustomerInfo 更新监听器') 末尾
it('sets isTrial=true when listener fires with periodType trial', () => {
  let capturedListener: ((info: any) => void) | undefined;
  (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
    capturedListener = cb;
  });
  const expiresAt = new Date(Date.now() + 86400000 * 10).toISOString();
  const { result } = renderHook(() => useMembership());

  act(() => {
    capturedListener!(makeCustomerInfo(true, 'membership_yearly', expiresAt, 'trial'));
  });

  expect(result.current.isTrial).toBe(true);
});

it('sets isTrial=false when listener fires with periodType normal', () => {
  let capturedListener: ((info: any) => void) | undefined;
  (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
    capturedListener = cb;
  });
  const { result } = renderHook(() => useMembership());

  act(() => {
    capturedListener!(makeCustomerInfo(true, 'membership_monthly'));
  });

  expect(result.current.isTrial).toBe(false);
});
```

- [ ] **Step 2: 运行新测试确认失败**

```bash
jest --testPathPattern=useMembership -t "isTrial"
```

期望：FAIL — `result.current.isTrial` is `undefined`

- [ ] **Step 3: 实现 — 修改 useMembership.ts**

```ts
// src/hooks/useMembership.ts

export interface UseMembershipReturn {
  isActive: boolean;
  membershipType: MembershipState['type'];
  expiresAt: string | null;
  isTrial: boolean;
  purchase: (productId: string) => Promise<void>;
  restore: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

function extractState(customerInfo: CustomerInfo): Pick<UseMembershipReturn, 'isActive' | 'membershipType' | 'expiresAt' | 'isTrial'> {
  const entitlement = customerInfo.entitlements.active[MEMBERSHIP_ENTITLEMENT];
  if (!entitlement) return { isActive: false, membershipType: null, expiresAt: null, isTrial: false };
  const id = entitlement.productIdentifier;
  const membershipType: MembershipState['type'] = id.includes('lifetime') ? 'lifetime' : id.includes('yearly') ? 'yearly' : 'monthly';
  return {
    isActive: true,
    membershipType,
    expiresAt: entitlement.expirationDate ?? null,
    isTrial: entitlement.periodType === 'trial',
  };
}

export default function useMembership(): UseMembershipReturn {
  const [isActive, setIsActive] = useState(false);
  const [membershipType, setMembershipType] = useState<MembershipState['type']>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isTrial, setIsTrial] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    MembershipService.isActive().then(setIsActive);

    const listener = (info: CustomerInfo) => {
      const state = extractState(info);
      setIsActive(state.isActive);
      setMembershipType(state.membershipType);
      setExpiresAt(state.expiresAt);
      setIsTrial(state.isTrial);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => { Purchases.removeCustomerInfoUpdateListener(listener); };
  }, []);

  const purchase = async (productId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await MembershipService.purchase(productId);
    } catch (e: any) {
      setError(e?.message ?? '购买失败');
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  const restore = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await MembershipService.restore();
    } catch (e: any) {
      setError(e?.message ?? '恢复购买失败');
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  return { isActive, membershipType, expiresAt, isTrial, purchase, restore, isLoading, error };
}
```

- [ ] **Step 4: 更新 makeDefaultHookState 补 isTrial**

在 `__tests__/useMembership.test.tsx` 的 `describe('初始状态')` 下的 `returns default state` 测试末尾追加断言：

```ts
expect(result.current.isTrial).toBe(false);
```

- [ ] **Step 5: 运行所有 useMembership 测试确认全绿**

```bash
jest --testPathPattern=useMembership
```

期望：全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useMembership.ts __tests__/useMembership.test.tsx
git commit -m "feat: expose isTrial in useMembership hook"
```

---

## Task 3: 添加 i18n 翻译键

**Files:**
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: 在 TranslationKey 联合类型末尾追加新键**

将文件第 141 行的 `| 'membership.benefitMoreSoon';` 替换为：

```ts
  | 'membership.benefitMoreSoon'
  | 'membership.freeTrial'
  | 'membership.trialBadge'
  | 'membership.trialBanner'
  | 'membership.trialActive'
  | 'membership.manageSubscription'
  | 'membership.subscribed'
  | 'membership.upgrade'
  | 'membership.buyNow';
```

- [ ] **Step 2: 在中文翻译对象末尾追加（第 286 行 `'membership.benefitMoreSoon'` 之后）**

```ts
    'membership.freeTrial': '免费试用 14 天',
    'membership.trialBadge': '前 14 天免费',
    'membership.trialBanner': '试用中 · 还剩 {days} 天到期',
    'membership.trialActive': '试用中 · 还剩 {days} 天',
    'membership.manageSubscription': '管理订阅',
    'membership.subscribed': '已订阅',
    'membership.upgrade': '升级',
    'membership.buyNow': '立即购买',
```

- [ ] **Step 3: 在英文翻译对象末尾追加（英文 `membership.benefitMoreSoon` 之后）**

```ts
    'membership.freeTrial': 'Try Free for 14 Days',
    'membership.trialBadge': 'First 14 days free',
    'membership.trialBanner': 'Trial · {days} days left',
    'membership.trialActive': 'Trial · {days} days left',
    'membership.manageSubscription': 'Manage Subscription',
    'membership.subscribed': 'Subscribed',
    'membership.upgrade': 'Upgrade',
    'membership.buyNow': 'Buy Now',
```

- [ ] **Step 4: 确认 TypeScript 编译通过**

```bash
npx tsc --noEmit
```

期望：无类型错误

- [ ] **Step 5: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "feat: add free trial i18n keys"
```

---

## Task 4: 更新 MembershipScreen

**Files:**
- Modify: `src/screens/MembershipScreen.tsx`
- Modify: `__tests__/MembershipScreen.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `__tests__/MembershipScreen.test.tsx` 中，更新 `makeDefaultHookState` 补 `isTrial: false`，并新增 describe 块：

```ts
// 更新 makeDefaultHookState（第 48 行附近）
const makeDefaultHookState = (overrides = {}) => ({
  isActive: false,
  membershipType: null as null,
  expiresAt: null as null,
  isTrial: false,
  isLoading: false,
  error: null as null,
  purchase: jest.fn().mockResolvedValue(undefined),
  restore: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});
```

更新 `套餐选择` describe 里所有按钮文案测试，将 `'membership.subscribe'` 改为对应新键：

```ts
// default selection is yearly — 按钮文案为 freeTrial
it('default selection is yearly — subscribe button shows freeTrial label', async () => {
  const purchase = jest.fn().mockResolvedValue(undefined);
  mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
  const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

  await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });

  expect(purchase).toHaveBeenCalledWith('yearly');
});

// tapping monthly then subscribe — 按钮文案为 freeTrial
it('tapping monthly plan then subscribe calls purchase with monthly', async () => {
  const purchase = jest.fn().mockResolvedValue(undefined);
  mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
  const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

  fireEvent.press(getByText('membership.planMonthlyLabel'));
  await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });

  expect(purchase).toHaveBeenCalledWith('monthly');
});

// tapping lifetime then subscribe — 按钮文案为 buyNow
it('tapping lifetime plan shows buyNow button', async () => {
  const purchase = jest.fn().mockResolvedValue(undefined);
  mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
  const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

  fireEvent.press(getByText('membership.planLifetimeLabel'));
  await act(async () => { fireEvent.press(getByText('membership.buyNow')); });

  expect(purchase).toHaveBeenCalledWith('lifetime');
});
```

新增试用状态测试：

```ts
describe('试用状态', () => {
  it('shows trial banner when isTrial is true', () => {
    const expiresAt = new Date(Date.now() + 86400000 * 10).toISOString();
    mockUseMembership.mockReturnValue(
      makeDefaultHookState({ isActive: true, isTrial: true, expiresAt })
    );
    const { getByTestId } = render(<MembershipScreen navigation={makeNavigation()} />);
    expect(getByTestId('trial-banner')).toBeTruthy();
  });

  it('does not show trial banner when isTrial is false', () => {
    mockUseMembership.mockReturnValue(makeDefaultHookState({ isActive: false, isTrial: false }));
    const { queryByTestId } = render(<MembershipScreen navigation={makeNavigation()} />);
    expect(queryByTestId('trial-banner')).toBeNull();
  });

  it('shows manageSubscription button when isTrial is true', () => {
    const expiresAt = new Date(Date.now() + 86400000 * 5).toISOString();
    mockUseMembership.mockReturnValue(
      makeDefaultHookState({ isActive: true, isTrial: true, expiresAt })
    );
    const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);
    expect(getByText('membership.manageSubscription')).toBeTruthy();
  });
});
```

同时更新 `handlePurchase` 和 `isLoading` 测试里使用 `membership.subscribe` 的地方，改为 `membership.freeTrial`：

```ts
// 购买按钮状态 → hides subscribe text（第 137 行附近）
it('hides subscribe text and shows loading when isLoading is true', () => {
  mockUseMembership.mockReturnValue(makeDefaultHookState({ isLoading: true }));
  const { queryByText } = render(<MembershipScreen navigation={makeNavigation()} />);
  expect(queryByText('membership.freeTrial')).toBeNull();
  expect(queryByText('membership.buyNow')).toBeNull();
});

// handlePurchase → calls navigation.goBack（第 146 行附近）改用 freeTrial
await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });

// handlePurchase → does NOT show Alert when userCancelled（第 157 行附近）改用 freeTrial
await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });

// handlePurchase → does NOT show Alert when message contains cancel（第 168 行附近）改用 freeTrial
await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });

// handlePurchase → shows Alert for real payment failure（第 179 行附近）改用 freeTrial
await act(async () => { fireEvent.press(getByText('membership.freeTrial')); });
```

- [ ] **Step 2: 运行新测试确认失败**

```bash
jest --testPathPattern=MembershipScreen
```

期望：FAIL — 找不到 `membership.freeTrial` 等新文案

- [ ] **Step 3: 实现 — 修改 MembershipScreen.tsx**

完整替换 `MembershipScreen.tsx`：

```tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useColorScheme, Alert, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import useMembership from '../hooks/useMembership';
import MembershipService from '../services/MembershipService';
import { MEMBERSHIP_PRODUCT_IDS } from '../utils/constants';
import useI18n from '../i18n';

type PlanId = typeof MEMBERSHIP_PRODUCT_IDS[keyof typeof MEMBERSHIP_PRODUCT_IDS];

const ALL_PRODUCT_IDS = Object.values(MEMBERSHIP_PRODUCT_IDS);

export default function MembershipScreen({ navigation }: any) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(MEMBERSHIP_PRODUCT_IDS.YEARLY);
  const [productPrices, setProductPrices] = useState<Record<string, string>>({});
  const { purchase, restore, isLoading, isTrial, expiresAt } = useMembership();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { t } = useI18n();

  useEffect(() => {
    MembershipService.getProductPrices(ALL_PRODUCT_IDS).then(setProductPrices).catch(() => {});
  }, []);

  function planPrice(id: PlanId): string {
    const raw = productPrices[id];
    if (!raw) return '--';
    if (id === MEMBERSHIP_PRODUCT_IDS.MONTHLY) return raw + t('membership.perMonth');
    if (id === MEMBERSHIP_PRODUCT_IDS.YEARLY) return raw + t('membership.perYear');
    return raw;
  }

  function planSublabel(id: PlanId, baseSublabel: string): string {
    if (id === MEMBERSHIP_PRODUCT_IDS.MONTHLY || id === MEMBERSHIP_PRODUCT_IDS.YEARLY) {
      return `${baseSublabel}  ·  ${t('membership.trialBadge')}`;
    }
    return baseSublabel;
  }

  const trialDaysLeft = isTrial && expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000))
    : 0;

  const isTrialEligible = selectedPlan !== MEMBERSHIP_PRODUCT_IDS.LIFETIME;

  function buttonLabel(): string {
    if (isTrial) return t('membership.manageSubscription');
    if (isTrialEligible) return t('membership.freeTrial');
    return t('membership.buyNow');
  }

  const PLANS: { id: PlanId; label: string; baseSublabel: string }[] = [
    { id: MEMBERSHIP_PRODUCT_IDS.MONTHLY, label: t('membership.planMonthlyLabel'), baseSublabel: t('membership.planMonthlySub') },
    { id: MEMBERSHIP_PRODUCT_IDS.YEARLY, label: t('membership.planYearlyLabel'), baseSublabel: t('membership.planYearlySub') },
    { id: MEMBERSHIP_PRODUCT_IDS.LIFETIME, label: t('membership.planLifetimeLabel'), baseSublabel: t('membership.planLifetimeSub') },
  ];

  const BENEFITS = [t('membership.benefitNoAds'), t('membership.benefitMoreSoon')];

  const colors = {
    bg:      isDark ? '#0E0C0A' : '#FAF7F0',
    surface: isDark ? '#1C1916' : '#F3ECE0',
    border:  isDark ? '#2A2520' : '#E0D4C0',
    accent:  isDark ? '#C4A96A' : '#A0621A',
    text:    isDark ? '#E8E0D0' : '#2C1A0E',
    subText: isDark ? '#6A5A44' : '#9A7A5A',
    trial:   '#B8860B',
  };

  const handlePurchase = async () => {
    if (isTrial) {
      Linking.openURL('https://apps.apple.com/account/subscriptions');
      return;
    }
    try {
      await purchase(selectedPlan);
      navigation.goBack();
    } catch (e: any) {
      if (!e?.userCancelled && !e?.message?.toLowerCase().includes('cancel')) {
        Alert.alert(t('membership.purchaseFailed'), e?.message ?? t('membership.purchaseFailedMsg'));
      }
    }
  };

  const handleRestore = async () => {
    try {
      await restore();
      Alert.alert(t('membership.restoreSuccess'), t('membership.restoreSuccessMsg'), [
        { text: t('common.ok'), onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert(t('membership.restoreFailed'), e?.message ?? t('membership.restoreFailedMsg'));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('membership.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isTrial && (
          <View testID="trial-banner" style={[styles.trialBanner, { borderColor: colors.trial }]}>
            <Ionicons name="time-outline" size={16} color={colors.trial} />
            <Text style={[styles.trialBannerText, { color: colors.trial }]}>
              {t('membership.trialBanner', { days: trialDaysLeft })}
            </Text>
          </View>
        )}

        <View style={[styles.benefitsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('membership.benefits')}</Text>
          {BENEFITS.map((benefit, i) => (
            <View key={i} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              <Text style={[styles.benefitText, { color: colors.text }]}>{benefit}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24, marginBottom: 12 }]}>{t('membership.choosePlan')}</Text>
        {PLANS.map(plan => {
          const isSelected = selectedPlan === plan.id;
          return (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                { backgroundColor: colors.surface, borderColor: isSelected ? colors.accent : colors.border },
              ]}
              onPress={() => setSelectedPlan(plan.id)}
            >
              <View style={styles.planInfo}>
                <Text style={[styles.planLabel, { color: colors.text }]}>{plan.label}</Text>
                <Text style={[styles.planSublabel, { color: colors.subText }]}>
                  {planSublabel(plan.id, plan.baseSublabel)}
                </Text>
              </View>
              <Text style={[styles.planPrice, { color: colors.accent }]}>{planPrice(plan.id)}</Text>
              {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.accent} style={styles.planCheck} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.purchaseButton, { backgroundColor: colors.accent }, isLoading && styles.disabled]}
          onPress={handlePurchase}
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.purchaseButtonText}>{buttonLabel()}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleRestore} disabled={isLoading} style={styles.restoreButton}>
          <Text style={[styles.restoreText, { color: colors.subText }]}>{t('membership.restore')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: '600' },
  content: { padding: 20, paddingBottom: 8 },
  trialBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 16, backgroundColor: 'rgba(184,134,11,0.08)',
  },
  trialBannerText: { fontSize: 13, fontWeight: '500' },
  benefitsCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 10 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  benefitText: { fontSize: 14, marginLeft: 8 },
  planCard: {
    borderRadius: 12, padding: 16, borderWidth: 1.5,
    flexDirection: 'row', alignItems: 'center', marginBottom: 12,
  },
  planInfo: { flex: 1 },
  planLabel: { fontSize: 15, fontWeight: '600' },
  planSublabel: { fontSize: 12, marginTop: 2 },
  planPrice: { fontSize: 14, fontWeight: '600' },
  planCheck: { marginLeft: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  purchaseButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  purchaseButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  restoreButton: { alignItems: 'center', paddingVertical: 12 },
  restoreText: { fontSize: 13 },
});
```

- [ ] **Step 4: 在测试文件顶部的 jest.mock 中加 Linking mock**

```ts
jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn() },
  useColorScheme: jest.fn().mockReturnValue('light'),
}));
```

> 注意：MembershipScreen.test.tsx 目前没有显式 mock `react-native`，测试里通过 `jest.spyOn(Alert, 'alert')` mock。加 `Linking` mock 只在 `jest.mock('react-native', ...)` 里补充；如果文件里没有 `jest.mock('react-native', ...)` 则只需在顶部加：
>
> ```ts
> import { Linking } from 'react-native';
> jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
> ```

- [ ] **Step 5: 运行所有 MembershipScreen 测试确认全绿**

```bash
jest --testPathPattern=MembershipScreen
```

期望：全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/screens/MembershipScreen.tsx __tests__/MembershipScreen.test.tsx
git commit -m "feat: update MembershipScreen with free trial button and trial banner"
```

---

## Task 5: 更新 SettingsScreen + 新增测试

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`
- Create: `__tests__/SettingsScreen.test.tsx`

- [ ] **Step 1: 写失败测试（创建新文件）**

创建 `__tests__/SettingsScreen.test.tsx`：

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SettingsScreen from '../src/screens/SettingsScreen';
import useMembershipHook from '../src/hooks/useMembership';

jest.mock('react-native-google-mobile-ads', () => ({
  TestIds: { BANNER: 'test-banner-id', REWARDED: 'test-rewarded-id' },
  BannerAd: 'BannerAd',
  BannerAdSize: { BANNER: 'BANNER' },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(),
  },
}));

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key, language: 'zh' }),
}));

jest.mock('../src/hooks/useSettings', () => ({
  __esModule: true,
  default: () => ({
    settings: {
      theme: 'system', language: 'zh', fontSize: 18, lineSpacing: 1.8,
      fontPreset: 'hei', readingMode: 'scroll', autoFlipInterval: 5,
      speechRate: 1.0, voiceType: 'default',
    },
    updateSettings: jest.fn(),
    loading: false,
  }),
}));

jest.mock('expo-speech', () => ({
  getAvailableVoicesAsync: jest.fn().mockResolvedValue([]),
  stop: jest.fn(),
  speak: jest.fn(),
}));

jest.mock('expo-updates', () => ({
  channel: 'production',
  runtimeVersion: '1.0.0',
}));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}));

jest.mock('../src/hooks/useMembership');
const mockUseMembership = useMembershipHook as jest.MockedFunction<typeof useMembershipHook>;

const makeHookState = (overrides = {}) => ({
  isActive: false,
  membershipType: null as null,
  expiresAt: null as null,
  isTrial: false,
  isLoading: false,
  error: null as null,
  purchase: jest.fn(),
  restore: jest.fn(),
  ...overrides,
});

function makeNavigation() {
  return { navigate: jest.fn(), goBack: jest.fn() };
}

describe('SettingsScreen — 会员入口行', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMembership.mockReturnValue(makeHookState());
  });

  it('shows upgrade badge when not a member', () => {
    const { getByText } = render(<SettingsScreen navigation={makeNavigation()} />);
    expect(getByText('membership.upgrade')).toBeTruthy();
  });

  it('shows trial status when isTrial is true', () => {
    const expiresAt = new Date(Date.now() + 86400000 * 5).toISOString();
    mockUseMembership.mockReturnValue(makeHookState({ isActive: true, isTrial: true, expiresAt }));
    const { getByTestId } = render(<SettingsScreen navigation={makeNavigation()} />);
    expect(getByTestId('membership-trial-badge')).toBeTruthy();
  });

  it('shows subscribed badge when active and not in trial', () => {
    mockUseMembership.mockReturnValue(
      makeHookState({ isActive: true, isTrial: false, membershipType: 'yearly' })
    );
    const { getByText } = render(<SettingsScreen navigation={makeNavigation()} />);
    expect(getByText('membership.subscribed')).toBeTruthy();
  });

  it('navigates to Membership screen on row press', () => {
    const navigation = makeNavigation();
    const { getByTestId } = render(<SettingsScreen navigation={navigation} />);
    fireEvent.press(getByTestId('membership-row'));
    expect(navigation.navigate).toHaveBeenCalledWith('Membership');
  });
});
```

- [ ] **Step 2: 运行新测试确认失败**

```bash
jest --testPathPattern=SettingsScreen
```

期望：FAIL — `SettingsScreen` 不接受 `navigation` prop，没有会员行

- [ ] **Step 3: 实现 — 修改 SettingsScreen.tsx**

在文件头部的 import 区域追加：

```ts
import { useNavigation } from '@react-navigation/native';
import useMembership from '../hooks/useMembership';
```

将函数签名从 `export default function SettingsScreen()` 改为：

```ts
export default function SettingsScreen({ navigation }: any) {
```

在 `const { settings, updateSettings, loading } = useSettings();` 下方追加：

```ts
const { isActive, isTrial, expiresAt } = useMembership();
```

在 `const sc = useMemo(() => ({...}), [isDark]);` 下方追加倒计时计算：

```ts
const trialDaysLeft = isTrial && expiresAt
  ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000))
  : 0;
```

在 `return (` 内 `{/* ===== 外观 ===== */}` 注释之前插入会员入口行：

```tsx
{/* ===== 会员 ===== */}
<TouchableOpacity
  testID="membership-row"
  onPress={() => navigation.navigate('Membership')}
  style={[styles.groupCard, { backgroundColor: sc.surface, borderColor: sc.border, marginBottom: 8 }]}
  activeOpacity={0.7}
>
  <View style={[styles.settingsRow, { borderBottomWidth: 0 }]}>
    <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('membership.title')}</Text>
    {isTrial ? (
      <Text testID="membership-trial-badge" style={[styles.rowValue, { color: '#B8860B', fontWeight: '500' }]}>
        {t('membership.trialActive', { days: trialDaysLeft })}
      </Text>
    ) : isActive ? (
      <Text style={[styles.rowValue, { color: '#4CAF50', fontWeight: '500' }]}>
        {t('membership.subscribed')}
      </Text>
    ) : (
      <Text style={[styles.rowValue, { color: sc.accent, fontWeight: '500' }]}>
        {t('membership.upgrade')}
      </Text>
    )}
    <Ionicons name="chevron-forward" size={16} color={sc.textSub} style={{ marginLeft: 4 }} />
  </View>
</TouchableOpacity>
```

- [ ] **Step 4: 运行所有 SettingsScreen 测试确认全绿**

```bash
jest --testPathPattern=SettingsScreen
```

期望：全部 PASS

- [ ] **Step 5: 运行全套测试确认无回归**

```bash
jest
```

期望：全部 PASS（注意：若 SettingsScreen 有其他测试文件，也需同步更新）

- [ ] **Step 6: Commit**

```bash
git add src/screens/SettingsScreen.tsx __tests__/SettingsScreen.test.tsx
git commit -m "feat: add membership row with trial status to SettingsScreen"
```

---

## 自检：Spec 覆盖验证

| Spec 要求 | 对应 Task |
|-----------|-----------|
| `MembershipState.isTrial` 字段 | Task 1 |
| `_syncCache` 读 `periodType` | Task 1 |
| `useMembership` 暴露 `isTrial` | Task 2 |
| 7 个 i18n 翻译键（14天） | Task 3 |
| 月/年套餐卡片显示"前 14 天免费" | Task 4（`planSublabel`） |
| 非会员月/年按钮 → "免费试用 14 天" | Task 4 |
| 非会员永久按钮 → "立即购买" | Task 4 |
| 试用中 banner | Task 4 |
| 试用中按钮 → "管理订阅" + Linking | Task 4 |
| SettingsScreen 会员入口行三种状态 | Task 5 |
| SettingsScreen navigation prop | Task 5 |
