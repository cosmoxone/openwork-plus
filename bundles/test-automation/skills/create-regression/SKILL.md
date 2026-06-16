---
name: create-regression
description: 为已修复的缺陷创建回归测试
---

# 创建回归测试

当 bug 已修复或用户描述「防止再次发生」时：

1. 确认缺陷复现步骤与修复 commit/文件。
2. 在合适目录新增**最小回归用例**，覆盖原失败路径。
3. 命名体现缺陷 ID 或场景（如 `regression_issue_42_login_timeout`）。
4. 运行 `test-runner run --framework <fw> --path <dir> --record` 验证新用例通过且记录入库。
5. 简要说明如何用 test-db `get_trend` 跟踪后续稳定性。

输出：完整测试代码 + 放置路径 + 运行命令。
