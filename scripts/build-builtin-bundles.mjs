#!/usr/bin/env node
/**
 * 将 monorepo bundles/ 打包到 Tauri resources，并生成 catalog.builtin.json。
 *
 * 分发策略见 docs/15-industry-bundle-catalog-policy.md
 * - 内置：MVP 核心场景，离线可装
 * - 非内置（如 knowledge-mgmt）：仅 Hub downloadUrl
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packBundle, catalogEntryFromZip } from "../apps/orchestrator/src/bundle/pack.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const bundlesSrc = path.join(root, "bundles");
const outDir = path.join(root, "apps", "desktop", "src-tauri", "resources", "bundles");

/** 内置 Industry Bundle（勿随意扩大；见 docs/15-industry-bundle-catalog-policy.md） */
const BUNDLE_IDS = ["computer-use", "test-automation"];

async function main() {
  await mkdir(outDir, { recursive: true });

  /** @type {any[]} */
  const entries = [];

  for (const id of BUNDLE_IDS) {
    const src = path.join(bundlesSrc, id);
    if (!existsSync(path.join(src, "bundle.json"))) {
      console.warn(`skip: ${id} (no bundle.json)`);
      continue;
    }
    const { output, version } = await packBundle({ bundleDir: src });
    const destName = path.basename(output);
    const dest = path.join(outDir, destName);
    if (path.resolve(output) !== path.resolve(dest)) {
      await rm(dest, { force: true });
      const { rename } = await import("node:fs/promises");
      await rename(output, dest);
    }
    const entry = await catalogEntryFromZip(dest);
    entries.push({
      ...entry,
      path: destName,
      featured: true,
    });
    console.log(`packed ${id}@${version} -> ${destName}`);
  }

  const catalog = {
    schemaVersion: "1.0.0",
    source: "builtin",
    generatedAt: new Date().toISOString(),
    bundles: entries,
  };

  await writeFile(path.join(outDir, "catalog.builtin.json"), JSON.stringify(catalog, null, 2));
  console.log(`wrote catalog.builtin.json (${entries.length} bundles)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
