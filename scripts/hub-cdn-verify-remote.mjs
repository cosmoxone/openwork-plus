#!/usr/bin/env node
/**
 * S2-C11：公网 Hub catalog 远程验收（catalog GET + zip download + sha256）。
 * 可选 --install-smoke：临时 workspace 远程安装 knowledge-mgmt。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function fetchOk(url, label) {
  const res = await fetch(url, { redirect: "follow" });
  assert.equal(res.status, 200, `${label} GET ${url} => ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const catalogUrl = arg("--catalog-url")?.trim();
  if (!catalogUrl) {
    console.error("用法: node scripts/hub-cdn-verify-remote.mjs --catalog-url https://hub.example.com/catalog.json [--bundle-id knowledge-mgmt] [--install-smoke]");
    process.exitCode = 2;
    return;
  }

  const bundleId = arg("--bundle-id") ?? "knowledge-mgmt";
  const installSmoke = process.argv.includes("--install-smoke");
  process.env.OPENWORK_MONOREPO_ROOT = root;

  console.log(`[verify-remote] catalog=${catalogUrl} bundle=${bundleId}`);

  const catalogBuf = await fetchOk(catalogUrl, "catalog");
  const catalog = JSON.parse(catalogBuf.toString("utf8"));
  assert.ok(Array.isArray(catalog.bundles) && catalog.bundles.length > 0, "catalog.bundles 非空");

  const entry = catalog.bundles.find((b) => b.id === bundleId);
  assert.ok(entry, `catalog 缺少 bundle id=${bundleId}`);
  assert.ok(entry.downloadUrl, "downloadUrl 缺失");
  assert.ok(entry.sha256, "sha256 缺失");

  const zipBuf = await fetchOk(entry.downloadUrl, "zip");
  const sha = createHash("sha256").update(zipBuf).digest("hex");
  assert.equal(sha, entry.sha256, "zip sha256 与 catalog 不一致");
  console.log(`  zip OK (${zipBuf.length} bytes, sha256 match)`);

  if (installSmoke) {
    const { installBundleFromCatalog } = await import(
      "../apps/orchestrator/src/bundle/catalog-install.mjs"
    );
    const { uninstallBundle } = await import("../apps/orchestrator/src/bundle/installer.mjs");
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-hub-vr-ws-"));
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-hub-vr-data-"));
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
        bundleId,
        workspaceRoot,
        dataDir,
        builtinCatalogPath: builtinCatalog,
        remoteUrl: catalogUrl,
        preferRemote: true,
      });
      assert.equal(installed.id, bundleId);
      await uninstallBundle({ id: bundleId, dataDir });
      console.log("  install-smoke OK");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
      await rm(dataDir, { recursive: true, force: true });
    }
  }

  console.log("PASS: Hub remote verify", catalogUrl);
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
