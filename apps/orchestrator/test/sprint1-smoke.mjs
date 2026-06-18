// Sprint 1 冒烟：test-automation bundle 安装 + skills/commands/mcp/cli + 卸载可逆。
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  installBundle,
  listBundles,
  uninstallBundle,
  platformBinKey,
} from "../src/bundle/installer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = path.join(here, "..", "..", "..", "bundles", "test-automation");
const monorepoRoot = path.join(here, "..", "..", "..");

async function main() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-ta-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-ta-data-"));
  process.env.OPENWORK_MONOREPO_ROOT = monorepoRoot;
  try {
    const key = platformBinKey();
    console.log(`platform bin key: ${key}`);

    const res = await installBundle({ bundleDir, workspaceRoot, dataDir });
    assert.equal(res.id, "test-automation");
    assert.ok(res.addedMcp.includes("test-db"), "应合并 test-db mcp");
    assert.ok(res.addedMcp.includes("github-actions"), "应合并 github-actions mcp");

    // skills
    for (const skill of ["generate-test-cases", "analyze-failure", "create-regression", "ui-test-assist"]) {
      const p = path.join(workspaceRoot, ".opencode", "skills", skill, "SKILL.md");
      assert.ok(existsSync(p), `技能应存在: ${skill}`);
    }

    // commands（斜杠命令）
    assert.ok(
      existsSync(path.join(workspaceRoot, ".opencode", "commands", "analyze-failure.md")),
      "斜杠命令 analyze-failure 应存在",
    );

    // opencode.json mcp 展开
    const cfg = JSON.parse(await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"));
    const testDb = cfg.mcp["test-db"];
    assert.ok(testDb.command[1]?.includes("test-db-mcp"), "test-db 应指向 monorepo 包");
    assert.equal(
      path.normalize(testDb.environment.OPENWORK_TEST_DB),
      path.normalize(path.join(workspaceRoot, ".openwork", "test-results.json")),
    );

    // cli bin（当前平台有则断言）
    if (res.installedBins?.length) {
      const bin = res.installedBins[0];
      assert.ok(existsSync(bin), "cli bin 应安装到 dataDir/bin");
      await access(bin);
    }

    assert.ok(
      existsSync(path.join(workspaceRoot, ".openwork", "bundle-ui.json")),
      "bundle-ui.json 应存在",
    );
    const ui = JSON.parse(await readFile(path.join(workspaceRoot, ".openwork", "bundle-ui.json"), "utf8"));
    assert.ok(ui.bundles.some((b) => b.id === "test-automation"));
    assert.ok(ui.bundles.find((b) => b.id === "test-automation")?.routes?.includes("/plugins/test-automation"));

    // list
    const list = await listBundles({ dataDir });
    assert.equal(list.length, 1);

    // uninstall
    await uninstallBundle({ id: "test-automation", dataDir });
    assert.ok(!existsSync(path.join(workspaceRoot, ".opencode", "skills", "analyze-failure")));
    const cfg2 = JSON.parse(await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"));
    assert.ok(!cfg2.mcp?.["test-db"]);

    console.log("PASS: Sprint 1 test-automation bundle install/list/uninstall");
  } finally {
    delete process.env.OPENWORK_MONOREPO_ROOT;
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
