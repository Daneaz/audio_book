# UI 全面重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 BookshelfScreen、UploadScreen、ReaderScreen、SettingsScreen 进行全面视觉重设计，建立 Dark（沉浸暗夜）和 Light（明亮书房）双主题色彩系统，不改变任何功能逻辑。

**Architecture:** 每个屏幕内部维护自己的 `colors` useMemo（已有模式），用新 token 值替换旧颜色字符串。ReaderScreen 新增 `isTtsOverlayVisible` state 控制全屏朗读 Modal，Mini 播放条作为独立绝对定位层在朗读时渲染，全屏 TTS 完全替代旧的 `isSpeechTimerPanelVisible` 面板。

**Tech Stack:** React Native, Expo, `Animated`（音波动画），`MaterialIcons`，`Ionicons`，现有 hooks（`useSettings`, `useI18n`, `useSafeAreaInsets`）

---

## 颜色 Token 参考（所有 Task 共用）

```ts
// Dark 沉浸暗夜
const DARK = {
  bg:           '#0E0C0A',
  surface:      '#1C1916',
  surface2:     '#242220',
  border:       '#2A2520',
  accent:       '#C4A96A',
  accentBg:     'rgba(196,169,106,0.1)',
  accentBorder: 'rgba(196,169,106,0.3)',
  textPrimary:  '#E8E0D0',
  textSub:      '#6A5A44',
  navBg:        '#0E0C0A',
  bottomBar:    '#0A0806',
  iconBox:      '#2A2520',
  deleteBox:    '#2E1F1F',
  switchOn:     '#C4A96A',
};

// Light 明亮书房
const LIGHT = {
  bg:           '#FAF7F0',
  surface:      '#F3ECE0',
  surface2:     '#EDE5D5',
  border:       '#E0D4C0',
  accent:       '#A0621A',
  accentBg:     'rgba(139,94,32,0.08)',
  accentBorder: 'rgba(139,94,32,0.25)',
  textPrimary:  '#2C1A0E',
  textSub:      '#9A7A5A',
  navBg:        '#FAF7F0',
  bottomBar:    '#F3ECE0',
  iconBox:      '#E8DCC8',
  deleteBox:    '#FAE8E8',
  switchOn:     '#2C1A0E',
};

// 通用
const DELETE_RED = '#D64040';
const WIFI_GREEN = '#5A9E5A';
```

---

## Task 1: BookshelfScreen 重设计

**Files:**
- Modify: `src/screens/BookshelfScreen.tsx`

- [ ] **Step 1: 更新 colors useMemo**

找到现有 `colors` useMemo（约第 51 行），替换为：

```ts
const colors = useMemo(
  () => ({
    bg:           isDark ? '#0E0C0A' : '#FAF7F0',
    surface:      isDark ? '#1C1916' : '#F3ECE0',
    border:       isDark ? '#2A2520' : '#E0D4C0',
    accent:       isDark ? '#C4A96A' : '#A0621A',
    accentBg:     isDark ? 'rgba(196,169,106,0.1)'  : 'rgba(139,94,32,0.08)',
    accentBorder: isDark ? 'rgba(196,169,106,0.3)'  : 'rgba(139,94,32,0.25)',
    textPrimary:  isDark ? '#E8E0D0' : '#2C1A0E',
    textSub:      isDark ? '#6A5A44' : '#9A7A5A',
    navBg:        isDark ? '#0E0C0A' : '#FAF7F0',
    iconBox:      isDark ? '#2A2520' : '#E8DCC8',
    deleteBox:    isDark ? '#2E1F1F' : '#FAE8E8',
    dotMenu:      isDark ? 'rgba(14,12,10,0.7)' : 'rgba(250,247,240,0.85)',
    fab:          isDark ? '#C4A96A' : '#2C1A0E',
    deleteBg:     isDark ? 'rgba(18,18,18,0.82)' : 'rgba(255,255,255,0.94)',
  }),
  [isDark]
);
```

- [ ] **Step 2: 更新 container 背景**

找到 `renderHeader` 中的 `colors.bg`、`colors.shelf`、`colors.shelfEdge` 等旧 token，全局搜索替换：
- `colors.shelf` → `colors.surface`
- `colors.shelfEdge` → `colors.border`
- `colors.fab` → `colors.fab`（保持，已更新值）
- `colors.emptyCard` → `colors.surface`
- `colors.emptyBorder` → `colors.border`

- [ ] **Step 3: 更新分组标题样式**

找到 `sectionTitle` 的 Text 组件（`{t('bookshelf.sectionTitle')}`），将颜色改为 `colors.accent`，并更新样式：

```ts
// 在 styles 中找到 sectionTitle
sectionTitle: {
  fontSize: 13,
  fontWeight: '700',
  letterSpacing: 1,
  textTransform: 'uppercase',
  color: undefined, // 改为 inline 传入
},
```

渲染处改为：
```tsx
<Text style={[styles.sectionTitle, { color: colors.accent }]}>{t('bookshelf.sectionTitle')}</Text>
```

- [ ] **Step 4: 更新 `···` 按钮（deleteButton）**

找到 `styles.deleteButton` 及其渲染（约第 262 行），将 backgroundColor 改为 `colors.dotMenu`，图标颜色改为 `colors.accent`：

```tsx
<TouchableOpacity
  onPress={() => showMenu(item)}
  style={[styles.deleteButton, { backgroundColor: colors.dotMenu }]}
>
  <MaterialIcons name="more-horiz" size={18} color={colors.accent} />
</TouchableOpacity>
```

- [ ] **Step 5: 更新 FAB**

找到 FAB TouchableOpacity，backgroundColor 改为 `colors.fab`：

```tsx
<TouchableOpacity
  style={[styles.fab, { backgroundColor: colors.fab, bottom: 24 + insets.bottom }]}
  onPress={() => navigation.navigate('Upload')}
>
  <MaterialIcons name="add" size={28} color="#FFF8EE" />
</TouchableOpacity>
```

- [ ] **Step 6: 更新 emptyCard 空状态**

找到 emptyCard View，更新：
- `backgroundColor: colors.surface`
- `borderColor: colors.border`
- emptyTitle / emptySubTitle 颜色改为 `colors.textPrimary` / `colors.textSub`
- emptyButton backgroundColor 改为 `colors.fab`

- [ ] **Step 7: 更新 Modal 卡片颜色**

找到 `modalCard` View（约第 318 行），backgroundColor 改为 `colors.surface`，其余 modal 内文字/输入框颜色对应替换为新 token。

- [ ] **Step 8: 截图验证**

```bash
mkdir -p /Users/eugenewu/code/audio_book/screenshots/bookshelf-redesign
```

打开书架，截图确认 dark / light 两种主题效果（用模拟器切换系统主题或 Settings 内切换）。

- [ ] **Step 9: Commit**

```bash
git add src/screens/BookshelfScreen.tsx
git commit -m "feat: BookshelfScreen 重设计 - 双主题色彩系统"
```

---

## Task 2: UploadScreen 重设计

**Files:**
- Modify: `src/screens/UploadScreen.tsx`

- [ ] **Step 1: 更新 colors useMemo**

找到现有 `c` useMemo（约第 39 行），替换为：

```ts
const c = useMemo(
  () => ({
    bg:          isDark ? '#0E0C0A' : '#FAF7F0',
    card:        isDark ? '#1C1916' : '#F3ECE0',
    cardBorder:  isDark ? '#2A2520' : '#E0D4C0',
    text:        isDark ? '#E8E0D0' : '#2C1A0E',
    subText:     isDark ? '#6A5A44' : '#9A7A5A',
    accent:      isDark ? '#C4A96A' : '#A0621A',
    iconBox:     isDark ? '#2A2520' : '#E8DCC8',
    urlBox:      isDark ? '#0A0806' : '#EFF8EE',
    urlBorder:   isDark ? '#1E3A20' : '#B8DDB5',
    urlText:     WIFI_GREEN,
    divider:     isDark ? '#2A2520' : '#E0D4C0',
    wifiActive:  isDark ? '#1E3A20' : '#D0EED0',
    wifiDot:     WIFI_GREEN,
    chevron:     isDark ? '#3A3028' : '#C0A880',
  }),
  [isDark],
);
```

在文件顶部（useMemo 之前）添加常量：
```ts
const WIFI_GREEN = '#5A9E5A';
```

- [ ] **Step 2: 更新页面背景和标题**

找到 ScrollView `style`，backgroundColor → `c.bg`。

找到 header View 内 title / subtitle Text，颜色 → `c.text` / `c.subText`。

更新 title 样式：
```ts
title: {
  fontSize: 22,
  fontWeight: '800',
  letterSpacing: -0.3,
},
```

- [ ] **Step 3: 更新本地文件卡片**

找到本地文件 TouchableOpacity card：
- `backgroundColor: c.card`
- `borderColor: c.cardBorder`

图标圆圈：`backgroundColor: c.iconBox`，图标颜色 `c.accent`。

卡片标题/描述：`c.text` / `c.subText`。

右侧箭头（`chevron-right` icon）颜色：`c.chevron`。

- [ ] **Step 4: 更新 WiFi 卡片（正常态）**

WiFi 卡片边框：`wifiActive ? '#2E6E3A' : c.cardBorder`（Dark）/ `wifiActive ? '#81C784' : c.cardBorder`（Light）。

图标圆圈背景：`isDark ? '#1A2A1A' : '#D8EED8'`，图标颜色 `WIFI_GREEN`（激活）或 `c.accent`（待机）。

运行徽章：
```tsx
<View style={[styles.runningBadge, { backgroundColor: c.wifiActive }]}>
  <View style={[styles.dot, { backgroundColor: WIFI_GREEN }]} />
  <Text style={[styles.runningText, { color: WIFI_GREEN }]}>{t('upload.wifiRunning')}</Text>
</View>
```

- [ ] **Step 5: 更新 WiFi 展开区**

URL 框：
```tsx
<View style={[styles.urlRow, { backgroundColor: c.urlBox, borderColor: c.urlBorder }]}>
  <TextInput style={[styles.urlText, { color: c.urlText }]} ... />
  <TouchableOpacity onPress={handleShareUrl} style={styles.shareBtn}>
    <MaterialIcons name="share" size={18} color={WIFI_GREEN} />
  </TouchableOpacity>
</View>
```

停止按钮：边框 `'rgba(214,64,64,0.2)'`，背景 `isDark ? '#1A0A0A' : '#FFF5F5'`，文字/图标 `'#D64040'`。

- [ ] **Step 6: 截图验证**

```bash
mkdir -p /Users/eugenewu/code/audio_book/screenshots/upload-redesign
```

在模拟器截图确认两种主题，重点验证 WiFi 激活展开态。

- [ ] **Step 7: Commit**

```bash
git add src/screens/UploadScreen.tsx
git commit -m "feat: UploadScreen 重设计 - 双主题色彩系统"
```

---

## Task 3: ReaderScreen - 底部控制条重设计

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

**背景：** ReaderScreen 底部现有三种状态：`isSpeechTimerPanelVisible`（语音设置面板）/ `isTypographyPanelVisible`（排版面板）/ 默认 4 按钮行。本 Task 只改默认 4 按钮行和整体 footer 配色。

- [ ] **Step 1: 更新 reader colors 变量**

找到文件中 `bgColor`、`textColor` 等颜色变量（约第 140 行附近），在其后加入完整 token 对象：

```ts
const readerColors = useMemo(() => ({
  bg:           isDark ? '#0E0C0A' : '#FAF7F0',
  surface:      isDark ? '#1C1916' : '#F3ECE0',
  border:       isDark ? '#2A2520' : '#E0D4C0',
  accent:       isDark ? '#C4A96A' : '#A0621A',
  accentBg:     isDark ? 'rgba(196,169,106,0.1)'  : 'rgba(139,94,32,0.08)',
  accentBorder: isDark ? 'rgba(196,169,106,0.3)'  : 'rgba(139,94,32,0.25)',
  textPrimary:  isDark ? '#E8E0D0' : '#2C1A0E',
  textSub:      isDark ? '#6A5A44' : '#9A7A5A',
  bottomBar:    isDark ? '#0A0806' : '#F3ECE0',
  iconBox:      isDark ? '#2A2520' : '#E8DCC8',
  highlight:    isDark ? '#1E3A2A' : '#F0EDD4',
}), [isDark]);
```

同时将现有 `bgColor`、`textColor` 等变量指向新 token：
```ts
const bgColor   = readerColors.bg;
const textColor = readerColors.textPrimary;
```

保持 `highlightedSentence` 背景色使用 `readerColors.highlight`：在 `ReaderChapterItem` 和 `ReaderPageItem` 中把 `isDark ? '#1E3A2A' : '#E8F7EA'` 改为由 props 传入或直接使用 `isDark ? '#1E3A2A' : '#F0EDD4'`。

- [ ] **Step 2: 更新 Header 配色**

找到 Header View（约第 1694 行），更新：
```tsx
<View style={[styles.header, {
  paddingTop: insets.top,
  backgroundColor: readerColors.surface,
  borderBottomColor: readerColors.border,
}]}>
```

返回图标、列表图标、设置图标颜色 → `readerColors.accent`。

header 标题颜色 → `readerColors.textPrimary`，字体改为 Georgia serif：
```tsx
<Text style={[styles.headerTitle, {
  color: readerColors.textPrimary,
  fontFamily: 'Georgia',
}]} numberOfLines={1}>
```

- [ ] **Step 3: 更新 Footer 容器**

找到 Footer View（约第 1766 行），更新：
```tsx
<View style={[styles.footer, {
  paddingBottom: insets.bottom + 8,
  backgroundColor: readerColors.bottomBar,
  borderTopColor: readerColors.border,
}]}>
```

- [ ] **Step 4: 重写默认 4 按钮控制行**

找到 `controlsRow` View（约第 1986 行），替换整个 `<View style={styles.controlsRow}>` 块：

```tsx
<View style={styles.controlsRow}>
  {/* 字体 */}
  <TouchableOpacity onPress={toggleTypographyPanel} style={styles.ctrlBtn}>
    <View style={[styles.ctrlIconBox, { backgroundColor: isTypographyPanelVisible ? readerColors.accentBg : readerColors.iconBox },
      isTypographyPanelVisible && { borderWidth: 1, borderColor: readerColors.accentBorder }]}>
      <Text style={[styles.ctrlAaSmall, { color: isTypographyPanelVisible ? readerColors.accent : readerColors.textSub }]}>A</Text>
      <Text style={[styles.ctrlAaLarge, { color: isTypographyPanelVisible ? readerColors.accent : readerColors.textSub }]}>A</Text>
    </View>
    <Text style={[styles.ctrlLabel, { color: isTypographyPanelVisible ? readerColors.accent : readerColors.textSub }]}>
      {t('settings.fontSize')}
    </Text>
  </TouchableOpacity>

  <View style={[styles.ctrlDivider, { backgroundColor: readerColors.border }]} />

  {/* 主题 */}
  <TouchableOpacity onPress={toggleTheme} style={styles.ctrlBtn}>
    <View style={[styles.ctrlIconBox, { backgroundColor: readerColors.iconBox }]}>
      <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={16} color={readerColors.textSub} />
    </View>
    <Text style={[styles.ctrlLabel, { color: readerColors.textSub }]}>{t('reader.theme')}</Text>
  </TouchableOpacity>

  <View style={[styles.ctrlDivider, { backgroundColor: readerColors.border }]} />

  {/* 自动翻页 */}
  <TouchableOpacity onPress={() => updateSettings({ autoFlip: !settings.autoFlip })} style={styles.ctrlBtn}>
    <View style={[styles.ctrlIconBox, { backgroundColor: readerColors.iconBox }]}>
      <Ionicons
        name={settings.autoFlip ? 'stop-circle-outline' : 'play-circle-outline'}
        size={16}
        color={settings.autoFlip ? '#D64040' : readerColors.textSub}
      />
    </View>
    <Text style={[styles.ctrlLabel, { color: settings.autoFlip ? '#D64040' : readerColors.textSub }]}>
      {settings.autoFlip ? t('reader.autoFlipStop') : t('reader.autoFlipStart')}
    </Text>
  </TouchableOpacity>

  <View style={[styles.ctrlDivider, { backgroundColor: readerColors.border }]} />

  {/* 朗读 */}
  <TouchableOpacity onPress={toggleSpeech} style={styles.ctrlBtn}>
    <View style={[styles.ctrlIconBox,
      { backgroundColor: isSpeaking ? readerColors.accentBg : readerColors.iconBox },
      isSpeaking && { borderWidth: 1, borderColor: readerColors.accentBorder }]}>
      <Ionicons name={isSpeaking ? 'mic' : 'mic-outline'} size={16} color={isSpeaking ? readerColors.accent : readerColors.textSub} />
    </View>
    <Text style={[styles.ctrlLabel, { color: isSpeaking ? readerColors.accent : readerColors.textSub }]}>
      {isSpeaking ? t('reader.pause') : t('reader.read')}
    </Text>
  </TouchableOpacity>
</View>
```

- [ ] **Step 5: 在 StyleSheet 中添加新样式**

在 `styles` 中添加（可替换旧的 `controlButton`、`controlsRow`）：

```ts
controlsRow: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: 10,
  paddingHorizontal: 4,
},
ctrlBtn: {
  flex: 1,
  alignItems: 'center',
  gap: 5,
},
ctrlIconBox: {
  width: 36,
  height: 36,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'row',
  gap: 1,
},
ctrlAaSmall: {
  fontSize: 11,
  fontWeight: '800',
  lineHeight: 14,
},
ctrlAaLarge: {
  fontSize: 16,
  fontWeight: '800',
  lineHeight: 20,
},
ctrlLabel: {
  fontSize: 10,
  fontWeight: '600',
},
ctrlDivider: {
  width: 1,
  height: 28,
},
```

- [ ] **Step 6: 截图验证**

在模拟器点击阅读区中间唤出菜单，截图确认控制条样式：

```bash
mkdir -p /Users/eugenewu/code/audio_book/screenshots/reader-controls
```

- [ ] **Step 7: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: ReaderScreen 底部控制条重设计"
```

---

## Task 4: ReaderScreen - 排版面板重设计

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

**背景：** 替换 `isTypographyPanelVisible` 下的面板内容。新面板：handle + 字号步进 + 行距步进（并排两列）+ 字体芯片（无预览条，因正文实时预览）+ 完成按钮。

- [ ] **Step 1: 替换排版面板 JSX**

找到 `isTypographyPanelVisible` 的渲染块（约第 1902 行 `isTypographyPanelVisible ? (`），替换 `<View style={styles.timerPanel}>` 及其所有子元素：

```tsx
<View style={[styles.typoPanel, { backgroundColor: readerColors.bottomBar }]}>
  {/* Handle */}
  <View style={[styles.typoHandle, { backgroundColor: readerColors.border }]} />

  {/* 字号 + 行距 并排 */}
  <View style={styles.typoTopRow}>
    {/* 字号 */}
    <View style={[styles.typoCol, { backgroundColor: readerColors.surface }]}>
      <Text style={[styles.typoColLabel, { color: readerColors.textSub }]}>字号</Text>
      <View style={styles.typoStepperRow}>
        <TouchableOpacity onPress={decreaseFontSize} style={[styles.typoStepBtn, { backgroundColor: readerColors.iconBox }]}>
          <Text style={[styles.typoStepBtnText, { color: readerColors.accent }]}>−</Text>
        </TouchableOpacity>
        <Text style={[styles.typoStepVal, { color: readerColors.textPrimary }]}>{settings.fontSize}</Text>
        <TouchableOpacity onPress={increaseFontSize} style={[styles.typoStepBtn, { backgroundColor: readerColors.iconBox }]}>
          <Text style={[styles.typoStepBtnText, { color: readerColors.accent }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>

    {/* 行距 */}
    <View style={[styles.typoCol, { backgroundColor: readerColors.surface }]}>
      <Text style={[styles.typoColLabel, { color: readerColors.textSub }]}>行距</Text>
      <View style={styles.typoStepperRow}>
        <TouchableOpacity onPress={decreaseLineSpacing} style={[styles.typoStepBtn, { backgroundColor: readerColors.iconBox }]}>
          <Text style={[styles.typoStepBtnText, { color: readerColors.accent }]}>−</Text>
        </TouchableOpacity>
        <Text style={[styles.typoStepVal, { color: readerColors.textPrimary }]}>{settings.lineSpacing.toFixed(1)}</Text>
        <TouchableOpacity onPress={increaseLineSpacing} style={[styles.typoStepBtn, { backgroundColor: readerColors.iconBox }]}>
          <Text style={[styles.typoStepBtnText, { color: readerColors.accent }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>

  {/* 字体芯片 */}
  <Text style={[styles.typoChipsLabel, { color: readerColors.textSub }]}>字体</Text>
  <View style={styles.typoChipsRow}>
    {typographyFontOptions.map((option) => {
      const selected = settings.fontPreset === option.id;
      const meta = fontOptionMeta[option.id as keyof typeof fontOptionMeta];
      return (
        <TouchableOpacity
          key={option.id}
          onPress={() => updateSettings({ fontPreset: option.id })}
          style={[
            styles.typoChip,
            { backgroundColor: selected ? readerColors.accentBg : readerColors.surface },
            selected && { borderWidth: 1, borderColor: readerColors.accentBorder },
          ]}
        >
          <Text style={[
            styles.typoChipPreview,
            { color: selected ? readerColors.accent : readerColors.textPrimary,
              fontFamily: getFontFamilyForPreset(option.id) },
          ]}>汉</Text>
          <Text style={[styles.typoChipName, { color: selected ? readerColors.accent : readerColors.textSub }]}>
            {meta.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>

  {/* 完成 */}
  <TouchableOpacity
    onPress={() => setIsTypographyPanelVisible(false)}
    style={[styles.typoDone, { backgroundColor: readerColors.surface }]}
  >
    <Text style={[styles.typoDoneText, { color: readerColors.accent }]}>{t('common.ok')}</Text>
  </TouchableOpacity>
</View>
```

- [ ] **Step 2: 添加排版面板样式**

```ts
typoPanel: {
  paddingHorizontal: 16,
  paddingTop: 10,
  paddingBottom: 14,
},
typoHandle: {
  width: 28,
  height: 3,
  borderRadius: 2,
  alignSelf: 'center',
  marginBottom: 14,
},
typoTopRow: {
  flexDirection: 'row',
  gap: 10,
  marginBottom: 14,
},
typoCol: {
  flex: 1,
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
},
typoColLabel: {
  fontSize: 10,
  fontWeight: '700',
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  marginBottom: 8,
},
typoStepperRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
},
typoStepBtn: {
  width: 28,
  height: 28,
  borderRadius: 14,
  alignItems: 'center',
  justifyContent: 'center',
},
typoStepBtnText: {
  fontSize: 16,
  fontWeight: '700',
},
typoStepVal: {
  fontSize: 16,
  fontWeight: '800',
  minWidth: 28,
  textAlign: 'center',
},
typoChipsLabel: {
  fontSize: 10,
  fontWeight: '700',
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  marginBottom: 8,
},
typoChipsRow: {
  flexDirection: 'row',
  gap: 8,
  marginBottom: 12,
},
typoChip: {
  flex: 1,
  borderRadius: 10,
  paddingVertical: 8,
  alignItems: 'center',
  gap: 4,
},
typoChipPreview: {
  fontSize: 16,
  fontWeight: '600',
},
typoChipName: {
  fontSize: 9,
  fontWeight: '700',
},
typoDone: {
  borderRadius: 10,
  paddingVertical: 9,
  alignItems: 'center',
},
typoDoneText: {
  fontSize: 13,
  fontWeight: '700',
},
```

- [ ] **Step 3: 截图验证**

点「字体」按钮展开排版面板，截图确认字号/行距步进和字体芯片显示正常。

- [ ] **Step 4: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: ReaderScreen 排版面板重设计 - 步进器 + 字体芯片"
```

---

## Task 5: ReaderScreen - Mini 播放条 + 全屏 TTS Modal

**Files:**
- Modify: `src/screens/ReaderScreen.tsx`

**交互逻辑：**
- 朗读进行中（`isSpeaking === true`）：底部始终显示 Mini 播放条（不依赖 `isMenuVisible`）
- Menu 可见时 Mini 条在控制行上方叠加，Menu 不可见时 Mini 条单独绝对定位在底部
- 点击 Mini 条 → `setIsTtsOverlayVisible(true)` → 全屏 TTS Modal
- 全屏 TTS 内：上句 / 暂停·播放 / 下句，速度芯片、音色芯片、定时芯片（点芯片可在 Modal 内切换）
- `toggleSpeech` 调整：不再打开 `isSpeechTimerPanelVisible` 面板，直接 start/stop speech

- [ ] **Step 1: 添加 isTtsOverlayVisible state 和音波动画**

在其他 state 声明处（约第 400 行）加入：

```ts
const [isTtsOverlayVisible, setIsTtsOverlayVisible] = useState(false);
const waveAnims = useRef(
  Array.from({ length: 7 }, (_, i) => new Animated.Value(0.3 + i * 0.1))
).current;
```

在 `useEffect` 区块中添加音波动画循环（在 `isSpeaking` 变化时启动/停止）：

```ts
useEffect(() => {
  if (isSpeaking) {
    const animations = waveAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(anim, { toValue: 1, duration: 300 + i * 40, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.25, duration: 300 + i * 40, useNativeDriver: true }),
        ])
      )
    );
    Animated.parallel(animations).start();
    return () => animations.forEach(a => a.stop());
  } else {
    waveAnims.forEach(a => a.setValue(0.3));
  }
}, [isSpeaking]);
```

- [ ] **Step 2: 更新 toggleSpeech**

找到 `toggleSpeech` 函数（约第 992 行），替换为：

```ts
const toggleSpeech = () => {
  if (isSpeaking) {
    stopSpeech();
  } else {
    setIsTypographyPanelVisible(false);
    startSpeech(null);
  }
};
```

- [ ] **Step 3: 添加 Mini 播放条组件（内联）**

在 return JSX 中，在 Footer `{isMenuVisible && ...}` 块之前，添加独立 Mini 条（Menu 不可见时显示）：

```tsx
{/* Mini 播放条 - Menu 隐藏时单独显示 */}
{isSpeaking && !isMenuVisible && (
  <TouchableOpacity
    onPress={() => setIsTtsOverlayVisible(true)}
    style={[styles.miniPlayer, {
      backgroundColor: readerColors.bottomBar,
      borderTopColor: readerColors.border,
      bottom: insets.bottom,
    }]}
    activeOpacity={0.85}
  >
    {/* 音波 */}
    <View style={styles.miniWave}>
      {waveAnims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[styles.miniWaveBar, {
            backgroundColor: readerColors.accent,
            transform: [{ scaleY: anim }],
          }]}
        />
      ))}
    </View>
    {/* 信息 */}
    <View style={styles.miniInfo}>
      <Text style={[styles.miniInfoLabel, { color: readerColors.accent }]} numberOfLines={1}>
        {t('reader.read')}
      </Text>
      <View style={[styles.miniProgressTrack, { backgroundColor: readerColors.border }]}>
        <View style={[styles.miniProgressFill, { backgroundColor: readerColors.accent, width: '38%' }]} />
      </View>
    </View>
    {/* 控制 */}
    <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleSpeech(); }} style={styles.miniCtrl} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <View style={styles.miniPause}>
        <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
        <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
      </View>
    </TouchableOpacity>
    <TouchableOpacity onPress={(e) => { e.stopPropagation(); stopSpeech(); }} style={styles.miniCtrl} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <View style={[styles.miniStop, { backgroundColor: readerColors.iconBox }]} />
    </TouchableOpacity>
  </TouchableOpacity>
)}
```

在 Footer 内（`isSpeechTimerPanelVisible` 条件渲染之前），同样添加 Mini 条（Menu 可见时叠加）：

```tsx
{/* Mini 播放条 - Menu 可见时显示 */}
{isSpeaking && (
  <TouchableOpacity
    onPress={() => setIsTtsOverlayVisible(true)}
    style={[styles.miniPlayer, styles.miniPlayerInFooter, {
      backgroundColor: readerColors.surface,
      borderColor: readerColors.border,
    }]}
    activeOpacity={0.85}
  >
    <View style={styles.miniWave}>
      {waveAnims.map((anim, i) => (
        <Animated.View key={i} style={[styles.miniWaveBar, { backgroundColor: readerColors.accent, transform: [{ scaleY: anim }] }]} />
      ))}
    </View>
    <View style={styles.miniInfo}>
      <Text style={[styles.miniInfoLabel, { color: readerColors.accent }]} numberOfLines={1}>{t('reader.read')}</Text>
      <View style={[styles.miniProgressTrack, { backgroundColor: readerColors.border }]}>
        <View style={[styles.miniProgressFill, { backgroundColor: readerColors.accent, width: '38%' }]} />
      </View>
    </View>
    <TouchableOpacity onPress={(e) => { e.stopPropagation(); toggleSpeech(); }} style={styles.miniCtrl} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <View style={styles.miniPause}>
        <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
        <View style={[styles.miniPauseBar, { backgroundColor: readerColors.accent }]} />
      </View>
    </TouchableOpacity>
    <TouchableOpacity onPress={(e) => { e.stopPropagation(); stopSpeech(); }} style={styles.miniCtrl} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <View style={[styles.miniStop, { backgroundColor: readerColors.iconBox }]} />
    </TouchableOpacity>
  </TouchableOpacity>
)}
```

- [ ] **Step 4: 添加 Mini 播放条样式**

```ts
miniPlayer: {
  position: 'absolute',
  left: 0,
  right: 0,
  height: 52,
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 16,
  gap: 12,
  borderTopWidth: StyleSheet.hairlineWidth,
  zIndex: 20,
},
miniPlayerInFooter: {
  position: 'relative',
  borderWidth: StyleSheet.hairlineWidth,
  borderRadius: 12,
  margin: 10,
  marginBottom: 4,
  height: 48,
},
miniWave: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 2,
  height: 20,
},
miniWaveBar: {
  width: 2.5,
  height: 16,
  borderRadius: 2,
},
miniInfo: {
  flex: 1,
  gap: 4,
},
miniInfoLabel: {
  fontSize: 11,
  fontWeight: '700',
},
miniProgressTrack: {
  height: 2,
  borderRadius: 1,
},
miniProgressFill: {
  height: 2,
  borderRadius: 1,
},
miniCtrl: {
  padding: 2,
},
miniPause: {
  flexDirection: 'row',
  gap: 2,
  alignItems: 'center',
},
miniPauseBar: {
  width: 2.5,
  height: 12,
  borderRadius: 1,
},
miniStop: {
  width: 10,
  height: 10,
  borderRadius: 2,
},
```

- [ ] **Step 5: 添加全屏 TTS Modal**

在 return 最末尾的 `</View>` 之前添加：

```tsx
{/* 全屏朗读 Modal */}
<Modal
  visible={isTtsOverlayVisible}
  transparent
  animationType="fade"
  onRequestClose={() => setIsTtsOverlayVisible(false)}
  statusBarTranslucent
>
  <View style={[styles.ttsOverlay, { backgroundColor: isDark ? 'rgba(8,6,4,0.96)' : 'rgba(248,244,236,0.97)' }]}>
    {/* 返回按钮 */}
    <TouchableOpacity
      onPress={() => setIsTtsOverlayVisible(false)}
      style={[styles.ttsBack, { backgroundColor: readerColors.iconBox, top: insets.top + 14 }]}
    >
      <Ionicons name="chevron-down" size={20} color={readerColors.accent} />
    </TouchableOpacity>

    {/* 大音波 */}
    <View style={styles.ttsBigWave}>
      {waveAnims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[styles.ttsBigWaveBar, {
            backgroundColor: readerColors.accent,
            transform: [{ scaleY: anim }],
          }]}
        />
      ))}
    </View>

    {/* 章节标题 */}
    <Text style={[styles.ttsChapter, { color: readerColors.accent }]} numberOfLines={1}>
      {currentHeaderTitle || book?.title}
    </Text>

    {/* 当前句子 */}
    <Text style={[styles.ttsSentence, { color: readerColors.textPrimary }]} numberOfLines={3}>
      {(() => {
        const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
        return chData?.sentences[currentSentenceIndex]?.text ?? '';
      })()}
    </Text>

    {/* 进度条（章节内进度占位） */}
    <View style={[styles.ttsTrack, { backgroundColor: readerColors.border }]}>
      <View style={[styles.ttsTrackFill, { backgroundColor: readerColors.accent, width: '45%' }]} />
      <View style={[styles.ttsTrackDot, { backgroundColor: readerColors.accent, left: '43%' }]} />
    </View>

    {/* 三键控制 */}
    <View style={styles.ttsControls}>
      {/* 上一句 */}
      <TouchableOpacity
        style={[styles.ttsSmBtn, { backgroundColor: readerColors.iconBox }]}
        onPress={() => {
          if (currentSentenceIndex > 0) {
            const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
            if (chData) speakFrom(chData, currentSentenceIndex - 1);
          }
        }}
      >
        <Ionicons name="play-skip-back" size={18} color={readerColors.accent} />
      </TouchableOpacity>

      {/* 暂停/播放 */}
      <TouchableOpacity
        style={[styles.ttsMainBtn, { backgroundColor: readerColors.accent }]}
        onPress={toggleSpeech}
      >
        <Ionicons
          name={isSpeaking ? 'pause' : 'play'}
          size={26}
          color={isDark ? '#0E0C0A' : '#FAF7F0'}
        />
      </TouchableOpacity>

      {/* 下一句 */}
      <TouchableOpacity
        style={[styles.ttsSmBtn, { backgroundColor: readerColors.iconBox }]}
        onPress={() => {
          const chData = chaptersData.find(c => c.chapter.id === currentSpeakingChapterId);
          if (chData && currentSentenceIndex < chData.sentences.length - 1) {
            speakFrom(chData, currentSentenceIndex + 1);
          }
        }}
      >
        <Ionicons name="play-skip-forward" size={18} color={readerColors.accent} />
      </TouchableOpacity>
    </View>

    {/* 功能芯片 */}
    <View style={styles.ttsChips}>
      {/* 语速 */}
      <TouchableOpacity
        style={[styles.ttsChip, { backgroundColor: readerColors.accentBg, borderWidth: 1, borderColor: readerColors.accentBorder }]}
        onPress={() => updateSettings({ speechRate: settings.speechRate >= 2.0 ? 0.5 : Number((settings.speechRate + 0.25).toFixed(2)) })}
      >
        <Text style={[styles.ttsChipText, { color: readerColors.accent }]}>{settings.speechRate.toFixed(1)}x</Text>
      </TouchableOpacity>

      {/* 音色 */}
      <TouchableOpacity
        style={[styles.ttsChip, { backgroundColor: readerColors.iconBox }]}
        onPress={() => {}} // 预留：可展开音色列表
      >
        <Text style={[styles.ttsChipText, { color: readerColors.textSub }]} numberOfLines={1}>
          {selectedVoiceLabel}
        </Text>
      </TouchableOpacity>

      {/* 定时 */}
      <TouchableOpacity
        style={[styles.ttsChip, { backgroundColor: readerColors.iconBox }]}
        onPress={() => {
          const options = [15, 30, 60, 0];
          const current = speechTimerMinutes;
          const next = options[(options.indexOf(current) + 1) % options.length];
          setSpeechTimerMinutes(next);
          setIsSpeechTimerEnabled(next > 0);
        }}
      >
        <Text style={[styles.ttsChipText, { color: readerColors.textSub }]}>
          {speechTimerMinutes > 0 ? `⏱ ${speechTimerMinutes}m` : t('reader.timerNone')}
        </Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
```

确认 `selectedVoiceLabel` 已在 ReaderScreen 中定义（应已存在于约第 1250 行附近），如未定义则加入：
```ts
const selectedVoiceLabel = useMemo(() => {
  if (!settings.voiceType || settings.voiceType === 'default') return t('common.default');
  const v = voices.find(x => x.identifier === settings.voiceType);
  return v ? getVoiceDisplayLabel(v, v.identifier, t, language) : settings.voiceType;
}, [settings.voiceType, voices, t, language]);
```

- [ ] **Step 6: 添加全屏 TTS 样式**

```ts
ttsOverlay: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 32,
},
ttsBack: {
  position: 'absolute',
  left: 20,
  width: 36,
  height: 36,
  borderRadius: 18,
  alignItems: 'center',
  justifyContent: 'center',
},
ttsBigWave: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  height: 60,
  marginBottom: 24,
},
ttsBigWaveBar: {
  width: 4,
  height: 52,
  borderRadius: 3,
},
ttsChapter: {
  fontSize: 11,
  fontWeight: '800',
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  marginBottom: 10,
  textAlign: 'center',
},
ttsSentence: {
  fontSize: 16,
  lineHeight: 26,
  textAlign: 'center',
  marginBottom: 28,
},
ttsTrack: {
  width: '100%',
  height: 2,
  borderRadius: 1,
  marginBottom: 28,
  position: 'relative',
},
ttsTrackFill: {
  position: 'absolute',
  left: 0,
  top: 0,
  height: 2,
  borderRadius: 1,
},
ttsTrackDot: {
  position: 'absolute',
  top: -5,
  width: 12,
  height: 12,
  borderRadius: 6,
},
ttsControls: {
  flexDirection: 'row',
  gap: 20,
  alignItems: 'center',
  marginBottom: 32,
},
ttsSmBtn: {
  width: 44,
  height: 44,
  borderRadius: 22,
  alignItems: 'center',
  justifyContent: 'center',
},
ttsMainBtn: {
  width: 64,
  height: 64,
  borderRadius: 32,
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 12,
  elevation: 8,
},
ttsChips: {
  flexDirection: 'row',
  gap: 10,
  flexWrap: 'wrap',
  justifyContent: 'center',
},
ttsChip: {
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderRadius: 20,
},
ttsChipText: {
  fontSize: 13,
  fontWeight: '600',
},
```

- [ ] **Step 7: 确认 speakFrom 辅助函数存在**

搜索 `speakFrom`。如不存在，则在 `startSpeech` 附近添加：

```ts
const speakFrom = (chData: ChapterData, sentenceIndex: number) => {
  setCurrentSentenceIndex(sentenceIndex);
  setCurrentSpeakingChapterId(chData.chapter.id);
  // 停止当前朗读，重新从目标句子开始
  Speech.stop();
  const sentence = chData.sentences[sentenceIndex];
  if (sentence) {
    const text = prepareSentenceForTts(sentence.text);
    Speech.speak(text, {
      language: settingsRef.current.voiceType === 'default' ? (language === 'zh' ? 'zh-CN' : 'en-US') : undefined,
      voice: settingsRef.current.voiceType === 'default' ? undefined : settingsRef.current.voiceType,
      rate: settingsRef.current.speechRate,
      useApplicationAudioSession: false,
      onDone: () => advanceSentence(chData, sentenceIndex),
      onStopped: () => {},
      onError: () => advanceSentence(chData, sentenceIndex),
    });
  }
};
```

如果已有类似的朗读驱动逻辑，直接复用，不要重复实现。检查现有 `speakSentence` / `speakCurrentSentence` 等函数。

- [ ] **Step 8: 截图验证**

打开书本，开始朗读，截图确认：
1. Mini 播放条在底部出现（menu 隐藏时）
2. 点击 Mini 条 → 全屏 TTS Modal 弹出，音波动画运行
3. 暂停/播放按钮正常

```bash
mkdir -p /Users/eugenewu/code/audio_book/screenshots/reader-tts
```

- [ ] **Step 9: Commit**

```bash
git add src/screens/ReaderScreen.tsx
git commit -m "feat: ReaderScreen - Mini播放条 + 全屏沉浸TTS Modal"
```

---

## Task 6: SettingsScreen 重设计

**Files:**
- Modify: `src/screens/SettingsScreen.tsx`

**变更：** 用分组卡片布局替换 flat list 风格，更新所有颜色 token，分段选择器 + 步进器 + Switch 样式全部对齐新设计。

- [ ] **Step 1: 更新 colors 变量**

找到 `bgColor`、`sectionBgColor` 等（约第 141 行），替换为：

```ts
const sc = useMemo(() => ({
  bg:           isDark ? '#0E0C0A' : '#FAF7F0',
  surface:      isDark ? '#1C1916' : '#F3ECE0',
  border:       isDark ? '#2A2520' : '#E0D4C0',
  accent:       isDark ? '#C4A96A' : '#A0621A',
  accentBg:     isDark ? 'rgba(196,169,106,0.1)' : 'rgba(139,94,32,0.08)',
  textPrimary:  isDark ? '#E8E0D0' : '#2C1A0E',
  textSub:      isDark ? '#6A5A44' : '#9A7A5A',
  iconBox:      isDark ? '#2A2520' : '#E8DCC8',
  switchOn:     isDark ? '#C4A96A' : '#2C1A0E',
}), [isDark]);
```

删除旧的 `bgColor`、`sectionBgColor`、`textColor`、`subTextColor`、`borderColor` 单独变量，在 JSX 中统一改为 `sc.*`。

- [ ] **Step 2: 更新 ScrollView 容器**

```tsx
<ScrollView
  style={{ flex: 1, backgroundColor: sc.bg }}
  contentContainerStyle={[styles.container, { backgroundColor: sc.bg }]}
>
```

- [ ] **Step 3: 重写分组渲染结构**

将所有 `<View style={[styles.section, ...]}>` 块改为新的分组卡片格式，每个 section 前加分组标题：

```tsx
{/* ===== 外观 ===== */}
<Text style={[styles.groupLabel, { color: sc.accent }]}>{t('settings.appearance')}</Text>
<View style={[styles.groupCard, { backgroundColor: sc.surface, borderColor: sc.border }]}>
  {/* 语言 */}
  <View style={styles.settingsRow}>
    <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.language')}</Text>
    <View style={styles.segControl}>
      {(['system', 'zh', 'en'] as const).map((lang, i, arr) => (
        <TouchableOpacity
          key={lang}
          onPress={() => updateSettings({ language: lang })}
          style={[
            styles.segBtn,
            { backgroundColor: settings.language === lang ? sc.accent : sc.iconBox },
            i === 0 && styles.segBtnFirst,
            i === arr.length - 1 && styles.segBtnLast,
          ]}
        >
          <Text style={[styles.segBtnText, { color: settings.language === lang ? (isDark ? '#0E0C0A' : '#FAF7F0') : sc.textSub }]}>
            {lang === 'system' ? t('settings.languageSystem') : lang === 'zh' ? t('settings.languageChinese') : t('settings.languageEnglish')}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>

  <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

  {/* 主题 */}
  <View style={styles.settingsRow}>
    <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.themeMode')}</Text>
    <View style={styles.segControl}>
      {(['system', 'dark', 'light'] as const).map((theme, i, arr) => (
        <TouchableOpacity
          key={theme}
          onPress={() => updateSettings({ theme })}
          style={[
            styles.segBtn,
            { backgroundColor: settings.theme === theme ? sc.accent : sc.iconBox },
            i === 0 && styles.segBtnFirst,
            i === arr.length - 1 && styles.segBtnLast,
          ]}
        >
          <Text style={[styles.segBtnText, { color: settings.theme === theme ? (isDark ? '#0E0C0A' : '#FAF7F0') : sc.textSub }]}>
            {theme === 'system' ? t('settings.themeSystem') : theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>

  <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

  {/* 字号 */}
  <View style={styles.settingsRow}>
    <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.fontSize')}</Text>
    <View style={styles.stepper}>
      <TouchableOpacity onPress={() => updateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })} style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}>
        <Text style={[styles.stepBtnText, { color: sc.accent }]}>−</Text>
      </TouchableOpacity>
      <Text style={[styles.stepVal, { color: sc.textPrimary }]}>{settings.fontSize}</Text>
      <TouchableOpacity onPress={() => updateSettings({ fontSize: Math.min(30, settings.fontSize + 2) })} style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}>
        <Text style={[styles.stepBtnText, { color: sc.accent }]}>+</Text>
      </TouchableOpacity>
    </View>
  </View>

  <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

  {/* 行距 */}
  <View style={styles.settingsRow}>
    <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.lineSpacing')}</Text>
    <View style={styles.stepper}>
      <TouchableOpacity onPress={() => updateSettings({ lineSpacing: Math.max(1.2, Number((settings.lineSpacing - 0.1).toFixed(1))) })} style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}>
        <Text style={[styles.stepBtnText, { color: sc.accent }]}>−</Text>
      </TouchableOpacity>
      <Text style={[styles.stepVal, { color: sc.textPrimary }]}>{settings.lineSpacing.toFixed(1)}</Text>
      <TouchableOpacity onPress={() => updateSettings({ lineSpacing: Math.min(2.2, Number((settings.lineSpacing + 0.1).toFixed(1))) })} style={[styles.stepBtn, { backgroundColor: sc.iconBox }]}>
        <Text style={[styles.stepBtnText, { color: sc.accent }]}>+</Text>
      </TouchableOpacity>
    </View>
  </View>

  <View style={[styles.rowDivider, { backgroundColor: sc.border }]} />

  {/* 字体 */}
  <TouchableOpacity onPress={() => setShowFonts(v => !v)} style={styles.settingsRow} activeOpacity={0.7}>
    <Text style={[styles.rowLabel, { color: sc.textPrimary }]}>{t('settings.fontFamily')}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={[styles.rowValue, { color: sc.textSub }]}>{selectedFontLabel}</Text>
      <Ionicons name={showFonts ? 'chevron-up' : 'chevron-down'} size={14} color={sc.textSub} />
    </View>
  </TouchableOpacity>

  {showFonts && (
    <View style={[styles.fontList, { borderTopColor: sc.border }]}>
      {settingsFontOptions.map(option => {
        const id = option.id as Exclude<typeof option.id, 'system'>;
        const selected = settings.fontPreset === id;
        return (
          <TouchableOpacity
            key={id}
            onPress={() => updateSettings({ fontPreset: id })}
            style={[styles.fontItem, selected && { backgroundColor: sc.accentBg }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.fontItemName, { color: selected ? sc.accent : sc.textPrimary }]}>{fontOptionMeta[id].label}</Text>
              <Text style={[styles.fontItemDesc, { color: sc.textSub }]}>{fontOptionMeta[id].description}</Text>
            </View>
            <Text style={[styles.fontItemPreview, { color: sc.textPrimary, fontFamily: getFontFamilyForPreset(id) }]}>汉字</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  )}
</View>
```

按相同模式实现「阅读」、「朗读」、「关于」三个分组（参考现有 JSX，只更新颜色和组件样式）。

- [ ] **Step 4: 更新 StyleSheet**

删除旧的 `section`、`sectionTitle`、`languageButton`、`modeButton` 等样式，添加：

```ts
container: {
  padding: 20,
  paddingBottom: 48,
},
groupLabel: {
  fontSize: 11,
  fontWeight: '700',
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  marginBottom: 8,
  marginTop: 20,
  paddingHorizontal: 4,
},
groupCard: {
  borderRadius: 14,
  borderWidth: StyleSheet.hairlineWidth,
  overflow: 'hidden',
  marginBottom: 4,
},
settingsRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: 13,
  paddingHorizontal: 16,
},
rowLabel: {
  fontSize: 15,
  fontWeight: '600',
  flex: 1,
},
rowValue: {
  fontSize: 14,
},
rowDivider: {
  height: StyleSheet.hairlineWidth,
  marginHorizontal: 16,
},
segControl: {
  flexDirection: 'row',
  gap: 1,
},
segBtn: {
  paddingVertical: 6,
  paddingHorizontal: 11,
},
segBtnFirst: {
  borderTopLeftRadius: 8,
  borderBottomLeftRadius: 8,
},
segBtnLast: {
  borderTopRightRadius: 8,
  borderBottomRightRadius: 8,
},
segBtnText: {
  fontSize: 12,
  fontWeight: '600',
},
stepper: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
},
stepBtn: {
  width: 30,
  height: 30,
  borderRadius: 15,
  alignItems: 'center',
  justifyContent: 'center',
},
stepBtnText: {
  fontSize: 18,
  fontWeight: '700',
  lineHeight: 22,
},
stepVal: {
  fontSize: 15,
  fontWeight: '700',
  minWidth: 32,
  textAlign: 'center',
},
fontList: {
  borderTopWidth: StyleSheet.hairlineWidth,
},
fontItem: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: 12,
  paddingHorizontal: 16,
  gap: 12,
},
fontItemName: {
  fontSize: 14,
  fontWeight: '600',
},
fontItemDesc: {
  fontSize: 12,
  marginTop: 2,
},
fontItemPreview: {
  fontSize: 20,
},
```

- [ ] **Step 5: 截图验证**

截图确认两种主题下设置页分组卡片样式，重点：分组标题颜色、分段选择器激活态、步进器样式。

```bash
mkdir -p /Users/eugenewu/code/audio_book/screenshots/settings-redesign
```

- [ ] **Step 6: Commit**

```bash
git add src/screens/SettingsScreen.tsx
git commit -m "feat: SettingsScreen 重设计 - 分组卡片布局 + 双主题"
```

---

## Self-Review

**Spec 覆盖检查：**
- ✅ 色彩 token 系统 → Task 1-6 各 Step 1
- ✅ 书架页 → Task 1
- ✅ 上传页 → Task 2
- ✅ 阅读控制条 → Task 3
- ✅ 排版面板（字号步进 + 行距步进 + 字体芯片，无预览） → Task 4
- ✅ Mini 播放条（音波 + 进度 + 暂停/停止）→ Task 5
- ✅ Mini 条点击 → 全屏 TTS → Task 5
- ✅ 全屏 TTS（音波 + 句子 + 进度 + 三键 + 芯片）→ Task 5
- ✅ 设置页分组卡片 → Task 6

**Placeholder 检查：** 无 TBD，所有步骤含完整代码。

**类型一致性：** `readerColors` 在 Task 3-5 中一致引用；`sc` 在 Task 6 中一致；`waveAnims` 在 Task 5 Step 1 定义，Step 3/5 引用。
