// Hub 安装 knowledge-mgmt + postuninstall 清理向量索引。
import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { installBundleFromCatalog } from "../src/bundle/catalog-install.mjs";
import { listBundles, uninstallBundle } from "../src/bundle/installer.mjs";
import { knowledgeDbPath } from "../../../packages/knowledge-wiki/src/db-path.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..", "..");
const hubDir = path.join(root, ".dev", "bundle-hub");
const port = 9123;

function runPrepare() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "prepare-bundle-hub-dev.mjs")], {
      stdio: "inherit",
      env: { ...process.env, OPENWORK_MONOREPO_ROOT: root },
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`prepare exit ${code}`))));
  });
}

function startServerIfNeeded() {
  return new Promise((resolve) => {
    const probe = http.get(`http://127.0.0.1:${port}/catalog.json`, (res) => {
      res.resume();
      resolve(null);
    });
    probe.on("error", async () => {
      const server = http.createServer(async (req, res) => {
        const rel = (req.url ?? "/").split("?")[0].replace(/^\//, "");
        const file = path.join(hubDir, rel);
        if (!file.startsWith(hubDir) || !existsSync(file)) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        const body = await readFile(file);
        res.writeHead(200, {
          "Content-Type": rel.endsWith(".json") ? "application/json" : "application/zip",
        });
        res.end(body);
      });
      server.on("error", () => resolve(null));
      server.listen(port, "127.0.0.1", () => resolve(server));
    });
  });
}

async function main() {
  process.env.OPENWORK_MONOREPO_ROOT = root;
  await runPrepare();
  /** @type {import('node:http').Server | null} */
  const server = await startServerIfNeeded();

  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-km-hub-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-km-data-"));
  const remoteUrl = `http://127.0.0.1:${port}/catalog.json`;
  const builtinCatalog = path.join(
    root,
    "apps",
    "desktop",
    "src-tauri",
    "resources",
    "bundles",
    "catalog.builtin.json",
  );

  try {
    const result = await installBundleFromCatalog({
      bundleId: "knowledge-mgmt",
      workspaceRoot,
      dataDir,
      builtinCatalogPath: builtinCatalog,
      remoteUrl,
    });
    assert.equal(result.id, "knowledge-mgmt");
    assert.ok(existsSync(path.join(workspaceRoot, ".openwork", "knowledge", "AGENTS.md")));

    const { initKnowledgeLayout } = await import("../../../packages/knowledge-wiki/src/index.mjs");
    await initKnowledgeLayout(workspaceRoot);
    const db = knowledgeDbPath(workspaceRoot);
    const { openKnowledgeDb } = await import("../../../packages/knowledge-wiki/src/index-sync.mjs");
    await openKnowledgeDb(workspaceRoot).indexDocument({
      path: "wiki/test.md",
      title: "test",
      content: "hub install smoke",
    });
    assert.ok(existsSync(db));

    await uninstallBundle({ id: "knowledge-mgmt", dataDir });
    const remaining = await listBundles({ dataDir });
    assert.equal(remaining.length, 0);

    console.log("PASS: knowledge-mgmt hub install + postuninstall clear-index hook");
  } finally {
    server?.close();
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
