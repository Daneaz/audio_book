# Free Trial 设计文档

## 概述

为现有会员制度新增 14 天免费试用，让用户先体验再付费。采用 App Store 标准试用方案：用户需绑定支付方式，试用期结束后自动扣款。

## 背景

现有会员制度：
- RevenueCat 管理 IAP
- 三档套餐：月度（`monthly`）、年度（`yearly`）、永久（`lifetime`）
- 权益：去广告
- Entitlement ID：`InkVoice Pro`

## 范围

- 月度、年度套餐提供 14 天免费试用（永久买断不适用）
- 实际试用期长度在 App Store Connect 配置，代码只负责检测和展示

## 数据层

### MembershipState 扩展

```ts
export interface MembershipState {
  isActive: boolean;
  type: 'lifetime' | 'monthly' | 'yearly' | null;
  expiresAt: string | null;
  isTrial: boolean;  // 新增：是否处于试用期
}
```

### MembershipService._syncCache

读取 RevenueCat entitlement 的 `periodType` 字段：
- `periodType === 'trial'` → `isTrial = true`
- 否则 → `isTrial = false`

`isActive()` 和 `_isActiveFromCache()` 逻辑不变，试用期内 `isActive === true`。

### useMembership hook

新增一个返回字段：

```ts
export interface UseMembershipReturn {
  // ... 原有字段
  isTrial: boolean  // 是否处于试用期
}
```

试用到期时间复用现有 `expiresAt` 字段，试用期间它就是试用结束时间。`extractState` 函数同步读取 `periodType` 以派生 `isTrial`。

## MembershipScreen

### 非会员状态

- 月度/年度套餐卡片：`planSublabel` 追加"前 14 天免费"
- 永久套餐：无变化
- 底部按钮：
  - 选中月度或年度 → 文案改为"免费试用 14 天"
  - 选中永久 → 文案保持"立即购买"

### 试用中状态（`isTrial === true`）

- ScrollView 顶部插入黄色 banner：`"试用中 · 还剩 X 天到期"`
  - X = `Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)`
- 底部按钮改为"管理订阅"，点击执行：
  ```ts
  Linking.openURL('https://apps.apple.com/account/subscriptions')
  ```

### 正式会员状态

现有逻辑不变。

## SettingsScreen

新增"墨声会员"入口行（列表最上方），SettingsScreen 需接收 `navigation` prop 并调用 `useMembership()`。

| 状态 | 右侧展示 | 颜色 |
|------|---------|------|
| 非会员 | "升级" | accent |
| 试用中 | "试用中 · 还剩 X 天" | 黄色 |
| 正式会员 | "已订阅" | 绿色 |

点击均跳转 MembershipScreen。

## 国际化

新增翻译键（中/英）：

| Key | 中文 | 英文 |
|-----|------|------|
| `membership.freeTrial` | 免费试用 14 天 | Try Free for 14 Days |
| `membership.trialBadge` | 前 14 天免费 | First 14 days free |
| `membership.trialBanner` | 试用中 · 还剩 {days} 天到期 | Trial · {days} days left |
| `membership.trialActive` | 试用中 · 还剩 {days} 天 | Trial · {days} days left |
| `membership.manageSubscription` | 管理订阅 | Manage Subscription |
| `membership.subscribed` | 已订阅 | Subscribed |
| `membership.upgrade` | 升级 | Upgrade |

## 测试

| 文件 | 新增/更新测试 |
|------|-------------|
| `MembershipService.test.ts` | `_syncCache` 传入 `periodType: 'trial'` 时 `isTrial === true`；`'normal'` 时为 `false` |
| `useMembership.test.tsx` | CustomerInfo 更新时 `isTrial` 正确派生 |
| `MembershipScreen.test.tsx` | 非会员时月/年按钮文案为"免费试用 14 天"；试用中时 banner 可见；永久套餐按钮保持"立即购买" |
| `SettingsScreen.test.tsx` | 试用中显示"试用中 · 还剩 X 天"；正式会员显示"已订阅"；非会员显示"升级" |

现有测试中涉及 `MembershipState` mock 的需补上 `isTrial: false`。

## App Store Connect 配置

月度和年度产品需在 App Store Connect 中配置 14 天免费试用 introductory offer，代码无需额外改动即可生效。
