# 会员模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 集成 RevenueCat IAP，实现买断制/月订阅/年订阅购买、会员状态管理和会员购买页面。

**Architecture:** MembershipService 封装 RevenueCat SDK 作为抽象层，对外接口稳定，未来迁移至 expo-iap 只需重写内部；useMembership hook 订阅 RevenueCat 状态变化；本地 AsyncStorage 作为离线 fallback 缓存。

**Tech Stack:** react-native-purchases (RevenueCat SDK v8+), React Navigation Modal, AsyncStorage (offline fallback), Ionicons

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 安装依赖 | `package.json` | 新增 react-native-purchases |
| 修改 | `app.json` | 添加 react-native-purchases config plugin |
| 修改 | `src/utils/constants.ts` | RevenueCat API key 占位符、产品 ID、entitlement 常量 |
| 重写 | `src/services/MembershipService.ts` | RevenueCat SDK 封装，接口与现有一致 |
| 重写 | `__tests__/MembershipService.test.ts` | 更新为 RevenueCat mock |
| 新增 | `src/hooks/useMembership.ts` | 会员状态 hook，订阅 RevenueCat listener |
| 新增 | `src/screens/MembershipScreen.tsx` | 购买页面 UI |
| 修改 | `src/navigation/AppNavigator.tsx` | 新增 Membership Modal 路由 + 书架皇冠入口 |
| 修改 | `App.tsx` | App 启动时调用 MembershipService.initialize() |
| 修改 | `src/components/AdBanner.tsx` | 新增 onUpgradePress prop |
| 修改 | `src/screens/ReaderScreen.tsx` | 传 onUpgradePress + useFocusEffect 刷新广告状态 |

---

## Task 1: 安装 react-native-purchases + 添加常量

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `app.json`
- Modify: `src/utils/constants.ts`

- [ ] **Step 1: 安装依赖**

```bash
npm install react-native-purchases
```

Expected: `react-native-purchases` 出现在 `package.json` dependencies 中。

- [ ] **Step 2: 添加 app.json plugin**

在 `app.json` 的 `plugins` 数组中追加 `"react-native-purchases"`。最终 plugins 字段：

```json
"plugins": [
  [
    "react-native-google-mobile-ads",
    {
      "androidAppId": "ca-app-pub-3842092557707512~5792917189",
      "iosAppId": "ca-app-pub-3842092557707512~6818538870"
    }
  ],
  "react-native-purchases"
]
```

- [ ] **Step 3: 添加 constants**

在 `src/utils/constants.ts` 末尾追加（`Platform` 已在文件顶部 import）：

```typescript
export const REVENUECAT_API_KEYS = {
  IOS: 'appl_PLACEHOLDER',
  ANDROID: 'goog_PLACEHOLDER',
};

export const MEMBERSHIP_PRODUCT_IDS = {
  MONTHLY: 'membership_monthly',
  YEARLY: 'membership_yearly',
  LIFETIME: 'membership_lifetime',
};

export const MEMBERSHIP_ENTITLEMENT = 'premium';
```

- [ ] **Step 4: 运行 expo prebuild 生成原生代码**

```bash
expo prebuild --clean
```

Expected: ios/ 和 android/ 目录重新生成，无报错。

- [ ] **Step 5: 验证 App 启动**

```bash
expo run:ios
```

Expected: App 正常启动，无 native module 缺失错误。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app.json src/utils/constants.ts
git commit -m "feat: install react-native-purchases and add RevenueCat constants"
```

---

## Task 2: 重写 MembershipService（TDD）

**Files:**
- Rewrite: `src/services/MembershipService.ts`
- Rewrite: `__tests__/MembershipService.test.ts`

- [ ] **Step 1: 写失败测试**

完整替换 `__tests__/MembershipService.test.ts`：

```typescript
import MembershipService from '../src/services/MembershipService';
import StorageService from '../src/services/StorageService';
import Purchases from 'react-native-purchases';
import { STORAGE_KEYS, MEMBERSHIP_ENTITLEMENT } from '../src/utils/constants';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../src/services/StorageService', () => ({
  __esModule: true,
  default: {
    getData: jest.fn(),
    storeData: jest.fn(),
  },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    getCustomerInfo: jest.fn(),
    getProducts: jest.fn(),
    purchaseStoreProduct: jest.fn(),
    restorePurchases: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
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

describe('MembershipService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('initialize', () => {
    it('calls Purchases.configure with ios api key', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(makeCustomerInfo(false));
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      await MembershipService.initialize();
      expect(Purchases.configure).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'appl_PLACEHOLDER' })
      );
    });

    it('does not throw when getCustomerInfo fails on initialize', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('network'));
      await expect(MembershipService.initialize()).resolves.toBeUndefined();
    });
  });

  describe('isActive', () => {
    it('returns true when premium entitlement is active', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(makeCustomerInfo(true));
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      expect(await MembershipService.isActive()).toBe(true);
    });

    it('returns false when no premium entitlement', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockResolvedValue(makeCustomerInfo(false));
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);
      expect(await MembershipService.isActive()).toBe(false);
    });

    it('falls back to local cache when RevenueCat throws', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'lifetime', expiresAt: null,
      });
      expect(await MembershipService.isActive()).toBe(true);
    });

    it('returns false from cache when subscription expired', async () => {
      (Purchases.getCustomerInfo as jest.Mock).mockRejectedValue(new Error('offline'));
      const past = new Date(Date.now() - 86400000).toISOString();
      (StorageService.getData as jest.Mock).mockResolvedValue({
        isActive: true, type: 'yearly', expiresAt: past,
      });
      expect(await MembershipService.isActive()).toBe(false);
    });
  });

  describe('purchase', () => {
    it('calls purchaseStoreProduct and syncs cache on success', async () => {
      const product = { identifier: 'membership_monthly' };
      (Purchases.getProducts as jest.Mock).mockResolvedValue([product]);
      const customerInfo = makeCustomerInfo(true, 'membership_monthly');
      (Purchases.purchaseStoreProduct as jest.Mock).mockResolvedValue({ customerInfo });
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);

      await MembershipService.purchase('membership_monthly');

      expect(Purchases.purchaseStoreProduct).toHaveBeenCalledWith(product);
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isActive: true, type: 'monthly' })
      );
    });

    it('throws when product not found in store', async () => {
      (Purchases.getProducts as jest.Mock).mockResolvedValue([]);
      await expect(MembershipService.purchase('membership_monthly')).rejects.toThrow('Product not found');
    });
  });

  describe('restore', () => {
    it('calls restorePurchases and syncs cache', async () => {
      const customerInfo = makeCustomerInfo(true, 'membership_lifetime', null);
      (Purchases.restorePurchases as jest.Mock).mockResolvedValue(customerInfo);
      (StorageService.storeData as jest.Mock).mockResolvedValue(undefined);

      await MembershipService.restore();

      expect(Purchases.restorePurchases).toHaveBeenCalled();
      expect(StorageService.storeData).toHaveBeenCalledWith(
        STORAGE_KEYS.MEMBERSHIP,
        expect.objectContaining({ isActive: true, type: 'lifetime', expiresAt: null })
      );
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
jest --testPathPattern=MembershipService
```

Expected: 所有测试 FAIL（旧实现不认识 RevenueCat mock）。

- [ ] **Step 3: 重写 MembershipService**

完整替换 `src/services/MembershipService.ts`：

```typescript
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import StorageService from './StorageService';
import { STORAGE_KEYS, REVENUECAT_API_KEYS, MEMBERSHIP_ENTITLEMENT } from '../utils/constants';

export interface MembershipState {
  isActive: boolean;
  type: 'lifetime' | 'monthly' | 'yearly' | null;
  expiresAt: string | null;
}

type MembershipType = 'lifetime' | 'monthly' | 'yearly';

function inferType(productIdentifier: string): MembershipType {
  if (productIdentifier.includes('lifetime')) return 'lifetime';
  if (productIdentifier.includes('yearly')) return 'yearly';
  return 'monthly';
}

class MembershipService {
  async initialize(): Promise<void> {
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEYS.IOS : REVENUECAT_API_KEYS.ANDROID;
    Purchases.configure({ apiKey });
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      await this._syncCache(customerInfo);
    } catch {
      // 忽略网络错误，fallback 到本地缓存
    }
  }

  async isActive(): Promise<boolean> {
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      await this._syncCache(customerInfo);
      return !!customerInfo.entitlements.active[MEMBERSHIP_ENTITLEMENT];
    } catch {
      const state = await this._getCachedState();
      return this._isActiveFromCache(state);
    }
  }

  async purchase(productId: string): Promise<void> {
    const products = await Purchases.getProducts([productId]);
    if (products.length === 0) throw new Error(`Product not found: ${productId}`);
    const { customerInfo } = await Purchases.purchaseStoreProduct(products[0]);
    await this._syncCache(customerInfo);
  }

  async restore(): Promise<void> {
    const customerInfo = await Purchases.restorePurchases();
    await this._syncCache(customerInfo);
  }

  async getCustomerInfo(): Promise<CustomerInfo> {
    return Purchases.getCustomerInfo();
  }

  async syncWithServer(): Promise<void> {
    // 占位，未来后端验证用
  }

  private async _syncCache(customerInfo: CustomerInfo): Promise<void> {
    const entitlement = customerInfo.entitlements.active[MEMBERSHIP_ENTITLEMENT];
    const isActive = !!entitlement;
    const type: MembershipType | null = entitlement ? inferType(entitlement.productIdentifier) : null;
    const expiresAt = entitlement?.expirationDate ?? null;
    await StorageService.storeData(STORAGE_KEYS.MEMBERSHIP, { isActive, type, expiresAt });
  }

  private async _getCachedState(): Promise<MembershipState> {
    const state = await StorageService.getData(STORAGE_KEYS.MEMBERSHIP);
    if (!state) return { isActive: false, type: null, expiresAt: null };
    return state as MembershipState;
  }

  private _isActiveFromCache(state: MembershipState): boolean {
    if (!state.isActive || !state.type) return false;
    if (state.type === 'lifetime') return true;
    if (!state.expiresAt) return false;
    return new Date(state.expiresAt) > new Date();
  }
}

export default new MembershipService();
```

- [ ] **Step 4: 运行测试确认通过**

```bash
jest --testPathPattern=MembershipService
```

Expected: 所有测试 PASS。

- [ ] **Step 5: 确认 AdService 测试仍通过**

```bash
jest --testPathPattern=AdService
```

Expected: 所有测试 PASS（AdService mock 了 MembershipService，不受影响）。

- [ ] **Step 6: Commit**

```bash
git add src/services/MembershipService.ts __tests__/MembershipService.test.ts
git commit -m "feat: rewrite MembershipService with RevenueCat SDK"
```

---

## Task 3: 创建 useMembership hook

**Files:**
- Create: `src/hooks/useMembership.ts`

- [ ] **Step 1: 创建 hook 文件**

新建 `src/hooks/useMembership.ts`：

```typescript
import { useState, useEffect } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import MembershipService, { MembershipState } from '../services/MembershipService';
import { MEMBERSHIP_ENTITLEMENT } from '../utils/constants';

export interface UseMembershipReturn {
  isActive: boolean;
  membershipType: MembershipState['type'];
  expiresAt: string | null;
  purchase: (productId: string) => Promise<void>;
  restore: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

function extractState(customerInfo: CustomerInfo): Pick<UseMembershipReturn, 'isActive' | 'membershipType' | 'expiresAt'> {
  const entitlement = customerInfo.entitlements.active[MEMBERSHIP_ENTITLEMENT];
  if (!entitlement) return { isActive: false, membershipType: null, expiresAt: null };
  const id = entitlement.productIdentifier;
  const membershipType: MembershipState['type'] = id.includes('lifetime') ? 'lifetime' : id.includes('yearly') ? 'yearly' : 'monthly';
  return { isActive: true, membershipType, expiresAt: entitlement.expirationDate ?? null };
}

export default function useMembership(): UseMembershipReturn {
  const [isActive, setIsActive] = useState(false);
  const [membershipType, setMembershipType] = useState<MembershipState['type']>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    MembershipService.isActive().then(setIsActive);

    const listener = Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
      const state = extractState(info);
      setIsActive(state.isActive);
      setMembershipType(state.membershipType);
      setExpiresAt(state.expiresAt);
    });

    return () => { listener.remove(); };
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

  return { isActive, membershipType, expiresAt, purchase, restore, isLoading, error };
}
```

- [ ] **Step 2: 确认全量测试通过**

```bash
jest
```

Expected: 所有已有测试 PASS，无新错误。

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useMembership.ts
git commit -m "feat: add useMembership hook"
```

---

## Task 4: 创建 MembershipScreen

**Files:**
- Create: `src/screens/MembershipScreen.tsx`

- [ ] **Step 1: 创建 MembershipScreen**

新建 `src/screens/MembershipScreen.tsx`：

```typescript
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, useColorScheme, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import useMembership from '../hooks/useMembership';
import { MEMBERSHIP_PRODUCT_IDS } from '../utils/constants';

type PlanId = typeof MEMBERSHIP_PRODUCT_IDS[keyof typeof MEMBERSHIP_PRODUCT_IDS];

const PLANS: { id: PlanId; label: string; sublabel: string; price: string }[] = [
  { id: MEMBERSHIP_PRODUCT_IDS.MONTHLY, label: '月度会员', sublabel: '按月订阅', price: '¥ --/月' },
  { id: MEMBERSHIP_PRODUCT_IDS.YEARLY, label: '年度会员', sublabel: '按年订阅，更划算', price: '¥ --/年' },
  { id: MEMBERSHIP_PRODUCT_IDS.LIFETIME, label: '永久会员', sublabel: '一次买断，终身有效', price: '¥ --' },
];

const BENEFITS = ['去除全部广告', '更多权益即将推出...'];

export default function MembershipScreen({ navigation }: any) {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(MEMBERSHIP_PRODUCT_IDS.YEARLY);
  const { purchase, restore, isLoading } = useMembership();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = {
    bg:      isDark ? '#0E0C0A' : '#FAF7F0',
    surface: isDark ? '#1C1916' : '#F3ECE0',
    border:  isDark ? '#2A2520' : '#E0D4C0',
    accent:  isDark ? '#C4A96A' : '#A0621A',
    text:    isDark ? '#E8E0D0' : '#2C1A0E',
    subText: isDark ? '#6A5A44' : '#9A7A5A',
  };

  const handlePurchase = async () => {
    try {
      await purchase(selectedPlan);
      navigation.goBack();
    } catch (e: any) {
      if (!e?.userCancelled && !e?.message?.toLowerCase().includes('cancel')) {
        Alert.alert('购买失败', e?.message ?? '请稍后重试');
      }
    }
  };

  const handleRestore = async () => {
    try {
      await restore();
      Alert.alert('恢复成功', '会员权益已恢复');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('恢复失败', e?.message ?? '未找到可恢复的购买记录');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>墨声会员</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.benefitsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>会员权益</Text>
          {BENEFITS.map((benefit, i) => (
            <View key={i} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              <Text style={[styles.benefitText, { color: colors.text }]}>{benefit}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24, marginBottom: 12 }]}>选择方案</Text>
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
                <Text style={[styles.planSublabel, { color: colors.subText }]}>{plan.sublabel}</Text>
              </View>
              <Text style={[styles.planPrice, { color: colors.accent }]}>{plan.price}</Text>
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
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.purchaseButtonText}>立即订阅</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={handleRestore} disabled={isLoading} style={styles.restoreButton}>
          <Text style={[styles.restoreText, { color: colors.subText }]}>恢复购买</Text>
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

- [ ] **Step 2: 确认全量测试通过**

```bash
jest
```

Expected: 所有测试 PASS。

- [ ] **Step 3: Commit**

```bash
git add src/screens/MembershipScreen.tsx
git commit -m "feat: add MembershipScreen UI"
```

---

## Task 5: 导航路由 + 书架皇冠入口

**Files:**
- Modify: `src/navigation/AppNavigator.tsx`

- [ ] **Step 1: 添加 MembershipScreen import**

在 `src/navigation/AppNavigator.tsx` 顶部 import 区域添加：

```typescript
import MembershipScreen from '../screens/MembershipScreen';
```

- [ ] **Step 2: 添加 Membership 路由**

在 `Stack.Navigator` 内，`ChaptersScreen` 之后添加：

```typescript
<Stack.Screen
  name="Membership"
  component={MembershipScreen}
  options={{ presentation: 'modal', headerShown: false }}
/>
```

- [ ] **Step 3: 更新书架 headerRight 添加钻石图标入口**

找到 Bookshelf screen 的 `headerRight`（约第 81-86 行），当前代码：

```typescript
headerRight: () => (
  <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ paddingHorizontal: 14 }}>
    <Ionicons name="settings-outline" size={22} color={isDark ? '#C4A96A' : '#A0621A'} />
  </TouchableOpacity>
),
```

替换为（`View` 已在 import 中）：

```typescript
headerRight: () => (
  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
    <TouchableOpacity onPress={() => navigation.navigate('Membership')} style={{ paddingHorizontal: 10 }}>
      <Ionicons name="diamond-outline" size={22} color={isDark ? '#C4A96A' : '#A0621A'} />
    </TouchableOpacity>
    <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={{ paddingHorizontal: 14 }}>
      <Ionicons name="settings-outline" size={22} color={isDark ? '#C4A96A' : '#A0621A'} />
    </TouchableOpacity>
  </View>
),
```

- [ ] **Step 4: 确认全量测试通过**

```bash
jest
```

Expected: 所有测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/navigation/AppNavigator.tsx
git commit -m "feat: add Membership modal route and bookshelf entry button"
```

---

## Task 6: App.tsx 启动时初始化 RevenueCat

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: 添加 import 和 initialize 调用**

在 `App.tsx` 顶部 import 区域添加：

```typescript
import MembershipService from './src/services/MembershipService';
```

在 `App` 函数内，`SplashScreen.hideAsync()` 那个 `useEffect` 同一个 effect 里调用（或新增一个紧邻的 `useEffect`）：

```typescript
useEffect(() => {
  MembershipService.initialize();
}, []);
```

- [ ] **Step 2: 确认全量测试通过**

```bash
jest
```

Expected: 所有测试 PASS。

- [ ] **Step 3: Commit**

```bash
git add App.tsx
git commit -m "feat: initialize RevenueCat on app startup"
```

---

## Task 7: AdBanner 添加升级会员入口 + ReaderScreen 传 callback

**Files:**
- Modify: `src/components/AdBanner.tsx`
- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: 更新 AdBanner props 和 UI**

在 `src/components/AdBanner.tsx` 中：

1. 更新 `AdBannerProps` 接口，新增 `onUpgradePress`：

```typescript
interface AdBannerProps {
  visible: boolean;
  onHidden: () => void;
  onUpgradePress: () => void;
  floating?: boolean;
}
```

2. 更新函数签名：

```typescript
export default function AdBanner({ visible, onHidden, onUpgradePress, floating = true }: AdBannerProps) {
```

3. 在 `hideButton` TouchableOpacity **之前**（紧挨着，在同一个 View 内）添加升级按钮：

```typescript
<TouchableOpacity
  style={styles.upgradeButton}
  onPress={onUpgradePress}
  disabled={loading}
  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
>
  <Text style={styles.upgradeText}>升级会员</Text>
</TouchableOpacity>
```

4. 在 `styles` 末尾添加：

```typescript
upgradeButton: {
  position: 'absolute',
  top: 4,
  left: 8,
  paddingHorizontal: 6,
  paddingVertical: 2,
},
upgradeText: {
  color: 'rgba(255,255,255,0.7)',
  fontSize: 11,
},
```

- [ ] **Step 2: 更新 ReaderScreen 的两处 AdBanner 调用**

在 `src/screens/ReaderScreen.tsx` 中：

第 2050 行，当前：
```typescript
<AdBanner visible={showAd} onHidden={() => setShowAd(false)} floating={false} />
```
改为：
```typescript
<AdBanner
  visible={showAd}
  onHidden={() => setShowAd(false)}
  onUpgradePress={() => navigation.navigate('Membership')}
  floating={false}
/>
```

第 2389-2392 行，当前：
```typescript
<AdBanner
  visible={showAd && !isMenuVisible}
  onHidden={() => setShowAd(false)}
/>
```
改为：
```typescript
<AdBanner
  visible={showAd && !isMenuVisible}
  onHidden={() => setShowAd(false)}
  onUpgradePress={() => navigation.navigate('Membership')}
/>
```

- [ ] **Step 3: 确认全量测试通过**

```bash
jest
```

Expected: 所有测试 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/components/AdBanner.tsx src/screens/ReaderScreen.tsx
git commit -m "feat: add upgrade membership button to AdBanner"
```

---

## Task 8: ReaderScreen useFocusEffect 刷新广告状态

购买会员后从 MembershipScreen 返回，ReaderScreen 需重新检查广告状态以自动隐藏 Banner。

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

- [ ] **Step 1: 添加 useFocusEffect import**

在 `src/screens/ReaderScreen.tsx` 第 1 行之后（约第 4-5 行附近的 navigation import），添加：

```typescript
import { useFocusEffect } from '@react-navigation/native';
```

- [ ] **Step 2: 添加 useFocusEffect**

在现有广告 useEffect（约第 557-561 行）**之后**，紧接着添加：

```typescript
useFocusEffect(
  useCallback(() => {
    let cancelled = false;
    AdService.shouldShowBanner().then(v => { if (!cancelled) setShowAd(v); });
    return () => { cancelled = true; };
  }, [])
);
```

（`useCallback` 已在第 1 行的 React import 中）

- [ ] **Step 3: 确认全量测试通过**

```bash
jest
```

Expected: 所有测试 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: refresh ad state on reader focus after membership purchase"
```

---

## 完成验收

全部 Task 完成后，运行完整测试套件确认无回归：

```bash
jest
```

Expected: 所有测试 PASS。

手动验收路径（需要 iOS 模拟器）：
1. 书架页面右上角显示钻石图标，点击进入会员页面
2. 会员页面显示三个方案卡片 + 权益列表，可选择并点击"立即订阅"（测试环境触发 sandbox IAP）
3. 阅读页面广告 Banner 左侧显示"升级会员"按钮，点击进入会员页面
4. 购买成功返回阅读页面后，Banner 自动隐藏
