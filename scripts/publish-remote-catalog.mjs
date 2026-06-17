#!/usr/bin/env node
/**
 * 从已打包 zip 生成远程 Hub 用的 catalog.json。
 *
 * 用法:
 *   node scripts/publish-remote-catalog.mjs \
 *     --zip-dir apps/desktop/src-tauri/resources/bundles \
 *     --cdn-base https://hub.openwork.ai/bundles/
 *
 * 可选:
 *   --output dist/bundle-catalog/catalog.json
 *   --source remote
 */
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogEntryFromZip } from "../apps/orchestrator/src/bundle/pack.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      flags[key] = argv[i + 1] ?? "";
      i++;
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const zipDir = path.resolve(flags["zip-dir"] ?? path.join(here, "..", "apps", "desktop", "src-tauri", "resources", "bundles"));
  const cdnBase = (flags["cdn-base"] ?? "").trim();
  const output = path.resolve(
    flags.output ?? path.join(here, "..", "dist", "bundle-catalog", "catalog.json"),
  );
  const source = flags.source ?? "remote";

  if (!existsSync(zipDir)) {
    console.error(`zip-dir not found: ${zipDir}`);
    process.exit(1);
  }
  if (!cdnBase) {
    console.error("--cdn-base required (HTTPS prefix ending with /), e.g. https://hub.openwork.ai/bundles/");
    process.exit(1);
  }
  const base = cdnBase.endsWith("/") ? cdnBase : `${cdnBase}/`;

  const files = (await readdir(zipDir)).filter((f) => f.endsWith(".zip")).sort();
  if (!files.length) {
    console.error(`no .zip in ${zipDir}; run: node scripts/build-builtin-bundles.mjs`);
    process.exit(1);
  }

  /** @type {any[]} */
  const bundles = [];
  for (const file of files) {
    const zipPath = path.join(zipDir, file);
    const entry = await catalogEntryFromZip(zipPath, {
      downloadUrl: `${base}${file}`,
    });
    bundles.push({
      ...entry,
      path: file,
      featured: entry.id === "computer-use" || entry.id === "test-automation",
    });
    console.log(`catalog entry: ${entry.id}@${entry.version} -> ${base}${file}`);
  }

  const catalog = {
    schemaVersion: "1.0.0",
    source,
    generatedAt: new Date().toISOString(),
    bundles,
  };

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(catalog, null, 2));
  console.log(`wrote ${output} (${bundles.length} bundles)`);
  console.log(`deploy: upload catalog.json + zip files to ${base}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
