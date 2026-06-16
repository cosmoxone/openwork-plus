# @openwork/gui-operate-mcp

GUI 自动化 MCP server——点击 / 输入 / 滚动 / 拖拽 / 截图 / 多显示器 / AI 视觉定位。
从 Open Cowork 的 `gui-operate-server.ts` 提取，**零 Electron 依赖**（仅 MCP SDK + Node 内置 + 可选 `@anthropic-ai/sdk`）。

> 对应 MVP 融合计划 Sprint 0 · 任务 0.1。场景 D/E（RPA / 电商运营）的核心能力。

## 平台

- macOS：`cliclick` + AppleScript（`brew install cliclick`）。
- Windows：PowerShell + .NET `System.Windows.Forms`。
- 视觉工具（`gui_locate_element` / `gui_verify_vision` / `gui_extract_info`）需配置 vision API key。

## 数据目录

优先环境变量 `OPENWORK_DATA_DIR`，否则按平台默认（`openwork` 品牌）：

| OS | 默认 |
|----|------|
| macOS | `~/Library/Application Support/openwork` |
| Windows | `%APPDATA%\openwork` |
| Linux | `~/.config/openwork` |

截图存 `<dataDir>/gui_operate/`，应用点击历史存 `<dataDir>/gui_apps/`，日志存 `<dataDir>/logs/`。

## 构建与运行

```bash
npm install
npm run build          # tsc -> dist/
npm start              # node dist/server.js（stdio MCP）
```

## 验证（tools/list）

```bash
npm test               # 启动 server，走 MCP 生命周期，断言 tools/list 非空（17 个工具）
```

已验证：`initialize` 返回 `serverInfo: gui-operate 1.0.0`，`tools/list` 返回 17 个工具
（get_displays / click / type_text / key_press / scroll / drag / screenshot / screenshot_for_display /
get_mouse_position / move_mouse / wait / gui_locate_element / gui_verify_vision / gui_extract_info /
get_all_visited_apps / init_app / clear_click_history）。

## 在 bundle 中引用

```jsonc
"mcp": { "servers": { "gui-operate": {
  "command": "npx",
  "args": ["-y", "@openwork/gui-operate-mcp", "--sandbox", "auto"],
  "env": { "OPENWORK_DATA_DIR": "${HOME}/.openwork" }
}}}
```
