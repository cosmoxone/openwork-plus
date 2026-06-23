# @openwork-plus/task-scheduler

SQLite 持久化定时任务（P3-2/P3-3）：CRUD、cron 表达式、`tick` 触发、`schedule_runs` 审计表，以及 WSL/bash → test_db 闭环。存储引擎：`sql.js`（SQLite WASM，零原生编译）。

设计文档：`docs/19-task-scheduler-design.md`

## CLI

```powershell
# P3-2：简单 test_db 占位
node packages/task-scheduler/bin/openwork-schedule.mjs add `
  --title "nightly-test" `
  --cron "0 9 * * *" `
  --prompt "run regression" `
  --action test_db_record `
  --data-dir $env:TEMP\ow-sched

# P3-3：WSL 占位脚本 → 共享 JSON → test_db ingest
node packages/task-scheduler/bin/openwork-schedule.mjs add `
  --title "wsl-smoke" `
  --cron "@every_minute" `
  --action scheduled_test `
  --sandbox-id "wsl:Debian" `
  --db "$env:TEMP\ow-sched\test-results.json" `
  --data-dir $env:TEMP\ow-sched

node packages/task-scheduler/bin/openwork-schedule.mjs tick --data-dir $env:TEMP\ow-sched
node packages/task-scheduler/bin/openwork-schedule.mjs summary --db "$env:TEMP\ow-sched\test-results.json" --json
node packages/task-scheduler/bin/openwork-schedule.mjs list --json --data-dir $env:TEMP\ow-sched
node packages/task-scheduler/bin/openwork-schedule.mjs remove --id <uuid> --data-dir $env:TEMP\ow-sched
```

数据库默认：`<OPENWORK_DATA_DIR>/scheduler.db`

Cron 别名：`@every_minute`、`@hourly`、`@daily`

### actionKind

| action | 说明 |
|--------|------|
| `log` | 占位日志 |
| `test_db_record` | 直接 append test_db |
| `shell` | WSL 内执行命令（Windows） |
| `scheduled_test` | WSL/bash 写 JSON → 宿主 ingest（含 `trigger=schedule`、`sandbox_id`） |

## 测试

```powershell
node packages/task-scheduler/test/smoke.mjs
node packages/task-scheduler/test/p3-3-smoke.mjs   # Windows 需 WSL；Linux/mac 用 bash
```

## 库 API

```javascript
import { TaskSchedulerStore, tickScheduler, getTestSummary } from "@openwork-plus/task-scheduler";

const store = new TaskSchedulerStore({ dataDir });
await store.add({
  title: "t",
  cronExpr: "* * * * *",
  actionKind: "scheduled_test",
  actionPayload: { sandbox_id: "wsl-default" },
  nextRunAt: Date.now() - 1,
});
await tickScheduler(store, { dataDir });
const summary = await getTestSummary(dbPath);
```
