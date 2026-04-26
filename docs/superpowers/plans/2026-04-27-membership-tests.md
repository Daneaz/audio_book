# Membership 模块测试实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 RevenueCat 会员模块（MembershipService + useMembership hook + MembershipScreen）补全测试，防止支付纠纷。

**Architecture:** 按分层策略扩展/新建三个测试文件，各层只 mock 下层依赖；Service 层 mock Purchases + StorageService，Hook 层 mock MembershipService，Screen 层 mock useMembership hook + MembershipService.getProductPrices + Alert。

**Tech Stack:** Jest 29, jest-expo, @testing-library/react-native, react-native-purchases mock

---

### Task 1: 安装 @testing-library/react-native，验证基线

**Files:**
- Modify: `package.json`（devDependencies）

- [ ] **Step 1: 安装依赖**

```bash
npm install --save-dev @testing-library/react-native
```

- [ ] **Step 2: 验证现有测试仍然通过**

```bash
npx jest --testPathPattern=MembershipService --no-coverage
```

Expected:
```
PASS __tests__/MembershipService.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @testing-library/react-native for hook and screen tests"
```

---

### Task 2: MembershipService — initialize (android) + isActive 补充

**Files:**
- Modify: `__tests__/MembershipService.test.ts`

- [ ] **Step 1: 在文件顶部 import 行中添加 REVENUECAT_API_KEYS**

将现有的：
```typescript
import { STORAGE_KEYS, MEMBERSHIP_ENTITLEMENT } from '../src/utils/constants';
```
改为：
```typescript
import { STORAGE_KEYS, MEMBERSHIP_ENTITLEMENT, REVENUECAT_API_KEYS } from '../src/utils/constants';
```

- [ ] **Step 2: 在 `describe('initialize')` 闭合括号前追加 android 测试**

```typescript
    it('calls Purchases.configure with android api key on android', async () => {
      const { Platform } = require('react-native');
      Platform.OS = 'android';
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(makeCustomerInfo(false));
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      await MembershipService.initialize();
      expect(Purchases.configure).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: REVENUECAT_API_KEYS.ANDROID })
      );
      Platform.OS = 'ios';
    });
```

- [ ] **Step 3: 在 `describe('isActive')` 闭合括号前追加两个测试**

```typescript
    it('returns false when local cache is null', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      (StorageService.getData as jest.Mock).mockResolvedValue(null);
      expect(await MembershipService.isActive()).toBe(false);
    });

    it('returns true from cache when monthly type has future expiry', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      const future = new Date(Date.now() + 86400000).toISOString();
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'monthly', expiresAt: future,
      });
      expect(await MembershipService.isActive()).toBe(true);
    });

    it('returns false when expiresAt equals current time exactly', async () => {
      jest.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'monthly', expiresAt: '2026-01-01T00:00:00.000Z',
      });
      expect(await MembershipService.isActive()).toBe(false);
      jest.useRealTimers();
    });

    it('returns false from cache when type is null even if isActive is true', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: null, expiresAt: null,
      });
      expect(await MembershipService.isActive()).toBe(false);
    });
```

- [ ] **Step 4: 运行确认通过**

```bash
npx jest --testPathPattern=MembershipService --no-coverage
```

Expected: PASS，新增 5 个测试全部绿色

- [ ] **Step 5: Commit**

```bash
git add __tests__/MembershipService.test.ts
git commit -m "test: extend MembershipService — android key, null cache, monthly cache, boundary"
```

---

### Task 3: MembershipService — getProductPrices 全覆盖

**Files:**
- Modify: `__tests__/MembershipService.test.ts`

- [ ] **Step 1: 在 `describe('restore')` 块之后、最外层 `describe` 闭合之前插入**

```typescript
  describe('getProductPrices', () => {
    it('returns price map for multiple products', async () => {
      (Purchases.getProducts as jest.Mock).mockResolvedValue([
        { identifier: 'monthly', priceString: '$2.99' },
        { identifier: 'yearly', priceString: '$19.99' },
        { identifier: 'lifetime', priceString: '$49.99' },
      ]);
      const result = await MembershipService.getProductPrices(['monthly', 'yearly', 'lifetime']);
      expect(result).toEqual({ monthly: '$2.99', yearly: '$19.99', lifetime: '$49.99' });
    });

    it('returns empty object when product list is empty', async () => {
      (Purchases.getProducts as jest.Mock).mockResolvedValue([]);
      const result = await MembershipService.getProductPrices([]);
      expect(result).toEqual({});
    });

    it('returns single product price', async () => {
      (Purchases.getProducts as jest.Mock).mockResolvedValue([
        { identifier: 'monthly', priceString: '$2.99' },
      ]);
      const result = await MembershipService.getProductPrices(['monthly']);
      expect(result).toEqual({ monthly: '$2.99' });
    });
  });
```

- [ ] **Step 2: 运行确认通过**

```bash
npx jest --testPathPattern=MembershipService --no-coverage
```

Expected: PASS (+3 tests)

- [ ] **Step 3: Commit**

```bash
git add __tests__/MembershipService.test.ts
git commit -m "test: add getProductPrices coverage to MembershipService"
```

---

### Task 4: MembershipService — purchase/restore 补充

**Files:**
- Modify: `__tests__/MembershipService.test.ts`

- [ ] **Step 1: 在 `describe('purchase')` 闭合括号前追加三个测试**

```typescript
    it('throws when purchaseStoreProduct throws', async () => {
      const product = { identifier: 'monthly' };
      (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
      (Purchases.purchaseStoreProduct as jest.Mock).mockRejectedValue(new Error('network error'));
      await expect(MembershipService.purchase('monthly')).rejects.toThrow('network error');
    });

    it('syncs cache with type yearly for yearly product', async () => {
      const product = { identifier: 'membership_yearly' };
      (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
      const customerInfo = makeCustomerInfo(true, 'membership_yearly');
      (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue({ customerInfo });
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      await MembershipService.purchase('membership_yearly');
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isActive: true, type: 'yearly' })
      );
    });

    it('syncs cache with type lifetime and null expiresAt for lifetime product', async () => {
      const product = { identifier: 'membership_lifetime' };
      (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
      const customerInfo = makeCustomerInfo(true, 'membership_lifetime', null);
      (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue({ customerInfo });
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      await MembershipService.purchase('membership_lifetime');
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isActive: true, type: 'lifetime', expiresAt: null })
      );
    });
```

- [ ] **Step 2: 在 `describe('restore')` 闭合括号前追加两个测试**

```typescript
    it('throws when restorePurchases throws', async () => {
      (Purchases.restorePurchases as jest.Mock).mockRejectedValue(new Error('restore failed'));
      await expect(MembershipService.restore()).rejects.toThrow('restore failed');
    });

    it('syncs cache with isActive false when no entitlement after restore', async () => {
      const customerInfo = makeCustomerInfo(false);
      (Purchases.restorePurchases as jest.Mock).mockResolvedValue(customerInfo);
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      await MembershipService.restore();
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isActive: false, type: null })
      );
    });
```

- [ ] **Step 3: 运行确认全部通过**

```bash
npx jest --testPathPattern=MembershipService --no-coverage
```

Expected: PASS（全部测试绿色）

- [ ] **Step 4: Commit**

```bash
git add __tests__/MembershipService.test.ts
git commit -m "test: add purchase/restore error and type-inference cases to MembershipService"
```

---

### Task 5: 新建 useMembership.test.tsx — 挂载 + listener

**Files:**
- Create: `__tests__/useMembership.test.tsx`

- [ ] **Step 1: 创建文件，写 mock + 挂载 + listener 测试**

```typescript
import { renderHook, act, waitFor } from '@testing-library/react-native';
import Purchases from 'react-native-purchases';
import MembershipService from '../src/services/MembershipService';
import useMembership from '../src/hooks/useMembership';
import { MEMBERSHIP_ENTITLEMENT } from '../src/utils/constants';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('react-native-google-mobile-ads', () => ({
  TestIds: { BANNER: 'test-banner-id', REWARDED: 'test-rewarded-id' },
  BannerAd: 'BannerAd',
  BannerAdSize: { BANNER: 'BANNER' },
}));

jest.mock('../src/services/MembershipService', () => ({
  __esModule: true,
  default: {
    isActive: jest.fn(),
    purchase: jest.fn(),
    restore: jest.fn(),
  },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
  },
}));

function makeCustomerInfo(
  entitlementActive: boolean,
  productId = 'membership_monthly',
  expirationDate: string | null = new Date(Date.now() + 86400000).toISOString()
) {
  const active: Record<string, any> = {};
  if (entitlementActive) {
    active[MEMBERSHIP_ENTITLEMENT] = { productIdentifier: productId, expirationDate };
  }
  return { entitlements: { active } };
}

describe('useMembership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (MembershipService.isActive as jest.Mock).mockResolvedValue(false);
    (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation(() => {});
    (Purchases.removeCustomerInfoUpdateListener as jest.Mock).mockImplementation(() => {});
  });

  describe('初始状态', () => {
    it('returns default state before effects resolve', () => {
      const { result } = renderHook(() => useMembership());
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
      expect(result.current.membershipType).toBe(null);
      expect(result.current.expiresAt).toBe(null);
    });
  });

  describe('挂载行为', () => {
    it('calls MembershipService.isActive on mount and updates isActive', async () => {
      (MembershipService.isActive as jest.Mock).mockResolvedValue(true);
      const { result } = renderHook(() => useMembership());
      await waitFor(() => expect(result.current.isActive).toBe(true));
      expect(MembershipService.isActive).toHaveBeenCalledTimes(1);
    });

    it('registers CustomerInfo update listener on mount', () => {
      renderHook(() => useMembership());
      expect(Purchases.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    });

    it('removes listener on unmount', () => {
      const { unmount } = renderHook(() => useMembership());
      unmount();
      expect(Purchases.removeCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('CustomerInfo 更新监听器', () => {
    it('updates to lifetime when listener fires with lifetime entitlement', () => {
      let capturedListener: ((info: any) => void) | undefined;
      (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
        capturedListener = cb;
      });
      const { result } = renderHook(() => useMembership());

      act(() => {
        capturedListener!(makeCustomerInfo(true, 'membership_lifetime', null));
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.membershipType).toBe('lifetime');
      expect(result.current.expiresAt).toBe(null);
    });

    it('updates to yearly when listener fires with yearly entitlement', () => {
      let capturedListener: ((info: any) => void) | undefined;
      (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
        capturedListener = cb;
      });
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      const { result } = renderHook(() => useMembership());

      act(() => {
        capturedListener!(makeCustomerInfo(true, 'membership_yearly', expiresAt));
      });

      expect(result.current.isActive).toBe(true);
      expect(result.current.membershipType).toBe('yearly');
      expect(result.current.expiresAt).toBe(expiresAt);
    });

    it('resets state when listener fires with no active entitlement', () => {
      let capturedListener: ((info: any) => void) | undefined;
      (Purchases.addCustomerInfoUpdateListener as jest.Mock).mockImplementation((cb) => {
        capturedListener = cb;
      });
      const { result } = renderHook(() => useMembership());

      act(() => { capturedListener!(makeCustomerInfo(false)); });

      expect(result.current.isActive).toBe(false);
      expect(result.current.membershipType).toBe(null);
    });
  });
});
```

- [ ] **Step 2: 运行确认通过**

```bash
npx jest --testPathPattern=useMembership --no-coverage
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add __tests__/useMembership.test.tsx
git commit -m "test: add useMembership hook — mount behavior and CustomerInfo listener tests"
```

---

### Task 6: useMembership — purchase() + restore() 状态流转

**Files:**
- Modify: `__tests__/useMembership.test.tsx`

- [ ] **Step 1: 在最外层 `describe` 闭合括号前追加 purchase + restore 两个 describe 块**

```typescript
  describe('purchase()', () => {
    it('sets isLoading true during purchase and false after success', async () => {
      let resolvePurchase!: () => void;
      (MembershipService.purchase as jest.Mock).mockImplementation(
        () => new Promise<void>(resolve => { resolvePurchase = resolve; })
      );
      const { result } = renderHook(() => useMembership());

      act(() => { result.current.purchase('monthly'); });
      expect(result.current.isLoading).toBe(true);

      await act(async () => { resolvePurchase(); });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('sets error message and rethrows when purchase fails', async () => {
      (MembershipService.purchase as jest.Mock).mockRejectedValue(new Error('payment declined'));
      const { result } = renderHook(() => useMembership());

      await expect(
        act(() => result.current.purchase('monthly'))
      ).rejects.toThrow('payment declined');

      expect(result.current.error).toBe('payment declined');
    });

    it('sets isLoading false in finally even when purchase throws', async () => {
      (MembershipService.purchase as jest.Mock).mockRejectedValue(new Error('fail'));
      const { result } = renderHook(() => useMembership());

      await act(async () => {
        try { await result.current.purchase('monthly'); } catch {}
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('restore()', () => {
    it('sets isLoading true during restore and false after success', async () => {
      let resolveRestore!: () => void;
      (MembershipService.restore as jest.Mock).mockImplementation(
        () => new Promise<void>(resolve => { resolveRestore = resolve; })
      );
      const { result } = renderHook(() => useMembership());

      act(() => { result.current.restore(); });
      expect(result.current.isLoading).toBe(true);

      await act(async () => { resolveRestore(); });
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('sets error message and rethrows when restore fails', async () => {
      (MembershipService.restore as jest.Mock).mockRejectedValue(new Error('no purchases found'));
      const { result } = renderHook(() => useMembership());

      await expect(
        act(() => result.current.restore())
      ).rejects.toThrow('no purchases found');

      expect(result.current.error).toBe('no purchases found');
    });

    it('sets isLoading false in finally even when restore throws', async () => {
      (MembershipService.restore as jest.Mock).mockRejectedValue(new Error('fail'));
      const { result } = renderHook(() => useMembership());

      await act(async () => {
        try { await result.current.restore(); } catch {}
      });

      expect(result.current.isLoading).toBe(false);
    });
  });
```

- [ ] **Step 2: 运行确认通过**

```bash
npx jest --testPathPattern=useMembership --no-coverage
```

Expected: PASS（全部测试绿色）

- [ ] **Step 3: Commit**

```bash
git add __tests__/useMembership.test.tsx
git commit -m "test: add purchase and restore state flow tests to useMembership hook"
```

---

### Task 7: 新建 MembershipScreen.test.tsx — 渲染 + 套餐选择

**Files:**
- Create: `__tests__/MembershipScreen.test.tsx`

- [ ] **Step 1: 创建文件，写 mock setup + 渲染 + 套餐选择测试**

```typescript
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import MembershipScreen from '../src/screens/MembershipScreen';
import MembershipService from '../src/services/MembershipService';
import useMembershipHook from '../src/hooks/useMembership';

jest.mock('react-native-google-mobile-ads', () => ({
  TestIds: { BANNER: 'test-banner-id', REWARDED: 'test-rewarded-id' },
  BannerAd: 'BannerAd',
  BannerAdSize: { BANNER: 'BANNER' },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../src/i18n', () => ({
  __esModule: true,
  default: () => ({ t: (key: string) => key }),
}));

jest.mock('../src/hooks/useMembership');
const mockUseMembership = useMembershipHook as jest.MockedFunction<typeof useMembershipHook>;

jest.mock('../src/services/MembershipService', () => ({
  __esModule: true,
  default: { getProductPrices: jest.fn() },
}));

const makeDefaultHookState = (overrides = {}) => ({
  isActive: false,
  membershipType: null as null,
  expiresAt: null as null,
  isLoading: false,
  error: null as null,
  purchase: jest.fn().mockResolvedValue(undefined),
  restore: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

function makeNavigation() {
  return { goBack: jest.fn() };
}

describe('MembershipScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMembership.mockReturnValue(makeDefaultHookState());
    (MembershipService.getProductPrices as jest.Mock).mockResolvedValue({});
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('渲染', () => {
    it('renders all three plan options', () => {
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);
      expect(getByText('membership.planMonthlyLabel')).toBeTruthy();
      expect(getByText('membership.planYearlyLabel')).toBeTruthy();
      expect(getByText('membership.planLifetimeLabel')).toBeTruthy();
    });

    it('shows -- for all plan prices when not yet loaded', () => {
      (MembershipService.getProductPrices as jest.Mock).mockReturnValue(new Promise(() => {}));
      const { getAllByText } = render(<MembershipScreen navigation={makeNavigation()} />);
      expect(getAllByText('--').length).toBeGreaterThanOrEqual(3);
    });

    it('shows price with suffix after prices load', async () => {
      (MembershipService.getProductPrices as jest.Mock).mockResolvedValue({
        monthly: '$2.99',
        yearly: '$19.99',
        lifetime: '$49.99',
      });
      const { findByText } = render(<MembershipScreen navigation={makeNavigation()} />);
      await findByText('$2.99membership.perMonth');
      await findByText('$19.99membership.perYear');
      await findByText('$49.99');
    });
  });

  describe('套餐选择', () => {
    it('default selection is yearly — subscribe button calls purchase with yearly', async () => {
      const purchase = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.subscribe')); });

      expect(purchase).toHaveBeenCalledWith('yearly');
    });

    it('tapping monthly plan then subscribe calls purchase with monthly', async () => {
      const purchase = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      fireEvent.press(getByText('membership.planMonthlyLabel'));
      await act(async () => { fireEvent.press(getByText('membership.subscribe')); });

      expect(purchase).toHaveBeenCalledWith('monthly');
    });

    it('tapping lifetime plan then subscribe calls purchase with lifetime', async () => {
      const purchase = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      fireEvent.press(getByText('membership.planLifetimeLabel'));
      await act(async () => { fireEvent.press(getByText('membership.subscribe')); });

      expect(purchase).toHaveBeenCalledWith('lifetime');
    });
  });

  describe('购买按钮状态', () => {
    it('hides subscribe text and shows loading when isLoading is true', () => {
      mockUseMembership.mockReturnValue(makeDefaultHookState({ isLoading: true }));
      const { queryByText } = render(<MembershipScreen navigation={makeNavigation()} />);
      expect(queryByText('membership.subscribe')).toBeNull();
    });
  });
});
```

- [ ] **Step 2: 运行确认通过**

```bash
npx jest --testPathPattern=MembershipScreen --no-coverage
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add __tests__/MembershipScreen.test.tsx
git commit -m "test: add MembershipScreen render and plan selection tests"
```

---

### Task 8: MembershipScreen — handlePurchase 核心支付路径

**Files:**
- Modify: `__tests__/MembershipScreen.test.tsx`

- [ ] **Step 1: 在最外层 `describe('MembershipScreen')` 闭合括号前追加**

```typescript
  describe('handlePurchase — 核心支付路径', () => {
    it('calls navigation.goBack after successful purchase', async () => {
      const purchase = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const navigation = makeNavigation();
      const { getByText } = render(<MembershipScreen navigation={navigation} />);

      await act(async () => { fireEvent.press(getByText('membership.subscribe')); });

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('does NOT show Alert when error has userCancelled=true', async () => {
      const cancelError = Object.assign(new Error('cancelled'), { userCancelled: true });
      const purchase = jest.fn().mockRejectedValue(cancelError);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.subscribe')); });

      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('does NOT show Alert when error message contains "cancel"', async () => {
      const cancelError = new Error('User cancelled the purchase');
      const purchase = jest.fn().mockRejectedValue(cancelError);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.subscribe')); });

      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('shows Alert with error message for real payment failure', async () => {
      const paymentError = new Error('Payment method declined');
      const purchase = jest.fn().mockRejectedValue(paymentError);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ purchase }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.subscribe')); });

      expect(Alert.alert).toHaveBeenCalledWith(
        'membership.purchaseFailed',
        'Payment method declined'
      );
    });
  });
```

- [ ] **Step 2: 运行确认通过**

```bash
npx jest --testPathPattern=MembershipScreen --no-coverage
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add __tests__/MembershipScreen.test.tsx
git commit -m "test: add handlePurchase critical payment path tests to MembershipScreen"
```

---

### Task 9: MembershipScreen — handleRestore

**Files:**
- Modify: `__tests__/MembershipScreen.test.tsx`

- [ ] **Step 1: 在最外层 `describe('MembershipScreen')` 闭合括号前追加**

```typescript
  describe('handleRestore — 恢复购买', () => {
    it('shows success Alert when restore succeeds', async () => {
      const restore = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ restore }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.restore')); });

      expect(Alert.alert).toHaveBeenCalledWith(
        'membership.restoreSuccess',
        'membership.restoreSuccessMsg',
        expect.arrayContaining([
          expect.objectContaining({ text: 'common.ok' }),
        ])
      );
    });

    it('calls navigation.goBack when OK is pressed on success Alert', async () => {
      const restore = jest.fn().mockResolvedValue(undefined);
      mockUseMembership.mockReturnValue(makeDefaultHookState({ restore }));
      const navigation = makeNavigation();
      const { getByText } = render(<MembershipScreen navigation={navigation} />);

      await act(async () => { fireEvent.press(getByText('membership.restore')); });

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const buttons: any[] = alertCall[2];
      const okButton = buttons.find((b: any) => b.text === 'common.ok');

      act(() => { okButton.onPress(); });

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('shows failure Alert when restore throws', async () => {
      const restore = jest.fn().mockRejectedValue(new Error('No purchases found'));
      mockUseMembership.mockReturnValue(makeDefaultHookState({ restore }));
      const { getByText } = render(<MembershipScreen navigation={makeNavigation()} />);

      await act(async () => { fireEvent.press(getByText('membership.restore')); });

      expect(Alert.alert).toHaveBeenCalledWith(
        'membership.restoreFailed',
        'No purchases found'
      );
    });
  });
```

- [ ] **Step 2: 运行确认通过**

```bash
npx jest --testPathPattern=MembershipScreen --no-coverage
```

Expected: PASS（全部测试绿色）

- [ ] **Step 3: Commit**

```bash
git add __tests__/MembershipScreen.test.tsx
git commit -m "test: add handleRestore tests to MembershipScreen"
```

---

### Task 10: 全量测试验证

**Files:** 无修改

- [ ] **Step 1: 运行全部测试**

```bash
npx jest --no-coverage
```

Expected:
```
PASS __tests__/MembershipService.test.ts
PASS __tests__/useMembership.test.tsx
PASS __tests__/MembershipScreen.test.tsx
```

- [ ] **Step 2: 常见失败排查**

| 错误 | 解决 |
|------|------|
| `Cannot find module '@testing-library/react-native'` | 确认 Task 1 安装成功：`npm ls @testing-library/react-native` |
| `Cannot read properties of undefined (reading 'alert')` | 在 MembershipScreen.test.tsx 的 `beforeEach` 确认 `jest.spyOn(Alert, 'alert')` 在 `render` 之前执行 |
| `act()` 包裹警告变错误 | 将 `fireEvent.press` 包裹在 `await act(async () => { ... })` 中 |
| `useSafeAreaInsets is not a function` | 确认 `react-native-safe-area-context` mock 导出的是对象而非函数 |
| `useColorScheme is not a function` | jest-expo 已 mock，若仍报错则在 MembershipScreen.test.tsx 顶部加 `jest.mock('react-native', () => ({ ...jest.requireActual('react-native'), useColorScheme: () => null }))` |

- [ ] **Step 3: 记录最终覆盖情况（可选）**

```bash
npx jest --testPathPattern="MembershipService|useMembership|MembershipScreen" --coverage --collectCoverageFrom="src/services/MembershipService.ts,src/hooks/useMembership.ts,src/screens/MembershipScreen.tsx"
```

Expected: MembershipService ≥ 90%，useMembership ≥ 85%，MembershipScreen ≥ 80%
