# 场景 A（test-automation）手工测试指南

> 前置：已自测通过（见文末「自测清单」）。场景 C 暂停，仅验证测试自动化 bundle。

## 0. 环境要求

| 项 | 要求 |
|----|------|
| Node.js | ≥ 18（本机 v18.19.1 已验证） |
| Go | 可选（仅重编 test-runner 时需要） |
| 仓库 | `E:\proj\openwork-platform`，分支含 commit `32552fe` 及之后 |
| 环境变量 | 安装 bundle 前设置 `OPENWORK_MONOREPO_ROOT` 指向仓库根 |

```powershell
$env:OPENWORK_MONOREPO_ROOT = "E:\proj\openwork-platform"
```

---

## 1. 自动化自测（建议先跑一遍）

在 `openwork-platform` 根目录：

```powershell
cd E:\proj\openwork-platform

# 安装器 + minimal bundle
node apps/orchestrator/test/bundle-smoke.mjs

# Sprint 1 全流程（skills/commands/mcp/cli/卸载可逆）
node apps/orchestrator/test/sprint1-smoke.mjs

# test-db 存储层
cd packages/test-db-mcp
npm install
npm test
cd ../..

# test-runner Go 单测
$env:Path = "D:\go\bin;" + $env:Path
cd packages/test-runner
go test ./...
cd ../..
```

全部应输出 `PASS` / `ok`。

---

## 2. 手工安装 test-automation bundle

### 2.1 准备工作区

```powershell
$WS  = "E:\proj\openwork-tmp\manual-ws"
$DATA = "E:\proj\openwork-tmp\manual-data"
New-Item -ItemType Directory -Force -Path $WS, $DATA | Out-Null
$env:OPENWORK_MONOREPO_ROOT = "E:\proj\openwork-platform"
cd E:\proj\openwork-platform
```

### 2.2 安装

`index.mjs` 无独立 CLI 入口，用手动调用 API（与冒烟测试相同）：

```powershell
node --input-type=module -e @"
import { runBundleCommand } from './apps/orchestrator/src/bundle/index.mjs';
await runBundleCommand(
  ['bundle','install','./bundles/test-automation'],
  new Map([['workspace','$WS'],['data-dir','$DATA']])
);
"@
```

**期望输出：**

```
installed test-automation@0.1.0
  files: 7
  mcp: test-db, github-actions
```

### 2.3 检查安装产物

```powershell
# Skills（3 个）
Get-ChildItem $WS\.opencode\skills -Directory

# 斜杠命令（3 个）
Get-ChildItem $WS\.opencode\commands

# CLI（Windows 应为 test-runner.exe，不是 test-runner.exe.exe）
Get-ChildItem $DATA\bin

# MCP 已写入 opencode.json
(Get-Content $WS\opencode.json | ConvertFrom-Json).mcp.PSObject.Properties.Name
```

**期望：**

- Skills：`analyze-failure`、`create-regression`、`generate-test-cases`
- Commands：`analyze-failure.md`、`create-regression.md`、`generate-test-cases.md`
- Bin：`test-runner.exe`
- MCP 键：`test-db`、`github-actions`

---

## 3. 手工验证 test-runner CLI

### 3.1 版本与空库查询

```powershell
$RUNNER = "$DATA\bin\test-runner.exe"
$DB     = "$WS\.openwork\test-results.json"

& $RUNNER version
& $RUNNER list-failures --since 24h --db $DB
```

**期望：** `test-runner 0.1.0`；`failures` 为 `null` 或 `[]`。

### 3.2 跑 Jest 样例并入库（推荐）

```powershell
$FIXTURE = "E:\proj\openwork-platform\bundles\test-automation\fixtures\sample-jest-project"
cd $FIXTURE
npm install
cd E:\proj\openwork-platform

& $RUNNER run --framework jest --path $FIXTURE --record $DB
```

**期望：** JSON 中 `failed >= 1`（样例含故意失败用例）、`recordedId` 非空。

再次查询失败：

```powershell
& $RUNNER list-failures --since 24h --db $DB
```

**期望：** `failures` 数组含 `fail1` / `demo failure` 相关用例。

### 3.3 Git 比较（可选）

```powershell
& $RUNNER compare --base HEAD --current HEAD --path E:\proj\openwork-platform
```

**期望：** JSON 含 `addedTestFiles` / `removedTestFiles`（同引用时多为 null）。

---

## 4. 手工验证 test-db-mcp（MCP）

```powershell
$env:OPENWORK_TEST_DB = $DB
$lines = @(
  '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}',
  '{"jsonrpc":"2.0","method":"notifications/initialized"}',
  '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
) -join "`n"
$lines | node E:\proj\openwork-platform\packages\test-db-mcp\bin\test-db-mcp.mjs 2>$null
```

**期望：** 最后一行 JSON 的 `result.tools` 含 4 个工具：

`record_run`、`list_failures`、`get_trend`、`list_runs`

---

## 5. 手工验证 OpenWork 会话（斜杠命令）

> 需 OpenWork 桌面端指向工作区 `$WS`，且已加载该工作区的 `.opencode`。

1. 在 OpenWork 中打开工作区 `E:\proj\openwork-tmp\manual-ws`
2. 新建会话，输入 `/analyze-failure`
3. **期望：** 触发 `analyze-failure` 技能/命令，AI 引导查询 `test-runner list-failures` 或 test-db，并结合失败信息给修复建议
4. 同理可试 `/generate-test-cases`、`/create-regression`

若斜杠命令未出现：确认 `$WS\.opencode\commands\` 下三个 `.md` 存在，并重启/重载工作区。

---

## 6. 卸载与可逆性

```powershell
node --input-type=module -e @"
import { runBundleCommand } from './apps/orchestrator/src/bundle/index.mjs';
await runBundleCommand(['bundle','uninstall','test-automation'], new Map([['data-dir','$DATA']]));
"@
```

**期望：**

- Skills/commands 目录被移除
- `opencode.json` 中 `test-db`、`github-actions` 键消失
- `$DATA\bin\test-runner.exe` 被删除

---

## 7. 常见问题

| 现象 | 处理 |
|------|------|
| MCP `test-db` 启动失败 | 确认 `OPENWORK_MONOREPO_ROOT` 已设；`opencode.json` 里 `args[0]` 应指向 `...\packages\test-db-mcp\bin\test-db-mcp.mjs` |
| `test-runner.exe.exe` | 已修复（commit `030239d`），重装 bundle |
| `jest run` 无 JSON | 确认目录有 `jest.config.js` 或 `package.json` 含 jest；先用 fixtures 样例 |
| 斜杠命令不出现 | 检查 `.opencode/commands/`；OpenWork 需识别该工作区 |

---

## 8. 自测清单（2026-06-16 本机）

| 项 | 结果 |
|----|------|
| `bundle-smoke.mjs` | PASS |
| `sprint1-smoke.mjs` | PASS |
| `test-db-mcp npm test` | PASS |
| `go test ./internal/store` | PASS |
| bundle 安装 skills/commands/mcp | 符合预期 |
| CLI bin 命名 `test-runner.exe` | 符合预期（修复后） |
| `list-failures` 空库 → 写入 → 有失败 | 符合预期 |
| `test-db-mcp tools/list` 4 工具 | 符合预期 |

---

*场景 C（knowledge-mgmt）已暂停；完成本指南后可进入 Sprint 3 场景 E 或交汇点（box-agent 计量）。*
