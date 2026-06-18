import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkWSLStatus } from "../../sandbox-bootstrap/src/wsl-init.mjs";
import { TaskSchedulerStore, tickScheduler, getTestSummary } from "../src/index.mjs";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-p33-"));
const dbPath = path.join(dataDir, "test-results.json");
const outputJson = path.join(dataDir, "schedule-last-run.json");

const isWin = process.platform === "win32";
let sandbox_id = "local-bash";

if (isWin) {
  const status = await checkWSLStatus();
  if (!status.available) {
    console.log("SKIP: P3-3 smoke (WSL2 not available on Windows)");
    await rm(dataDir, { recursive: true, force: true });
    process.exit(0);
  }
  sandbox_id = `wsl:${status.distro ?? "default"}`;
}

try {
  const store = new TaskSchedulerStore({ dataDir });

  const task = await store.add({
    title: "p3-3-scheduled-test",
    cronExpr: "@every_minute",
    prompt: "P3-3 WSL scheduled test ingest",
    enabled: true,
    actionKind: "scheduled_test",
    actionPayload: {
      dbPath,
      outputJson,
      sandbox_id,
      framework: "scheduler-p3-3",
    },
    nextRunAt: Date.now() - 1000,
  });

  const tick = await tickScheduler(store, { dataDir, log: () => {} });
  assert.equal(tick.due, 1);
  assert.equal(tick.fired.length, 1);
  assert.equal(tick.fired[0].status, "ok");

  const dbRaw = JSON.parse(await readFile(dbPath, "utf8"));
  assert.ok(Array.isArray(dbRaw.runs) && dbRaw.runs.length >= 1);
  const last = dbRaw.runs[dbRaw.runs.length - 1];
  assert.equal(last.trigger, "schedule");
  assert.equal(last.taskId, task.id);
  assert.equal(last.sandbox_id, sandbox_id);
  assert.equal(last.framework, "scheduler-p3-3");
  assert.ok(last.passed >= 1);
  assert.equal(last.failed, 0);

  const summary = await getTestSummary(dbPath);
  assert.ok(summary.trend.length >= 1);
  assert.equal(summary.scheduledRunCount, 1);
  assert.ok(summary.lastScheduledRun);
  assert.equal(summary.lastScheduledRun.trigger, "schedule");

  const runs = await store.listRuns(task.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, "ok");

  await store.remove(task.id);
  store.close();

  console.log(`PASS: P3-3 scheduled_test + test_db ingest (sandbox_id=${sandbox_id})`);
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
