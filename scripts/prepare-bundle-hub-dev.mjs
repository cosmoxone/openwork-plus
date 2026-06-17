#!/usr/bin/env node
/**
 * 准备本地 Bundle Hub 静态目录（computer-use@0.2.0 用于远程更新测试）。
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packBundle, catalogEntryFromZip } from "../apps/orchestrator/src/bundle/pack.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const outDir = path.join(root, ".dev", "bundle-hub");
const port = Number(process.env.BUNDLE_HUB_DEV_PORT ?? 9123);
const baseUrl = `http://127.0.0.1:${port}`;

async function stageBumpedBundle(id, nextVersion) {
  const src = path.join(root, "bundles", id);
  const stage = path.join(outDir, ".stage", id);
  await rm(stage, { recursive: true, force: true });
  await mkdir(path.dirname(stage), { recursive: true });
  await cp(src, stage, { recursive: true });
  const manifestPath = path.join(stage, "bundle.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = nextVersion;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  process.env.OPENWORK_MONOREPO_ROOT = root;
  const zipName = `${id}-${nextVersion}.zip`;
  const zipPath = path.join(outDir, zipName);
  await packBundle({ bundleDir: stage, output: zipPath });
  return zipName;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const zipName = await stageBumpedBundle("computer-use", "0.2.0");
  const zipPath = path.join(outDir, zipName);
  const entry = await catalogEntryFromZip(zipPath, {
    downloadUrl: `${baseUrl}/${zipName}`,
  });

  const catalog = {
    schemaVersion: "1.0.0",
    source: "dev-local",
    generatedAt: new Date().toISOString(),
    bundles: [
      {
        ...entry,
        path: zipName,
        featured: true,
      },
    ],
  };

  await writeFile(path.join(outDir, "catalog.json"), JSON.stringify(catalog, null, 2));
  console.log(`prepared dev hub at ${outDir}`);
  console.log(`catalog: ${baseUrl}/catalog.json`);
  console.log(`bundle:  ${baseUrl}/${zipName} (${entry.version})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
