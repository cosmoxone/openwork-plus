---
name: browser-automation
description: 通过 gui-operate MCP 执行浏览器与桌面 GUI 自动化
---

# 浏览器 / 桌面 GUI 自动化

当用户需要截图、点击、输入或滚动时：

1. 确认 `gui-operate` MCP 已在 opencode.json 中启用。
2. 优先调用 `screenshot` 获取当前屏幕状态，再决定 `click` / `type` / `scroll`。
3. 每步操作后再次截图验证结果。
4. 若工具返回权限错误，提示用户在系统设置中授予屏幕录制/辅助功能权限。

禁止在未确认目标窗口的情况下执行破坏性点击（关闭、删除、提交表单）。