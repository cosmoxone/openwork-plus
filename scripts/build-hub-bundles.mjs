#!/usr/bin/env node
/**
 * 打包 Hub 专用 Industry Bundle（非内置）到 dist/bundle-hub。
 * 见 docs/15-industry-bundle-catalog-policy.md
 */
import { mkdir, writeFile, rm, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packBundle, catalogEntryFromZip } from "../apps/orchestrator/src/bundle/pack.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const bundlesSrc = path.join(root, "bundles");
const outDir = path.join(root, "dist", "bundle-hub");

/** Hub 远程分发 bundle（不打进桌面安装包） */
const HUB_BUNDLE_IDS = ["knowledge-mgmt"];

async function main() {
  await mkdir(outDir, { recursive: true });
  /** @type {any[]} */
  const entries = [];

  for (const id of HUB_BUNDLE_IDS) {
    const src = path.join(bundlesSrc, id);
    if (!existsSync(path.join(src, "bundle.json"))) {
      console.warn(`skip: ${id}`);
      continue;
    }
    const { output, version } = await packBundle({ bundleDir: src });
    const destName = path.basename(output);
    const dest = path.join(outDir, destName);
    if (path.resolve(output) !== path.resolve(dest)) {
      await rm(dest, { force: true });
      await rename(output, dest);
    }
    const entry = await catalogEntryFromZip(dest);
    entries.push({
      ...entry,
      path: destName,
      featured: id === "knowledge-mgmt",
    });
    console.log(`hub packed ${id}@${version} -> ${destName}`);
  }

  const catalog = {
    schemaVersion: "1.0.0",
    source: "hub",
    generatedAt: new Date().toISOString(),
    bundles: entries,
  };
  await writeFile(path.join(outDir, "catalog.json"), JSON.stringify(catalog, null, 2));
  console.log(`wrote ${path.join(outDir, "catalog.json")} (${entries.length} bundles)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
