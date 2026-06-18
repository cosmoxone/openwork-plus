// computer-use bundle 冒烟：安装后 skills/commands/mcp 指向 gui-operate-mcp。
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
const bundleDir = path.join(here, "..", "..", "..", "bundles", "computer-use");
const monorepoRoot = path.join(here, "..", "..", "..");
const guiServer = path.join(monorepoRoot, "packages", "gui-operate-mcp", "dist", "server.js");

async function main() {
  if (!existsSync(guiServer)) {
    console.error("SKIP: 请先构建 gui-operate-mcp（cd packages/gui-operate-mcp && npm run build）");
    process.exit(0);
  }

  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-cu-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-cu-data-"));
  process.env.OPENWORK_MONOREPO_ROOT = monorepoRoot;
  try {
    const res = await installBundle({ bundleDir, workspaceRoot, dataDir });
    assert.equal(res.id, "computer-use");
    assert.ok(res.addedMcp.includes("gui-operate"));

    for (const skill of ["browser-automation", "desktop-recorder", "error-recovery"]) {
      assert.ok(
        existsSync(path.join(workspaceRoot, ".opencode", "skills", skill, "SKILL.md")),
        `skill ${skill}`,
      );
    }

    assert.ok(
      existsSync(path.join(workspaceRoot, ".opencode", "commands", "gui-screenshot.md")),
    );

    const cfg = JSON.parse(await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"));
    const gui = cfg.mcp["gui-operate"];
    assert.ok(gui.command.some((p) => String(p).includes("gui-operate-mcp")), "应指向 gui-operate-mcp");

    const uiManifest = JSON.parse(
      await readFile(path.join(workspaceRoot, ".openwork", "bundle-ui.json"), "utf8"),
    );
    assert.ok(uiManifest.bundles.some((b) => b.id === "computer-use"), "bundle-ui.json 应含 computer-use");
    assert.ok(uiManifest.bundles.find((b) => b.id === "computer-use")?.routes?.includes("/plugins/rpa"));

    assert.ok(existsSync(path.join(dataDir, "sandbox-bootstrap.json")), "preinstall 应初始化沙箱状态");

    assert.equal((await listBundles({ dataDir })).length, 1);

    await uninstallBundle({ id: "computer-use", dataDir });
    assert.ok(!existsSync(path.join(workspaceRoot, ".opencode", "skills", "browser-automation")));

    console.log("PASS: computer-use bundle install/list/uninstall");
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
