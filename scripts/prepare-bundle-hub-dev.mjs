#!/usr/bin/env node
/**
 * 准备本地 Bundle Hub：computer-use@0.2.0（更新测试）+ knowledge-mgmt（Hub 包）。
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

async function stageBundle(id, versionOverride) {
  const src = path.join(root, "bundles", id);
  const stage = path.join(outDir, ".stage", id);
  await rm(stage, { recursive: true, force: true });
  await mkdir(path.dirname(stage), { recursive: true });
  await cp(src, stage, { recursive: true });
  if (versionOverride) {
    const manifestPath = path.join(stage, "bundle.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.version = versionOverride;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }
  process.env.OPENWORK_MONOREPO_ROOT = root;
  const manifest = JSON.parse(await readFile(path.join(stage, "bundle.json"), "utf8"));
  const zipName = `${id}-${manifest.version}.zip`;
  const zipPath = path.join(outDir, zipName);
  await packBundle({ bundleDir: stage, output: zipPath });
  return { zipName, zipPath, version: manifest.version };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  /** @type {any[]} */
  const bundles = [];

  const cu = await stageBundle("computer-use", "0.2.0");
  bundles.push({
    ...(await catalogEntryFromZip(cu.zipPath, { downloadUrl: `${baseUrl}/${cu.zipName}` })),
    path: cu.zipName,
    featured: true,
  });

  if (existsSync(path.join(root, "bundles", "knowledge-mgmt", "bundle.json"))) {
    const km = await stageBundle("knowledge-mgmt");
    bundles.push({
      ...(await catalogEntryFromZip(km.zipPath, { downloadUrl: `${baseUrl}/${km.zipName}` })),
      path: km.zipName,
      featured: true,
    });
    console.log(`bundle:  ${baseUrl}/${km.zipName} (${km.version})`);
  }

  const catalog = {
    schemaVersion: "1.0.0",
    source: "dev-local",
    generatedAt: new Date().toISOString(),
    bundles,
  };

  await writeFile(path.join(outDir, "catalog.json"), JSON.stringify(catalog, null, 2));
  console.log(`prepared dev hub at ${outDir}`);
  console.log(`catalog: ${baseUrl}/catalog.json`);
  console.log(`bundle:  ${baseUrl}/${cu.zipName} (${cu.version})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
