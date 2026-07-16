import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TaskSchedulerStore, tickScheduler } from "../src/index.mjs";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-sched-"));

try {
  const store = new TaskSchedulerStore({ dataDir });

  const task = await store.add({
    title: "smoke-minute",
    cronExpr: "@every_minute",
    prompt: "scheduler smoke",
    enabled: true,
    actionKind: "test_db_record",
    actionPayload: { dbPath: path.join(dataDir, "test-results.json") },
    nextRunAt: Date.now() - 1000,
  });
  assert.ok(task.id);
  assert.equal(task.enabled, true);
  assert.equal(task.cronExpr, "* * * * *");

  const listed = await store.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].cronExpr, "* * * * *");
  assert.equal(listed[0].enabled, true);

  const tick = await tickScheduler(store, {
    dataDir,
    log: () => {},
  });
  assert.equal(tick.due, 1);
  assert.equal(tick.fired.length, 1);
  assert.equal(tick.fired[0].status, "ok");

  const runs = await store.listRuns(task.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].trigger, "schedule");

  const dbRaw = JSON.parse(await readFile(path.join(dataDir, "test-results.json"), "utf8"));
  assert.ok(Array.isArray(dbRaw.runs) && dbRaw.runs.length >= 1);
  assert.equal(dbRaw.runs[0].trigger, "schedule");

  assert.ok(await store.remove(task.id));
  assert.equal((await store.list()).length, 0);
  store.close();

  console.log("PASS: task-scheduler SQLite CRUD + tick + test_db_record");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
