// Industry Bundle catalog 合并与 fallback 冒烟。
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import {
  compareSemver,
  mergeCatalogView,
  pickLatestById,
  fetchRemoteCatalogWithFallback,
  readCachedRemoteCatalog,
} from "../src/bundle/catalog.mjs";

async function main() {
  assert.equal(compareSemver("0.2.0", "0.1.9"), 1);
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);

  const merged = pickLatestById([
    { id: "computer-use", version: "0.1.0", source: "builtin" },
    { id: "computer-use", version: "0.2.0", source: "remote" },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].version, "0.2.0");

  const view = mergeCatalogView({
    builtin: {
      bundles: [{ id: "computer-use", name: "Computer Use", version: "0.2.0", description: "RPA" }],
    },
    remote: { bundles: [] },
    installed: [{ id: "computer-use", version: "0.1.0", installedAt: "2026-01-01T00:00:00Z" }],
  });
  const entry = view.find((b) => b.id === "computer-use");
  assert.ok(entry);
  assert.equal(entry.status, "update_available");
  assert.equal(entry.updateAvailable, true);

  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-catalog-"));
  try {
    const cacheDir = path.join(dataDir, "bundle-catalog");
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      path.join(cacheDir, "remote.json"),
      JSON.stringify({
        schemaVersion: "1.0.0",
        bundles: [{ id: "test-automation", name: "Test", version: "0.1.0" }],
      }),
    );

    const cached = await readCachedRemoteCatalog(dataDir);
    assert.equal(cached.bundles.length, 1);

    const fallback = await fetchRemoteCatalogWithFallback("http://127.0.0.1:1/unreachable", dataDir);
    assert.equal(fallback.stale, true);
    assert.equal(fallback.catalog.bundles[0].id, "test-automation");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }

  console.log("PASS: bundle catalog smoke");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
