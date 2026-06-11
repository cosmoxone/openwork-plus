// 冒烟测试：MeteringStore 记账/余额/聚合（纯 node 内置模块）。
// 运行：node packages/metering-store/test/metering-smoke.mjs

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { MeteringStore } from "../src/store.mjs";

async function main() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ow-meter-"));
  try {
    const store = new MeteringStore({ dataDir: dir });

    await store.topUp({ amountUsd: 10, deviceId: "box-1" });
    await store.recordUsage({
      sessionId: "s1",
      model: "gpt-5.3-codex",
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.02,
      deviceId: "box-1",
      ts: "2026-06-11T10:00:00Z",
    });
    await store.recordUsage({
      sessionId: "s2",
      model: "gpt-5.3-codex",
      inputTokens: 2000,
      outputTokens: 800,
      costUsd: 0.03,
      deviceId: "box-1",
      ts: "2026-06-11T11:00:00Z",
    });

    const bal = await store.balance("box-1");
    assert.ok(Math.abs(bal - (10 - 0.05)) < 1e-9, `余额应为 9.95，实际 ${bal}`);

    const list = await store.listUsage({ limit: 1 });
    assert.equal(list.length, 1);
    assert.equal(list[0].sessionId, "s2"); // 按 ts 降序

    const byModel = await store.aggregate({ groupBy: "model" });
    assert.equal(byModel["gpt-5.3-codex"].count, 2);
    assert.equal(byModel["gpt-5.3-codex"].inputTokens, 3000);

    // 跨进程持久化：新建 store 读同一文件
    const store2 = new MeteringStore({ dataDir: dir });
    const bal2 = await store2.balance("box-1");
    assert.ok(Math.abs(bal2 - 9.95) < 1e-9, "应从磁盘恢复余额");

    console.log("PASS: metering store 记账/余额/聚合/持久化通过");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
