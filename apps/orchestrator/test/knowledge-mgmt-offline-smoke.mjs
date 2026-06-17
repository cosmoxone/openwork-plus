// Hub zip 离线安装：无 OPENWORK_MONOREPO_ROOT，vendor MCP + postuninstall 可用。
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { installBundle } from "../src/bundle/installer.mjs";
import { KnowledgeDb } from "../../../packages/sqlite-vec-mcp/src/db.mjs";
import { knowledgeDbPath } from "../../../packages/knowledge-wiki/src/db-path.mjs";
import { bundleRuntimeDir } from "../src/bundle/vendor-stage.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..", "..");

function runBuildHub() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "build-hub-bundles.mjs")], {
      stdio: "inherit",
      env: { ...process.env },
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build-hub exit ${code}`))));
  });
}

async function main() {
  const savedMonorepo = process.env.OPENWORK_MONOREPO_ROOT;
  delete process.env.OPENWORK_MONOREPO_ROOT;

  await runBuildHub();

  const manifest = JSON.parse(
    await readFile(path.join(root, "bundles", "knowledge-mgmt", "bundle.json"), "utf8"),
  );
  const zipPath = path.join(root, "dist", "bundle-hub", `knowledge-mgmt-${manifest.version}.zip`);
  assert.ok(existsSync(zipPath), `missing hub zip: ${zipPath}`);

  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-km-offline-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-km-offline-data-"));

  try {
    const res = await installBundle({ bundleDir: zipPath, workspaceRoot, dataDir });
    assert.equal(res.id, "knowledge-mgmt");

    const runtimeRoot = bundleRuntimeDir(dataDir, "knowledge-mgmt");
    assert.ok(existsSync(path.join(runtimeRoot, "vendor", "sqlite-vec-mcp", "bin", "sqlite-vec-mcp.mjs")));
    assert.ok(existsSync(path.join(runtimeRoot, "vendor", "knowledge-wiki", "src", "index-sync.mjs")));

    const cfg = JSON.parse(await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"));
    const rag = cfg.mcp["sqlite-vec-rag"];
    assert.ok(rag.args[0].includes("bundles"), "MCP 应指向 dataDir/bundles vendor");
    assert.ok(rag.args[0].includes("sqlite-vec-mcp"), "MCP 应使用 vendored sqlite-vec-mcp");
    assert.equal(path.normalize(rag.args[rag.args.length - 1]), path.normalize(knowledgeDbPath(workspaceRoot)));

    const db = new KnowledgeDb(knowledgeDbPath(workspaceRoot));
    await db.indexDocument({
      path: "wiki/offline.md",
      title: "Offline",
      content: "Hub zip vendor smoke test for knowledge-mgmt.",
    });
    const hits = await db.semanticSearch({ query: "vendor smoke", top_k: 1 });
    assert.ok(hits.results.length >= 1);

    const { uninstallBundle } = await import("../src/bundle/installer.mjs");
    await uninstallBundle({ id: "knowledge-mgmt", dataDir });
    assert.ok(!existsSync(knowledgeDbPath(workspaceRoot)), "uninstall 应清除 knowledge.db");
    assert.ok(!existsSync(runtimeRoot), "uninstall 应移除 bundle runtime 目录");

    console.log("PASS: knowledge-mgmt offline hub zip install (no monorepo)");
  } finally {
    if (savedMonorepo) process.env.OPENWORK_MONOREPO_ROOT = savedMonorepo;
    else delete process.env.OPENWORK_MONOREPO_ROOT;
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
