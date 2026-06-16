# test-automation（Sprint 1）

场景 A：测试自动化控制台 Industry Bundle。

## 内容

| 类型 | 路径 |
|------|------|
| Skills | `skills/generate-test-cases` `analyze-failure` `create-regression` |
| 斜杠命令 | `commands/*.md` → `.opencode/commands/` |
| CLI | `test-runner`（`bin/test-runner-<platform>`） |
| MCP | `test-db`（`@openwork/test-db-mcp`）、`github-actions`（社区包） |

## 安装

```bash
# 在 openwork-platform 根目录
node apps/orchestrator/src/bundle/index.mjs install ./bundles/test-automation
```

或设置 `OPENWORK_MONOREPO_ROOT` 指向本仓库根，以便展开 `test-db` MCP 的 `node` 路径。

## 验证

```bash
node apps/orchestrator/test/sprint1-smoke.mjs
```

## 使用

- 会话中 `/analyze-failure`、`/generate-test-cases`、`/create-regression`
- CLI：`~/.openwork/bin/test-runner.exe run --framework jest --path . --record`
- MCP：`test-db` 的 `list_failures` / `get_trend`
