# 会员模块设计文档

**日期**: 2026-04-24
**状态**: 待实现

---

## 1. 目标

实现完整的会员购买流程，包括买断制、月订阅、年订阅三种方案。会员用户享受无广告阅读体验，后续可扩展更多专属权益。

---

## 2. 范围

**包含：**
- MembershipService：封装 RevenueCat SDK，提供统一接口
- useMembership hook：供组件消费会员状态
- MembershipScreen：会员购买页面（方案展示、购买、恢复购买）
- 导航集成：Modal 方式呈现
- 入口集成：书架页面皇冠图标 + AdBanner 升级会员按钮

**不包含：**
- 服务端 webhook（预留接口占位，未来扩展）
- 自定义权益验证后端

---

## 3. 技术依赖

- `react-native-purchases`（RevenueCat SDK）
- RevenueCat Dashboard 配置产品与 Entitlement（占位符，上线前填入）

---

## 4. 数据模型

### RevenueCat 配置

| 项目 | 值 |
|------|----|
| Entitlement | `premium` |
| 月订阅 Product ID | `membership_monthly` |
| 年订阅 Product ID | `membership_yearly` |
| 买断制 Product ID | `membership_lifetime` |
| API Key (iOS) | `REVENUECAT_IOS_API_KEY`（占位符） |
| API Key (Android) | `REVENUECAT_ANDROID_API_KEY`（占位符） |

### MembershipState（本地缓存，供离线判断）

现有 `@audio_book_membership` AsyncStorage 结构保持不变，作为 RevenueCat 状态的本地镜像：

```typescript
interface MembershipState {
  isActive: boolean
  type: 'lifetime' | 'monthly' | 'yearly' | null
  expiresAt: string | null  // ISO 8601，lifetime 时为 null
}
```

---

## 5. 模块设计

### 5.1 MembershipService（重写）

对外接口与现有保持一致，内部替换为 RevenueCat 实现：

```
initialize(): Promise<void>
  Purchases.configure({ apiKey, appUserID: undefined })
  获取 CustomerInfo，更新本地 AsyncStorage 缓存

isActive(): Promise<boolean>
  获取 CustomerInfo
  检查 entitlements.active["premium"] 是否存在
  fallback：读取 AsyncStorage 本地缓存（网络不可用时）

purchase(productId: string): Promise<void>
  Purchases.purchaseStoreProduct(product)
  成功后更新本地缓存

restore(): Promise<void>
  Purchases.restorePurchases()
  更新本地缓存

getCustomerInfo(): Promise<CustomerInfo>
  Purchases.getCustomerInfo()

syncWithServer(): Promise<void>
  // 占位，未来后端验证用
```

### 5.2 useMembership hook（新增）

```typescript
interface UseMembershipReturn {
  isActive: boolean
  membershipType: 'lifetime' | 'monthly' | 'yearly' | null
  expiresAt: string | null
  purchase: (productId: string) => Promise<void>
  restore: () => Promise<void>
  isLoading: boolean
  error: string | null
}
```

- `App.tsx` 启动时调用 `MembershipService.initialize()`
- 订阅 `Purchases.addCustomerInfoUpdateListener` 自动刷新状态
- 组件卸载时移除监听器

### 5.3 MembershipScreen（新增）

**布局：**

```
┌─────────────────────────┐
│  ✕              墨声会员  │
├─────────────────────────┤
│  会员权益                 │
│  ✓ 去除全部广告            │
│  ✓ 更多权益即将推出...      │  ← benefits 数组，可扩展
├─────────────────────────┤
│  [月度] [年度]            │
│      [买断制]             │  ← 三个方案卡片，单选
├─────────────────────────┤
│  [ 立即订阅 ]             │
│  恢复购买                 │
└─────────────────────────┘
```

**状态机：**

```
idle
  → 点击购买/恢复 → loading（禁用所有按钮）
    → 成功 → 关闭 Modal
    → 用户取消 → 回到 idle（静默）
    → 失败 → 显示 error toast → 回到 idle
```

**Props：**
```typescript
// 无外部 Props，通过 useMembership hook 获取状态
// 导航关闭通过 navigation.goBack()
```

### 5.4 导航集成

`AppNavigator.tsx` 新增路由：

```typescript
<Stack.Screen
  name="Membership"
  component={MembershipScreen}
  options={{ presentation: 'modal', headerShown: false }}
/>
```

### 5.5 入口集成

**BookshelfScreen**：右上角添加皇冠图标按钮，非会员显示，点击导航至 `Membership`。

**AdBanner**：现有"隐藏"按钮左侧增加"升级会员"文字按钮，点击导航至 `Membership`。

---

## 6. 广告模块兼容

`AdService.shouldShowBanner()` 已调用 `MembershipService.isActive()`，无需改动。

会员购买成功后：
1. `useMembership` 状态更新
2. ReaderScreen 在 `useFocusEffect` 中重新调用 `AdService.shouldShowBanner()`
3. AdBanner 自动隐藏

---

## 7. 文件变更清单

| 操作 | 文件 |
|------|------|
| 重写 | `src/services/MembershipService.ts` |
| 新增 | `src/hooks/useMembership.ts` |
| 新增 | `src/screens/MembershipScreen.tsx` |
| 修改 | `src/navigation/AppNavigator.tsx` |
| 修改 | `src/screens/BookshelfScreen.tsx` |
| 修改 | `src/components/AdBanner.tsx` |

---

## 8. 边界与约定

- RevenueCat API Key 通过常量占位符管理，上线前替换，不硬编码在代码中
- `MembershipService` 接口设计与 IAP 库解耦，迁移至 expo-iap 时只需重写 service 内部
- 用户取消购买视为正常操作，不显示错误提示
- 网络不可用时 fallback 读取本地 AsyncStorage 缓存的会员状态
- ios/android 目录不直接编辑，通过 `expo prebuild` 生成
