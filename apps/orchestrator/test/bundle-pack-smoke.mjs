// bundle pack + zip install 冒烟。
import { mkdtemp, rm, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { packBundle } from "../src/bundle/pack.mjs";
import { installBundle, uninstallBundle } from "../src/bundle/installer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = path.join(here, "..", "..", "..", "bundles", "computer-use");
const monorepoRoot = path.join(here, "..", "..", "..");

async function main() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-pack-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-pack-data-"));
  const zipOut = path.join(os.tmpdir(), `ow-pack-${Date.now()}.zip`);
  process.env.OPENWORK_MONOREPO_ROOT = monorepoRoot;
  try {
    const packed = await packBundle({ bundleDir, output: zipOut });
    assert.ok(existsSync(packed.output));
    await access(packed.output);

    const res = await installBundle({ bundleDir: packed.output, workspaceRoot, dataDir });
    assert.equal(res.id, "computer-use");

    await uninstallBundle({ id: "computer-use", dataDir });
    console.log("PASS: bundle pack + zip install");
  } finally {
    delete process.env.OPENWORK_MONOREPO_ROOT;
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
    if (existsSync(zipOut)) await rm(zipOut, { force: true });
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
