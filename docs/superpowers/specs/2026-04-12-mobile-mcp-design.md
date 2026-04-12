# mobile-mcp 集成设计

**日期**: 2026-04-12  
**状态**: 已实现

## 问题背景

Claude Code 修改 UI 代码后无法看到效果，只能依赖用户手动反馈截图或描述，导致调试效率低，容易改错方向。

## 目标

让 Claude Code 在开发调试时能：
1. 截取 iOS Simulator 当前画面，自主确认 UI 效果
2. 发送点击/滑动/输入手势，验证交互行为

## 方案：ios-simulator-mcp

使用 `ios-simulator-mcp`，专为 agent 控制 iOS Simulator 设计的 MCP server。通过 MCP 协议与 Claude Code 集成，在操作系统层操作 iOS Simulator，与 app 内部实现（Expo Go / development build）无关。

## 架构

```
Claude Code
   ↓ MCP 协议
mobile-mcp (本地进程)
   ↓ xcrun simctl
iOS Simulator (development build)
```

## 配置

通过 Claude Code CLI 全局注册（写入 `~/.claude.json`）：

```bash
claude mcp add --scope user ios-simulator -- npx ios-simulator-mcp
```

无需项目级配置，一次配置全局生效。

## 开发工作流

前提：每次开发前先运行 `expo run:ios` 启动模拟器。

```
1. Claude 修改代码
2. 等待 Metro 热更新完成（约 2-3 秒）
3. 调用 mobile-mcp screenshot 截图，确认 UI 效果
4. 如需验证交互，发送 tap / swipe / type 手势
5. 截图确认结果，如不符合预期返回步骤 1
```

## mobile-mcp 可用工具

| 工具 | 用途 |
|------|------|
| `screenshot` | 截取模拟器当前画面 |
| `tap` | 点击指定坐标 |
| `swipe` | 滑动手势 |
| `type` | 输入文字 |
| `press_button` | Home / Back 等系统键 |

## 限制

- 模拟器必须在 Claude 开始工作前已启动
- JS 改动通过 Metro 热更新生效，native 改动需重新 `expo run:ios`（项目 CLAUDE.md 已禁止修改 `ios/` 目录，此场景不会触发）
- `ios-simulator-mcp` 仅支持 iOS；如需 Android 支持，未来可切换至 `@mobilenext/mobile-mcp`

## 为何不切换到 Expo Go

项目依赖 `react-native-tcp-socket`（WifiServerService 局域网传书功能）和 `react-native-reanimated ~4.1.1`，两者均不在 Expo Go SDK 54 内置模块中，切换会导致功能崩溃。且 mobile-mcp 在模拟器 OS 层工作，与 Expo Go / development build 无关，切换无收益。
