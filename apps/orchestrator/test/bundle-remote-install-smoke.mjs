// 阶段 C：远程 catalog + downloadUrl 下载安装 + sha256 校验。
import http from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { installBundle, listBundles, uninstallBundle } from "../src/bundle/installer.mjs";
import { installBundleFromCatalog } from "../src/bundle/catalog-install.mjs";
import { downloadBundleZip } from "../src/bundle/download.mjs";
import { mergeCatalogView, readCatalogFile } from "../src/bundle/catalog.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..", "..");
const hubDir = path.join(root, ".dev", "bundle-hub");
const builtinCatalog = path.join(
  root,
  "apps",
  "desktop",
  "src-tauri",
  "resources",
  "bundles",
  "catalog.builtin.json",
);
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

function startServer() {
  return new Promise((resolve, reject) => {
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
    server.on("error", (err) => {
      if (/** @type {NodeJS.ErrnoException} */ (err).code === "EADDRINUSE") {
        resolve(null);
        return;
      }
      reject(err);
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  if (!existsSync(path.join(root, "apps", "desktop", "src-tauri", "resources", "bundles", "computer-use-0.1.0.zip"))) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, "scripts", "build-builtin-bundles.mjs")], {
        stdio: "inherit",
        cwd: root,
      });
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`build exit ${code}`))));
    });
  }

  await runPrepare();
  /** @type {import("node:http").Server | null} */
  const server = await startServer();
  const remoteUrl = `http://127.0.0.1:${port}/catalog.json`;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-remote-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-remote-data-"));
  process.env.OPENWORK_MONOREPO_ROOT = root;

  try {
    const builtinZip = path.join(
      root,
      "apps",
      "desktop",
      "src-tauri",
      "resources",
      "bundles",
      "computer-use-0.1.0.zip",
    );
    await installBundle({ bundleDir: builtinZip, workspaceRoot, dataDir });
    let installed = await listBundles({ dataDir });
    assert.equal(installed[0].version, "0.1.0");

    const builtin = await readCatalogFile(builtinCatalog);
    const remote = await readCatalogFile(path.join(hubDir, "catalog.json"));
    const view = mergeCatalogView({ builtin, remote, installed });
    const entry = view.find((b) => b.id === "computer-use");
    assert.ok(entry?.updateAvailable, "remote 0.2.0 should trigger updateAvailable");

    const updated = await installBundleFromCatalog({
      bundleId: "computer-use",
      workspaceRoot,
      dataDir,
      builtinCatalogPath: builtinCatalog,
      remoteUrl,
      replace: true,
    });
    assert.equal(updated.sourceKind, "remote");
    assert.equal(updated.version, "0.2.0");

    installed = await listBundles({ dataDir });
    assert.equal(installed[0].version, "0.2.0");

    const badCatalog = JSON.parse(await readFile(path.join(hubDir, "catalog.json"), "utf8"));
    badCatalog.bundles[0].sha256 = "0".repeat(64);
    const badUrl = `http://127.0.0.1:${port}/catalog-bad.json`;
    await rm(path.join(hubDir, "catalog-bad.json"), { force: true });
    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(path.join(hubDir, "catalog-bad.json"), JSON.stringify(badCatalog)),
    );

    let shaFailed = false;
    try {
      await downloadBundleZip({
        downloadUrl: badCatalog.bundles[0].downloadUrl,
        bundleId: "computer-use",
        version: "0.2.0-bad",
        expectedSha256: badCatalog.bundles[0].sha256,
        dataDir,
        force: true,
      });
    } catch (e) {
      shaFailed = /sha256 mismatch/.test(String(e));
    }
    assert.equal(shaFailed, true, "bad sha256 should fail");

    await uninstallBundle({ id: "computer-use", dataDir });
    console.log("PASS: bundle remote install (phase C)");
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
