# Membership 模块测试设计

## 背景

RevenueCat 会员购买涉及真实支付，测试覆盖不足容易引发退款纠纷。当前 `MembershipService.test.ts` 有基础覆盖，但存在明显空白；`useMembership` hook 和 `MembershipScreen` 完全没有测试。

## 范围

覆盖三层：

1. **MembershipService**（扩展现有测试文件）
2. **useMembership hook**（新建 `__tests__/useMembership.test.tsx`）
3. **MembershipScreen UI**（新建 `__tests__/MembershipScreen.test.tsx`）

## 新增依赖

```
@testing-library/react-native（devDependency）
```

用于 hook 的 `renderHook` 和 Screen 的组件渲染。

---

## Section 1：MembershipService 补充用例

文件：`__tests__/MembershipService.test.ts`（在现有基础上扩展）

### initialize

| 用例 | 验证点 |
|------|--------|
| Android 平台 | `Purchases.configure` 使用 `REVENUECAT_API_KEYS.ANDROID` |

### isActive

| 用例 | 验证点 |
|------|--------|
| 本地缓存为 null | 返回 `false` |
| monthly 类型 + 未来过期 | 返回 `true`（补全三种类型覆盖） |

### getProductPrices（当前零覆盖）

| 用例 | 验证点 |
|------|--------|
| 多个产品 | 返回 `{ id: priceString }` map |
| 产品列表为空 | 返回 `{}` |
| 单个产品 | 返回单条 map |

### purchase

| 用例 | 验证点 |
|------|--------|
| `purchaseStoreProduct` 抛出 | 异常向上传播（不吞错） |
| yearly 产品 | 缓存写入 `type:'yearly'` |
| lifetime 产品 | 缓存写入 `type:'lifetime', expiresAt:null` |

### restore

| 用例 | 验证点 |
|------|--------|
| `restorePurchases` 抛出 | 异常向上传播 |
| restore 后无有效权益 | 缓存写入 `isActive:false` |

### `_isActiveFromCache` 边界

| 用例 | 验证点 |
|------|--------|
| `expiresAt` 恰好等于当前时间 | 返回 `false`（用 `>` 而非 `>=`） |
| `type:null` 但 `isActive:true` | 返回 `false` |

---

## Section 2：useMembership Hook

文件：`__tests__/useMembership.test.tsx`（新建）

Mock 策略：mock `MembershipService` 整体 + mock `react-native-purchases`（`addCustomerInfoUpdateListener` / `removeCustomerInfoUpdateListener`）。

### 初始状态

| 用例 | 验证点 |
|------|--------|
| 挂载后 | `isActive=false, membershipType=null, expiresAt=null, isLoading=false, error=null` |

### 挂载行为

| 用例 | 验证点 |
|------|--------|
| 挂载时 | 调用 `MembershipService.isActive()` 并更新 `isActive` |
| 挂载时 | 注册 `CustomerInfo` 更新监听器 |
| 卸载时 | 移除监听器（防内存泄漏） |

### CustomerInfo 更新监听器

| 用例 | 验证点 |
|------|--------|
| 收到 lifetime 权益 | `isActive=true, membershipType='lifetime', expiresAt=null` |
| 收到 yearly 权益 | `membershipType='yearly', expiresAt` 有值 |
| 收到无权益 | `isActive=false, membershipType=null` |

### purchase()

| 用例 | 验证点 |
|------|--------|
| 调用期间 | `isLoading=true` |
| 成功后 | `isLoading=false, error=null` |
| 失败后 | `error` 设为错误信息，向上 rethrow |
| 失败后（finally） | `isLoading=false` |

### restore()

| 用例 | 验证点 |
|------|--------|
| 调用期间 | `isLoading=true` |
| 成功后 | `isLoading=false, error=null` |
| 失败后 | `error` 设为错误信息，向上 rethrow |
| 失败后（finally） | `isLoading=false` |

---

## Section 3：MembershipScreen UI

文件：`__tests__/MembershipScreen.test.tsx`（新建）

Mock 策略：mock `useMembership` hook 返回值 + mock `MembershipService.getProductPrices` + mock `react-native` 的 `Alert.alert`。

### 渲染

| 用例 | 验证点 |
|------|--------|
| 初始渲染 | 显示月付、年付、永久三个套餐 |
| 默认选中 | 年付套餐高亮 |
| 价格未加载 | 显示 `'--'` |
| 价格加载后 | 月付显示 `价格 + /月`，年付显示 `价格 + /年`，永久无后缀 |

### 套餐选择

| 用例 | 验证点 |
|------|--------|
| 点击月付 | 月付高亮，年付取消高亮 |
| 点击永久 | 永久高亮 |

### 购买按钮状态

| 用例 | 验证点 |
|------|--------|
| `isLoading=true` | 显示 `ActivityIndicator`，按钮 disabled |
| `isLoading=false` | 显示订阅文字，按钮可点 |

### handlePurchase — 核心支付路径

| 用例 | 验证点 |
|------|--------|
| 点击订阅（默认年付） | 调用 `purchase('yearly')` |
| 切换到月付后订阅 | 调用 `purchase('monthly')` |
| 购买成功 | `navigation.goBack()` 被调用 |
| `e.userCancelled=true` | `Alert.alert` **不**被调用 |
| 错误消息含 `'cancel'` | `Alert.alert` **不**被调用 |
| 真实支付/网络错误 | `Alert.alert` 被调用，含错误信息 |

### handleRestore — 恢复购买

| 用例 | 验证点 |
|------|--------|
| 恢复成功 | `Alert.alert` 显示成功提示 |
| 成功 Alert 点 OK | `navigation.goBack()` 被调用 |
| 恢复失败 | `Alert.alert` 显示失败提示 |

---

## 测试文件结构

```
__tests__/
  MembershipService.test.ts   ← 现有文件扩展
  useMembership.test.tsx      ← 新建
  MembershipScreen.test.tsx   ← 新建
```

## Mock 策略总结

| 层 | Mock 对象 |
|----|----------|
| MembershipService | `react-native-purchases`, `StorageService`, `react-native Platform` |
| useMembership | `MembershipService`, `react-native-purchases`（listener） |
| MembershipScreen | `useMembership`（hook），`MembershipService.getProductPrices`, `Alert` |
