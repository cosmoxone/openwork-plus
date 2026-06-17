---
name: ui-test-assist
description: 结合 gui-operate MCP 做 UI/端到端测试辅助（需 computer-use bundle）
---

# UI 测试辅助（场景 A × 场景 E）

当用户需要做 **界面级** 或 **端到端** 测试时：

1. 确认工作区已安装 `computer-use` bundle（提供 `gui-operate` MCP）。
2. 用 `test-runner run` 跑单元/集成测试；用 `gui-operate` 的 `screenshot` / `click` / `type` 做 UI 步骤。
3. 失败时结合 `/analyze-failure` 与 test-db `list_failures` 汇总。
4. 将 UI 步骤摘要写入 test-db（`record_run` 的 cases 字段可附 `kind: "ui"`）。

若 `gui-operate` 不可用，明确告知用户安装 computer-use bundle，不要假装能截图。