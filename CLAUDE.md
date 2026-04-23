# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目指令

### 边界
不要直接更新 ios 或 android 文件夹中的文件, 仅允许通过 expo prebuild 重新生成

## 常用命令

```bash
expo start              # 启动开发服务器
expo run:ios            # 运行 iOS
expo run:android        # 运行 Android
jest                    # 跑所有测试
jest --testPathPattern=<file>  # 跑单个测试文件
```

## 架构概览

**入口**: `App.tsx` → `AppNavigator.tsx` → Stack Navigator

**主要屏幕**:
- `BookshelfScreen` — 书库首页，启动时自动跳转到最近阅读的书
- `ReaderScreen` — 核心阅读界面（最复杂，含分页/TTS/自动滚动）
- `UploadScreen` — 文件导入
- `SettingsScreen` — 用户设置（主题/字体/语言/朗读）
- `ChaptersScreen` — 章节列表与跳转

**状态管理**: 无 Redux/Context，使用本地 state + AsyncStorage + DeviceEventEmitter
- `useSettings()` — 读写设置，发出 `SETTINGS_CHANGED` 事件
- `useSpeech()` — 管理 TTS 状态
- AsyncStorage key 前缀: `@audio_book_books`, `@audio_book_chapters_*`, `@audio_book_progress_*`

**核心服务** (`services/`):
- `BookService` — 书籍 CRUD、封面管理
- `ChapterService` — 章节解析与管理
- `StorageService` — AsyncStorage 封装
- `WifiServerService` — TCP socket 服务，支持局域网传书

**国际化**: `i18n/index.ts`，支持中文/英文，跟随系统语言

**主题**: 系统/浅色/深色三模式，实时响应系统变化

**字体**: 应用启动时加载自定义中文字体（LXGWWenKai、NotoSansSC 等）

## UI 调试工作流（ios-simulator-mcp）

修改 UI 代码后，Claude 应自主验证效果，无需用户截图反馈：

1. 修改代码，保存
2. 等待 Metro 热更新完成（约 2-3 秒）
3. 调用 `ios_simulator__screenshot` 截图确认 UI
4. 如需验证交互，调用 `ios_simulator__tap` / `ios_simulator__swipe` / `ios_simulator__type`
5. 再次截图确认结果

**前提：** 开发前须先运行 `expo run:ios` 启动模拟器。  
**注意：** Native 改动（修改 ios/ 目录）需重新 build，热更新不生效，但本项目禁止修改 ios/ 目录，此场景不会出现。

### 操作手册

**环境准备**  
idb_companion 未安装时 tap/swipe 会报 FileNotFoundError，需先安装：
```bash
brew tap facebook/fb && brew install idb-companion
sudo ln -sf /opt/homebrew/bin/idb_companion /usr/local/bin/idb_companion
```

**截图路径**  
截图保存到 `screenshots/<feature>/` 二级目录，不要用 `~/Downloads` 或项目根目录：
```
output_path: /Users/eugenewu/code/audio_book/screenshots/<feature>/1.png
```
例如：`screenshots/bookshelf-menu/1.png`、`screenshots/reader-tts/1.png`。  
feature 名用小写连字符，与当前开发的功能对应。

**坐标系**  
坐标使用逻辑点（points），不是像素。iPhone 16 Pro Max 为 440×956 pt。  
点击前先用 `ui_describe_all` 获取精确坐标，不要凭截图估算。  
元素中心点 = AXFrame 的 `x + width/2`, `y + height/2`。

**标准交互流程**
1. `get_booted_sim_id` — 获取 udid
2. `screenshot` — 确认当前画面
3. `ui_describe_all` — 获取元素精确坐标
4. `ui_tap` — 精确点击
5. `screenshot` — 验证结果

**文本输入清除**  
`ui_type` 只会追加，清除已有内容用 idb 退格键（keycode 42）：
```bash
idb ui key-sequence --udid <udid> $(python3 -c "print(' '.join(['42']*N))")
```
N 为要删除的字符数，可多发几个确保清空。

**常见场景**
- 唤出 App 内菜单：点击屏幕中间区域（ReaderScreen 点中间切换菜单显示）
- 返回上一页：从左边缘右划（x_start=10），或点导航栏返回按钮
- Alert 按钮位置：用 `ui_describe_all` 找，不要用截图估坐标
