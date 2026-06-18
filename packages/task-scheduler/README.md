# @openwork/task-scheduler

SQLite 持久化定时任务（P3-2）：CRUD、cron 表达式、`tick` 触发与 `schedule_runs` 审计表。存储引擎：`sql.js`（SQLite WASM，零原生编译）。

## CLI

```powershell
node packages/task-scheduler/bin/openwork-schedule.mjs add `
  --title "nightly-test" `
  --cron "0 9 * * *" `
  --prompt "run regression" `
  --action test_db_record `
  --data-dir $env:TEMP\ow-sched

node packages/task-scheduler/bin/openwork-schedule.mjs list --json --data-dir $env:TEMP\ow-sched
node packages/task-scheduler/bin/openwork-schedule.mjs tick --data-dir $env:TEMP\ow-sched
node packages/task-scheduler/bin/openwork-schedule.mjs remove --id <uuid> --data-dir $env:TEMP\ow-sched
```

数据库默认：`<OPENWORK_DATA_DIR>/scheduler.db`

Cron 别名：`@every_minute`、`@hourly`、`@daily`

## 库 API

```javascript
import { TaskSchedulerStore, tickScheduler } from "@openwork/task-scheduler";

const store = new TaskSchedulerStore({ dataDir });
const task = store.add({ title: "t", cronExpr: "* * * * *", nextRunAt: Date.now() - 1 });
await tickScheduler(store, { dataDir });
```
