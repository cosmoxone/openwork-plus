/**
 * P4 定时任务手工路径的机器预演（等价 doc 20 §5.2，无需 OpenWork 桌面）。
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkWSLStatus } from "../../sandbox-bootstrap/src/wsl-init.mjs";
import { TaskSchedulerStore, tickScheduler, getTestSummary } from "../src/index.mjs";

const isWin = process.platform === "win32";
if (isWin) {
  const status = await checkWSLStatus();
  if (!status.available) {
    console.log("SKIP: P4 manual dry-run (WSL2 not available on Windows)");
    process.exit(0);
  }
}

const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-p4-manual-"));
const dbPath = path.join(dataDir, "test-results.json");

try {
  const store = new TaskSchedulerStore({ dataDir });
  await store.add({
    title: "manual-wsl-test",
    cronExpr: "@every_minute",
    actionKind: "scheduled_test",
    actionPayload: { dbPath, sandbox_id: "manual", framework: "manual-dry-run" },
    nextRunAt: Date.now() - 1000,
  });

  await tickScheduler(store, { dataDir, log: () => {} });

  const dbRaw = JSON.parse(await readFile(dbPath, "utf8"));
  const last = dbRaw.runs[dbRaw.runs.length - 1];
  assert.equal(last.trigger, "schedule");
  assert.equal(last.sandbox_id, "manual");

  const summary = await getTestSummary(dbPath);
  assert.ok(summary.scheduledRunCount >= 1);

  store.close();
  console.log("PASS: P4 scheduler manual dry-run (machine preflight)");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
