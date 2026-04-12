# mobile-mcp 集成实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Claude Code 能在开发调试时截取 iOS Simulator 截图并发送交互手势，无需用户手动反馈 UI 效果。

**Architecture:** 通过 Claude Code MCP 机制注册 `@mobile-next/mobile-mcp` 为全局 stdio MCP server。Claude 在修改代码后调用其 screenshot/tap/swipe 等工具，在模拟器 OS 层验证 UI 效果。无需修改任何 app 代码。

**Tech Stack:** `@mobile-next/mobile-mcp`（npx 运行），Claude Code MCP (`claude mcp add`)，iOS Simulator (`xcrun simctl`)

---

### Task 1: 注册 mobile-mcp 为全局 MCP server

**Files:**
- Modify: `~/.claude/settings.json`（由 `claude mcp add` 自动写入，无需手动编辑）

- [ ] **Step 1: 运行注册命令**

```bash
claude mcp add --scope user mobile -- npx @mobile-next/mobile-mcp
```

预期输出：`Added MCP server mobile to user config`（或类似成功提示）

- [ ] **Step 2: 验证注册成功**

```bash
claude mcp list
```

预期输出包含：
```
mobile: npx @mobile-next/mobile-mcp
```

- [ ] **Step 3: 提交记录（注册是全局配置，无需 git 提交）**

此步无需操作，MCP 配置写在 `~/.claude/settings.json`，不在项目仓库中。

---

### Task 2: 验证 mobile-mcp 能连接到运行中的模拟器

**前提：** 先启动模拟器 `expo run:ios`，等 app 完全加载后再执行验证。

- [ ] **Step 1: 确认模拟器正在运行**

```bash
xcrun simctl list devices | grep Booted
```

预期输出包含一个 `(Booted)` 设备，例如：
```
iPhone 16 (XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX) (Booted)
```

若无输出，先运行 `expo run:ios` 启动模拟器。

- [ ] **Step 2: 手动测试 mobile-mcp 截图能力**

在新的 Claude Code 会话中启动，观察工具列表是否出现 `mobile__screenshot`、`mobile__tap` 等工具。

若工具未出现：重启 Claude Code 使 MCP 配置生效。

- [ ] **Step 3: 验证截图功能**

在 Claude Code 中执行：调用 `mobile__screenshot`，确认返回模拟器当前画面图像。

若报错 `No booted simulator found`：确认模拟器已启动（见 Step 1）。

---

### Task 3: 更新项目 CLAUDE.md，记录 mobile-mcp 工作流

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 在 CLAUDE.md 的常用命令章节后新增以下内容**

在 `## 常用命令` 章节末尾追加：

```markdown
## UI 调试工作流（mobile-mcp）

修改 UI 代码后，Claude 应自主验证效果，无需用户截图反馈：

1. 修改代码，保存
2. 等待 Metro 热更新完成（约 2-3 秒）
3. 调用 `mobile__screenshot` 截图确认 UI
4. 如需验证交互，调用 `mobile__tap` / `mobile__swipe` / `mobile__type`
5. 再次截图确认结果

**前提：** 开发前须先运行 `expo run:ios` 启动模拟器。  
**注意：** Native 改动（修改 ios/ 目录）需重新 build，热更新不生效，但本项目禁止修改 ios/ 目录，此场景不会出现。
```

- [ ] **Step 2: 确认 CLAUDE.md 内容正确**

```bash
grep -A 20 "UI 调试工作流" CLAUDE.md
```

预期输出：完整显示刚写入的工作流说明。

- [ ] **Step 3: 提交**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-04-12-mobile-mcp.md docs/superpowers/specs/2026-04-12-mobile-mcp-design.md
git commit -m "docs: 集成 mobile-mcp，记录 UI 调试工作流"
```
