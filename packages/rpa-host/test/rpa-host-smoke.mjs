import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getRpaStatus,
  listOperationHistory,
  listScreenshots,
  resolveDataDir,
  setAutomationEnabled,
} from "../src/index.mjs";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-rpa-"));
try {
  assert.equal(resolveDataDir(dataDir), path.resolve(dataDir));
  const status = getRpaStatus(dataDir);
  assert.equal(status.screenshotCount, 0);
  assert.deepEqual(listScreenshots(dataDir), []);
  assert.deepEqual(listOperationHistory(dataDir), []);
  const auto = setAutomationEnabled(dataDir, true);
  assert.equal(auto.enabled, true);
  assert.equal(getRpaStatus(dataDir).automationEnabled, true);
  console.log("PASS: rpa-host status/lists/automation");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
