// test-db 存储层冒烟
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { TestDb } from "../src/store.mjs";

const dir = await mkdtemp(path.join(os.tmpdir(), "testdb-"));
const file = path.join(dir, "test-results.json");
try {
  const db = new TestDb(file);
  await db.recordRun({
    framework: "jest",
    path: "./tests",
    passed: 2,
    failed: 1,
    cases: [
      { name: "ok", status: "passed" },
      { name: "bad", status: "failed", message: "assertion" },
    ],
  });
  const fails = await db.listFailures({ sinceHours: 24 });
  assert.equal(fails.length, 1);
  assert.equal(fails[0].failed, 1);
  const trend = await db.getTrend(7);
  assert.ok(trend.length >= 1);
  console.log("PASS: test-db store");
} finally {
  await rm(dir, { recursive: true, force: true });
}
