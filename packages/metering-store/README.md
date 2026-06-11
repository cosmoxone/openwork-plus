# @openwork/metering-store

统一会话 / 用量 / Credit 计量持久层。衔接 [App-Server 契约](../../docs/) 的 `event/notify` usage 事件与商业线钱包（充值 / 扣费 / 余额 / 低余额提醒）。

## 设计

- **后端可插拔**：默认 JSON 文件后端（零依赖、可即用、便于测试）；生产切 SQLite（`better-sqlite3`，WAL 模式，schema 见 `schema.sql`）。切换后端不改业务代码。
- **钱包记账**：`wallet_ledger` 用统一流水（`topup` 正 / `usage` 负 / `adjust`），余额 = 流水累加。
- **用量聚合**：`usage_events` 支持按 `model` / `day` 聚合（对应 Models 页 7/30 天滚动窗口）。

## 用法

```js
import { MeteringStore } from "@openwork/metering-store";

const store = new MeteringStore({ dataDir: process.env.OPENWORK_DATA_DIR });
await store.topUp({ amountUsd: 10, deviceId: "box-1" });
await store.recordUsage({ sessionId: "s1", model: "gpt-5.3-codex", inputTokens: 1000, outputTokens: 500, costUsd: 0.02, deviceId: "box-1" });
await store.balance("box-1");                 // 9.98
await store.aggregate({ groupBy: "model" });  // { "gpt-5.3-codex": { inputTokens, outputTokens, costUsd, count } }
```

## 测试

```bash
node test/metering-smoke.mjs
```

## 生产 SQLite 后端（TODO）

`schema.sql` 已就绪。生产适配器步骤：
1. `pnpm add better-sqlite3`
2. 新增 `src/sqlite-backend.mjs`，实现与 `JsonBackend` 相同的 `load/flush` 等价语义（直接 SQL 读写两表）。
3. `MeteringStore` 构造参数增加 `backend: "sqlite"` 分支。
