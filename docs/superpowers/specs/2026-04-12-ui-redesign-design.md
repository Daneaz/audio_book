# 墨声 UI 全面重设计 · 设计文档

日期：2026-04-12

## 一、设计目标

对四个核心页面（书架、上传、阅读、设置）进行全面视觉重设计，建立统一的双主题色彩系统，提升品质感与沉浸感。不改变任何功能逻辑，只改视觉层。

---

## 二、色彩系统（Design Tokens）

两套主题共享同一套 token 名，通过 `isDark` 切换值。

### Dark — 沉浸暗夜

| Token | 色值 | 用途 |
|---|---|---|
| `bg` | `#0E0C0A` | 页面背景 |
| `surface` | `#1C1916` | 卡片/面板背景 |
| `surface2` | `#242220` | 次级卡片（设置行） |
| `border` | `#2A2520` | 边框、分隔线 |
| `accent` | `#C4A96A` | 主强调色（标题、激活态、图标） |
| `accentBg` | `#C4A96A18` | 激活背景 |
| `accentBorder` | `#C4A96A50` | 激活边框 |
| `textPrimary` | `#E8E0D0` | 主文字 |
| `textSub` | `#6A5A44` | 次要文字、标签 |
| `navBg` | `#0E0C0A` | 导航栏背景 |
| `bottomBar` | `#0A0806` | 底部控制条背景 |
| `iconBox` | `#2A2520` | 图标背景方块 |
| `deleteBox` | `#2E1F1F` | 删除操作图标背景 |
| `switchOn` | `#C4A96A` | Switch 开启色 |

### Light — 明亮书房

| Token | 色值 | 用途 |
|---|---|---|
| `bg` | `#FAF7F0` | 页面背景 |
| `surface` | `#F3ECE0` | 卡片/面板背景 |
| `surface2` | `#EDE5D5` | 次级卡片 |
| `border` | `#E0D4C0` | 边框、分隔线 |
| `accent` | `#A0621A` | 主强调色 |
| `accentBg` | `#8B5E2015` | 激活背景 |
| `accentBorder` | `#8B5E2040` | 激活边框 |
| `textPrimary` | `#2C1A0E` | 主文字 |
| `textSub` | `#9A7A5A` | 次要文字 |
| `navBg` | `#FAF7F0` | 导航栏背景 |
| `bottomBar` | `#F3ECE0` | 底部控制条背景 |
| `iconBox` | `#E8DCC8` | 图标背景方块 |
| `deleteBox` | `#FAE8E8` | 删除操作图标背景 |
| `switchOn` | `#2C1A0E` | Switch 开启色 |

### 通用

- `deleteRed`: `#D64040`（两套主题通用）
- `wifiGreen`: `#5A9E5A`（两套主题通用）

---

## 三、导航栏（共享）

所有页面导航栏统一样式：
- 背景：`navBg`，底部 `1px border`（颜色：`border`）
- 标题：字体 `Georgia, serif`，`accent` 色，`font-size 15px`，`font-weight 700`
- 返回箭头：`16×16` 左下角 L 形，`accent` 色，`border-width 2px`
- 右侧图标：`22×22` 圆角方块，背景 `iconBox`

---

## 四、书架页（BookshelfScreen）

**保持现有布局**（3 列网格 + FlatList），只改颜色和细节。

### 变更项

1. **页面背景**：改为 `bg`
2. **分组标题**「书架」：`font-size 13px`，`font-weight 700`，`letter-spacing 1px`，`text-transform uppercase`，颜色 `accent`
3. **书籍封面**：圆角保持 `14px`，书脊 `5px`，阴影颜色改用封面主色的深色版（dark 模式加深，light 模式用封面色）
4. **书名/章节数**：`textPrimary` / `textSub`
5. **`···` 按钮**：背景改为带透明度的 `bg`（Dark: `rgba(14,12,10,0.7)`，Light: `rgba(250,247,240,0.85)`），点点颜色改 `accent`
6. **FAB 按钮**：Dark = `accent`（`#C4A96A`），Light = `#2C1A0E`；`+` 图标白色
7. **编辑 Bottom Sheet**（已实现，核心配色保持当前版本，不再重做）

---

## 五、上传页（UploadScreen）

### 变更项

1. **背景**：`bg`
2. **页面标题**：`textPrimary`，`font-size 22px`，`font-weight 800`；副标题 `textSub`
3. **卡片**：背景 `surface`，`border-color: border`，`border-radius 14px`
4. **图标圆圈**：背景 `iconBox`，图标用 `accent` 色
5. **卡片标题/描述**：`textPrimary` / `textSub`
6. **右侧箭头 `>`**：颜色 `border`
7. **WiFi 激活徽章**：背景 Dark `#0E2A10` / Light `#D0EED0`，文字/点 `wifiGreen`
8. **URL 框**：Dark 背景 `#0A0806`，边框 `#1E3A20`，文字 `wifiGreen`；Light 背景 `#EFF8EE`，边框 `#B8DDB5`
9. **停止按钮**：仅文字 `deleteRed`，边框 `deleteRed` 20% 透明

---

## 六、阅读页（ReaderScreen）

### 6.1 底部控制条（默认状态）

4 个等宽按钮，按钮之间竖分隔线（`1px`，颜色 `border`）。

每个按钮：
- 图标区 `26×26` 圆角方块（`border-radius 8px`），背景 `iconBox`
- 图标颜色 `textSub`
- 标签 `font-size 7px`，`font-weight 600`，颜色 `textSub`

| 按钮 | 图标形式 | 激活态变化 |
|---|---|---|
| 字体 | `A` 小 + `A` 大并排 | 无（面板展开替换控制条） |
| 主题 | 月亮/太阳（根据当前主题切换） | 无 |
| 自动 | 三角播放形或停止方块 | 激活时图标变红 |
| 朗读 | 5 根音波柱 | 激活时图标和标签变 `accent`，图标背景变 `accentBg`，边框 `accentBorder`；同时底部加 Mini 播放条 |

控制条背景：`bottomBar`，顶部 `1px border`

### 6.2 排版面板（点「字体」后替换控制条）

面板从下方替换控制条区域，高度自适应内容。

**顶部 handle**：`28×3px`，`border-radius 2px`，背景 `border`，居中

**字号 + 行距**（并排两列）：
- 列背景 `surface`，`border-radius 10px`，`padding 8px 10px`
- 列标签：`font-size 7px`，`font-weight 700`，`letter-spacing 0.5px`，`text-transform uppercase`，颜色 `textSub`
- 步进器：`− 数值 +` 横排，按钮 `22×22` 圆形，背景 `iconBox`，文字 `accent`
- 数值：`font-size 11px`，`font-weight 800`，颜色 `textPrimary`

**字体选择**：
- 标签「字体」同列标签样式
- 4 个芯片横排等宽：黑体 / 楷体 / 宋体 / 马善体
- 芯片：上方显示「汉」字预览（`font-size 11px`，使用对应字体），下方字体名（`font-size 6px`，`font-weight 700`）
- 非选中：背景 `surface`，文字 `textSub`
- 选中：背景 `accentBg`，边框 `1px accentBorder`，文字 `accent`

**完成按钮**：全宽，`border-radius 10px`，背景 `surface`，文字 `accent`，`font-size 9px`，`font-weight 700`

### 6.3 Mini 播放条（朗读激活时叠加在控制条上方）

高度 `46px`，背景 `bottomBar`，顶部 `1px border`，横向 `padding 14px`。

布局左→右：
1. **音波动画**：7 根柱子（`2px` 宽，`border-radius 1px`，颜色 `accent`），高度随播放动态变化（CSS `@keyframes` 错峰 `scaleY`）
2. **进度区**（`flex:1`）：上方「正在朗读」文字（`font-size 7px`，`font-weight 700`，颜色 `accent`），下方进度条（`2px` 高，背景 `border`，填充色 `accent`）
3. **控制按钮**：暂停（两根竖条，颜色 `accent`）+ 停止（`8×8` 圆角方块，颜色 `border`）

**点击整个 Mini 条** → 打开全屏朗读模式

### 6.4 全屏朗读模式（TTS Overlay）

全屏 Modal，`animationType="fade"`，背景 Dark `rgba(8,6,4,0.95)` / Light `rgba(248,244,236,0.97)`。

布局（垂直居中，`padding 20px`）：

1. **返回按钮**（左上角）：`24×24` 圆形，背景 `iconBox`，「←」文字 `accent` 色
2. **音波动画**（居中）：11 根柱子（`3.5px` 宽），高度交错，CSS `@keyframes` 错峰动画，颜色 `accent`，`margin-bottom 16px`
3. **章节标题**：`font-size 8px`，`font-weight 800`，`letter-spacing 1px`，`uppercase`，颜色 `accent`
4. **当前朗读句子**：`font-size 12px`，颜色 `textPrimary`，居中，`padding 0 10px`，`margin-bottom 18px`
5. **进度条**：全宽 `2px`，背景 `border`，填充 `accent`，进度点 `10×10` 圆形 `accent`，`margin-bottom 18px`
6. **三键控制**（横排居中）：上句 / 暂停·播放 / 下句
   - 主键（暂停/播放）：`48×48` 圆形，背景 `accent`（Dark）/ `#2C1A0E`（Light），图标白色
   - 副键（跳句）：`30×30` 圆形，背景 `iconBox`，图标 `accent`
7. **功能芯片**（居中横排）：语速（如 `1.5x`）/ 音色名 / 定时（如 `⏱ 30m`）
   - 非激活：背景 `iconBox`，文字 `textSub`
   - 激活（语速）：背景 `accentBg`，边框 `accentBorder`，文字 `accent`

---

## 七、设置页（SettingsScreen）

整体改为分组卡片样式，移除原来 flat list 风格。

### 分组结构

| 分组 | 内容 |
|---|---|
| 外观 | 语言、主题、字号、行距、字体 |
| 阅读 | 翻页模式、自动翻页速度、常亮屏幕 |
| 朗读 | 语速、音色 |
| 关于 | 版本、OTA |

### 分组标题

`font-size 11px`，`font-weight 700`，`letter-spacing 1.5px`，`text-transform uppercase`，颜色 `accent`，`padding 0 4px 8px`

### 卡片

背景 `surface`，`border-radius 14px`，`overflow hidden`，`border-width StyleSheet.hairlineWidth`，`border-color border`

### 行

`flexDirection row`，`justifyContent space-between`，`alignItems center`，`padding 11px 14px`，行间以 `StyleSheet.hairlineWidth` 分隔线（颜色 `border`）

- 行标签：`font-size 14px`，`font-weight 600`，颜色 `textPrimary`
- 右侧值/控件：颜色 `textSub`

### 控件样式

**分段选择器**（主题/翻页模式/语言）：
- 横排按钮组，每项 `padding 4px 10px`，`border-radius 6px`
- 非选中：背景 `iconBox`，文字 `textSub`
- 选中：背景 `accent`（Dark）/ `#2C1A0E`（Light），文字白色

**步进器**（字号/行距/语速）：
- `− 值 +` 横排，按钮 `28×28` 圆形，背景 `iconBox`，文字 `accent`

**Switch**（常亮屏幕）：
- 开启色 `switchOn`

**可展开行**（字体/音色）：
- 右侧显示当前值（`textSub`）+ 小箭头
- 展开后列表同现有逻辑，但列表项配色更新为新 token

---

## 八、实现约束

- 不修改 `ios/` 或 `android/` 目录
- 不引入新依赖
- 动画只用 React Native `Animated` API（书架/上传/设置无复杂动画需求）
- 音波动画用 `Animated.loop` + `Animated.sequence`，各柱子错峰 `delay`
- 全屏 TTS 用 `Modal`（`transparent`，`animationType="fade"`）
- Mini 播放条作为条件渲染区块插入阅读页 footer 区域
- 字体排版面板替换现有 `isTypographyPanelVisible` 逻辑，保持 state 变量名不变

---

## 九、实现顺序

1. **提取 color tokens**：在 `BookshelfScreen`、`ReaderScreen`、`UploadScreen`、`SettingsScreen` 各自的 `colors/c` useMemo 中更新所有 token 值
2. **BookshelfScreen**：更新 colors → 更新 renderItem 样式 → FAB → 导航栏
3. **UploadScreen**：更新 colors → 卡片样式 → WiFi 激活展开区
4. **ReaderScreen**：
   a. 底部控制条 4 按钮
   b. 排版面板（字号/行距/字体芯片）
   c. Mini 播放条 + 音波动画
   d. 全屏 TTS Modal
5. **SettingsScreen**：重构为分组卡片，更新所有控件样式
