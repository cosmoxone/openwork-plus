import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listGuiOperationNdjson } from "../src/index.mjs";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-ndjson-"));
try {
  assert.deepEqual(listGuiOperationNdjson(dataDir), []);

  const logDir = path.join(dataDir, "logs", "gui-operate");
  await mkdir(logDir, { recursive: true });
  const file = path.join(logDir, "operations.ndjson");
  const rows = [
    { ts: "2026-06-18T10:00:00.000Z", tool: "click", appName: "demo", x: 100, y: 200 },
    { ts: "2026-06-18T10:00:01.000Z", tool: "screenshot", displayIndex: 0 },
  ];
  await writeFile(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

  const listed = listGuiOperationNdjson(dataDir);
  assert.equal(listed.length, 2);
  assert.equal(listed[0].tool, "screenshot");
  assert.equal(listed[1].tool, "click");
  assert.equal(listed[1].x, 100);

  console.log("PASS: gui-operate NDJSON list");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
