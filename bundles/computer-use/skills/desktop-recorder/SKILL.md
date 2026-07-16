---
name: desktop-recorder
description: 引导 AI 录制并回放桌面 GUI 操作序列（配合 gui-operate MCP）。
---

# Desktop Recorder

使用 `gui-operate` MCP 工具链录制桌面操作：

1. 用 `screenshot` 建立界面基线
2. 用 `click` / `type` / `scroll` 执行步骤
3. 每步后再次 `screenshot` 验证状态变化
4. 失败时用 `error-recovery` 技能中的策略重试

操作历史可在 OpenWork **RPA / UI 自动化** 面板查看（`gui_apps/*/click_history.json`）。

## 约束

- 坐标使用 display-local 逻辑坐标
- 多显示器时指定 `display_index`
- 敏感输入（密码）应让用户手动完成或使用安全字段
