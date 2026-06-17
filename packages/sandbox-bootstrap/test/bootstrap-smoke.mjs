import assert from "node:assert/strict";
import { bootstrap, readBootstrapState, resolveDataDir } from "../src/index.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-sandbox-"));
try {
  const result = await bootstrap({ dataDir, force: true });
  assert.ok(["wsl", "lima", "native"].includes(result.mode));
  const cached = readBootstrapState(dataDir);
  assert.equal(cached?.mode, result.mode);
  assert.ok(resolveDataDir(dataDir) === path.resolve(dataDir));
  console.log(`PASS: sandbox-bootstrap mode=${result.mode}`);
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
