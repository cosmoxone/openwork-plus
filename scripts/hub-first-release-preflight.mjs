#!/usr/bin/env node
/**
 * S2-C11 首发前自动化预检（无需公网 CDN）：
 * verify → build → publish-remote-catalog → 本地 HTTP 验 catalog/zip → 远程 catalog 安装 smoke。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

function runNode(scriptRel, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, scriptRel), ...args], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, OPENWORK_MONOREPO_ROOT: root },
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${scriptRel} exit ${code}`))));
  });
}

function startStaticServer(dir, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const rel = decodeURIComponent((req.url ?? "/").split("?")[0].replace(/^\//, ""));
      const file = path.resolve(dir, rel);
      if (!file.startsWith(path.resolve(dir)) || !existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const body = await readFile(file);
      const ct = rel.endsWith(".json") ? "application/json" : "application/zip";
      res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-store" });
      res.end(body);
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function fetchOk(url) {
  const res = await fetch(url);
  assert.equal(res.status, 200, `GET ${url} => ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const manifest = JSON.parse(
    await readFile(path.join(root, "bundles", "knowledge-mgmt", "bundle.json"), "utf8"),
  );
  const version = manifest.version;
  const zipName = `knowledge-mgmt-${version}.zip`;
  const zipDir = path.join(root, "dist", "bundle-hub");
  const catalogOut = path.join(zipDir, "catalog.remote.json");
  const port = 19123;
  const cdnBase = `http://127.0.0.1:${port}/`;

  console.log(`[preflight] knowledge-mgmt@${version}`);

  await runNode("scripts/verify-bundle-hub-release.mjs", [
    "--bundle",
    "knowledge-mgmt",
    "--version",
    version,
  ]);

  await runNode("scripts/build-hub-bundles.mjs");

  const zipPath = path.join(zipDir, zipName);
  assert.ok(existsSync(zipPath), `missing ${zipPath}`);

  const { readdir, unlink } = await import("node:fs/promises");
  for (const file of await readdir(zipDir)) {
    if (file.endsWith(".zip") && file !== zipName) {
      await unlink(path.join(zipDir, file));
    }
  }

  await runNode("scripts/publish-remote-catalog.mjs", [
    "--zip-dir",
    zipDir,
    "--cdn-base",
    cdnBase,
    "--output",
    catalogOut,
    "--featured-ids",
    "knowledge-mgmt",
  ]);

  const { writeFile: writeFileFs } = await import("node:fs/promises");
  await writeFileFs(path.join(zipDir, "catalog.json"), await readFile(catalogOut, "utf8"), "utf8");

  const catalog = JSON.parse(await readFile(catalogOut, "utf8"));
  const entry = catalog.bundles.find((b) => b.id === "knowledge-mgmt");
  assert.ok(entry, "catalog missing knowledge-mgmt");
  assert.equal(entry.version, version);
  assert.ok(entry.downloadUrl?.endsWith(zipName));
  assert.ok(entry.sha256, "catalog entry needs sha256");

  const zipBytes = await readFile(zipPath);
  const sha = createHash("sha256").update(zipBytes).digest("hex");
  assert.equal(entry.sha256, sha, "sha256 mismatch between zip and catalog");

  /** @type {import('node:http').Server | null} */
  let server = null;
  try {
    server = await startStaticServer(zipDir, port);
    const catalogBuf = await fetchOk(`${cdnBase}catalog.json`);
    const remoteCatalog = JSON.parse(catalogBuf.toString("utf8"));
    assert.ok(remoteCatalog.bundles?.length);

    const dl = remoteCatalog.bundles.find((b) => b.id === "knowledge-mgmt")?.downloadUrl;
    assert.ok(dl, "downloadUrl missing");
    const downloaded = await fetchOk(dl);
    assert.equal(downloaded.length, zipBytes.length);

    const { mkdtemp, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const { installBundleFromCatalog } = await import(
      "../apps/orchestrator/src/bundle/catalog-install.mjs"
    );
    const { uninstallBundle } = await import("../apps/orchestrator/src/bundle/installer.mjs");
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-hub-pf-ws-"));
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-hub-pf-data-"));
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
      const installed = await installBundleFromCatalog({
        bundleId: "knowledge-mgmt",
        workspaceRoot,
        dataDir,
        builtinCatalogPath: builtinCatalog,
        remoteUrl: `${cdnBase}catalog.json`,
        preferRemote: true,
      });
      assert.equal(installed.id, "knowledge-mgmt");
      await uninstallBundle({ id: "knowledge-mgmt", dataDir });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
      await rm(dataDir, { recursive: true, force: true });
    }

    console.log("PASS: Hub first-release preflight (build + catalog + HTTP + catalog install)");
    console.log("NEXT: upload zip + deploy catalog.json to your CDN (docs/17 §8.4 C–G)");
  } finally {
    if (server) await new Promise((r) => server.close(r));
  }
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
