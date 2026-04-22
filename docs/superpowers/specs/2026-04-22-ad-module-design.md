# 广告模块设计文档

**日期**: 2026-04-22  
**状态**: 待实现

---

## 1. 目标

为非会员用户在阅读全屏模式下展示 AdMob Banner 广告，提供"隐藏"入口触发激励视频，完成后隐藏广告 1 小时。同步实现会员状态基础框架，供广告模块判断是否展示广告。

---

## 2. 范围

**包含：**
- AdService：AdMob Banner + 激励视频加载与展示控制
- MembershipService：会员状态 AsyncStorage 读写（不含内购逻辑）
- AdBanner 组件：Banner UI + "隐藏"按钮
- ReaderScreen 集成
- app.json AdMob config plugin 配置

**不包含：**
- 内购支付流程（MembershipService 仅做状态存储占位）
- 自定义离线缓存（依赖 AdMob SDK 自身预加载缓存）

---

## 3. 技术依赖

- `react-native-google-mobile-ads`：AdMob Banner + 激励视频
- 安装后在 `app.json` 添加 config plugin，通过 `expo prebuild` 生成原生代码
- 开发阶段使用 AdMob 官方测试 ID，上线前替换

**测试 ID（Android/iOS 通用）：**
```
App ID (Android):    ca-app-pub-3940256099942544~3347511713
App ID (iOS):        ca-app-pub-3940256099942544~1458002511
Banner Unit ID:      ca-app-pub-3940256099942544/6300978111
激励视频 Unit ID:    ca-app-pub-3940256099942544/5224354917
```

---

## 4. 数据模型

AsyncStorage 新增两个 key：

```typescript
// @audio_book_ad_state
interface AdState {
  bannerHiddenUntil: string | null  // ISO 8601，null 表示不隐藏
}

// @audio_book_membership
interface MembershipState {
  isActive: boolean
  type: 'lifetime' | 'monthly' | 'yearly' | null
  expiresAt: string | null  // ISO 8601，lifetime 时为 null
}
```

---

## 5. 模块设计

### 5.1 MembershipService

```
isActive(): Promise<boolean>
  读取 @audio_book_membership
  type=lifetime → true
  type=monthly|yearly → expiresAt > now → true，否则 false
  未购买 → false

setMembership(type, expiresAt): Promise<void>
  写入 @audio_book_membership

clearMembership(): Promise<void>
  清除会员状态（供测试/退款场景）
```

### 5.2 AdService

```
initialize(): Promise<void>
  MembershipService.isActive() → true → 跳过，不加载任何广告
  否则 → 预加载 Banner 和激励视频

shouldShowBanner(): Promise<boolean>
  MembershipService.isActive() → true → false
  读取 bannerHiddenUntil → > now → false
  否则 → true

loadRewardedAd(): Promise<void>
  加载激励视频，预加载以减少延迟

showRewardedAd(): Promise<void>
  播放激励视频
  播放完毕（onRewarded 回调）→ 写入 bannerHiddenUntil = now + 3600s
  播放失败 → 不隐藏 Banner（静默失败）

getBannerHiddenUntil(): Promise<Date | null>
```

### 5.3 AdBanner 组件

**Props：**
```typescript
interface AdBannerProps {
  visible: boolean  // 由 ReaderScreen 控制（全屏模式 + shouldShowBanner）
}
```

**UI 规格：**
- 位置：`position: absolute, bottom: 0, left: 0, right: 0`
- 高度：28pt（约为标准 TabBar 高度的 50%）
- 背景：半透明黑色 `rgba(0,0,0,0.6)`
- Banner 广告居中展示
- 右上角"隐藏"文字按钮（点击后触发激励视频，按钮在视频加载期间禁用）

**状态机：**
```
idle → 点击"隐藏" → loading（禁用按钮）→ 播放激励视频 → 完成 → 隐藏 Banner
                                          → 失败/取消 → 回到 idle
```

### 5.4 ReaderScreen 集成

ReaderScreen 已有 `menuVisible` 状态控制菜单显示。

集成逻辑：
```typescript
const [showAd, setShowAd] = useState(false)

useEffect(() => {
  AdService.shouldShowBanner().then(setShowAd)
}, [])

// 全屏模式（菜单隐藏）且 showAd 为 true 时显示 AdBanner
<AdBanner visible={!menuVisible && showAd} />
```

激励视频完成后，AdBanner 通过 `onHidden` 回调通知 ReaderScreen 更新 `showAd = false`。

---

## 6. 文件变更清单

| 操作 | 文件 |
|------|------|
| 新增 | `src/services/AdService.ts` |
| 新增 | `src/services/MembershipService.ts` |
| 新增 | `src/components/AdBanner.tsx` |
| 修改 | `src/screens/ReaderScreen.tsx`（集成 AdBanner） |
| 修改 | `app.json`（AdMob config plugin） |

---

## 7. 边界与约定

- 广告仅在 ReaderScreen 展示，其他页面不展示
- 激励视频失败/用户主动关闭不隐藏广告（必须播放完毕才生效）
- `MembershipService` 此阶段不做收据验证，仅本地状态存储
- ios/android 目录不直接编辑，原生配置通过 `expo prebuild` 生成
