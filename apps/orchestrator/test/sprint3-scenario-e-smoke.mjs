// Sprint 3 场景 E 冒烟：sandbox-bootstrap + rpa-host HTTP + computer-use preinstall。
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { bootstrap, readBootstrapState } from "../../../packages/sandbox-bootstrap/src/index.mjs";
import { getRpaStatus, setAutomationEnabled } from "../../../packages/rpa-host/src/index.mjs";
import { startHttpServer } from "../../../packages/host-api-adapter/src/http-adapter.mjs";
import { installBundle, uninstallBundle } from "../src/bundle/installer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(here, "..", "..", "..");
const bundleDir = path.join(monorepoRoot, "bundles", "computer-use");
const guiServer = path.join(monorepoRoot, "packages", "gui-operate-mcp", "dist", "server.js");

async function main() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-s3e-data-"));
  try {
    const boot = await bootstrap({ dataDir, force: true });
    assert.ok(["wsl", "lima", "native"].includes(boot.mode));
    assert.ok(readBootstrapState(dataDir)?.mode === boot.mode);

    setAutomationEnabled(dataDir, true);
    assert.equal(getRpaStatus(dataDir).automationEnabled, true);

    const { server, port } = await startHttpServer({ port: 0, host: "127.0.0.1" });
    const addr = server.address();
    const listenPort = typeof addr === "object" && addr ? addr.port : port;
    const base = `http://127.0.0.1:${listenPort}`;

    const statusRes = await fetch(`${base}/api/rpa/status`);
    assert.equal(statusRes.status, 200);
    const statusBody = await statusRes.json();
    assert.ok(statusBody.result);

    server.close();

    if (!existsSync(guiServer)) {
      console.error("SKIP: gui-operate-mcp 未构建，跳过 bundle 安装段");
      console.log("PASS: Sprint 3 scenario E (sandbox + rpa HTTP partial)");
      return;
    }

    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-s3e-ws-"));
    process.env.OPENWORK_MONOREPO_ROOT = monorepoRoot;
    try {
      const res = await installBundle({ bundleDir, workspaceRoot, dataDir });
      assert.equal(res.id, "computer-use");
      assert.ok(existsSync(path.join(dataDir, "sandbox-bootstrap.json")), "preinstall 应写入 sandbox 状态");

      for (const skill of ["browser-automation", "desktop-recorder", "error-recovery"]) {
        assert.ok(
          existsSync(path.join(workspaceRoot, ".opencode", "skills", skill, "SKILL.md")),
          `skill ${skill}`,
        );
      }

      await uninstallBundle({ id: "computer-use", dataDir });
      await rm(workspaceRoot, { recursive: true, force: true });
    } finally {
      delete process.env.OPENWORK_MONOREPO_ROOT;
    }

    console.log("PASS: Sprint 3 scenario E (sandbox-bootstrap + rpa-host + computer-use preinstall)");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
