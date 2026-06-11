// 冒烟测试：ow bundle install/list/uninstall 全流程（纯 node 内置模块，可直接 `node` 运行）。
// 运行：node apps/orchestrator/test/bundle-smoke.mjs

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  installBundle,
  listBundles,
  uninstallBundle,
} from "../src/bundle/installer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixtures", "minimal-bundle");

async function main() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-data-"));
  try {
    // install
    const res = await installBundle({ bundleDir: fixture, workspaceRoot, dataDir });
    assert.equal(res.id, "minimal-demo");
    assert.deepEqual(res.addedMcp, ["demo-fs"]);

    const skillPath = path.join(workspaceRoot, ".opencode", "skills", "hello", "SKILL.md");
    assert.ok(existsSync(skillPath), "技能 SKILL.md 应被复制到工作区");

    const opencodeJson = path.join(workspaceRoot, "opencode.json");
    const cfg = JSON.parse(await readFile(opencodeJson, "utf8"));
    assert.ok(cfg.mcp && cfg.mcp["demo-fs"], "opencode.json 应包含合并的 mcp server");

    // list
    const list = await listBundles({ dataDir });
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "minimal-demo");

    // duplicate install rejected
    let dup = false;
    try {
      await installBundle({ bundleDir: fixture, workspaceRoot, dataDir });
    } catch {
      dup = true;
    }
    assert.ok(dup, "重复安装应被拒绝");

    // uninstall + reversibility
    await uninstallBundle({ id: "minimal-demo", dataDir });
    assert.ok(!existsSync(skillPath), "卸载后技能文件应被移除");
    const cfg2 = JSON.parse(await readFile(opencodeJson, "utf8"));
    assert.ok(!cfg2.mcp || !cfg2.mcp["demo-fs"], "卸载后 mcp 键应被移除");
    const list2 = await listBundles({ dataDir });
    assert.equal(list2.length, 0);

    console.log("PASS: bundle install/list/uninstall 全流程通过");
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
