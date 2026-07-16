// 将 monorepo packages 注入 bundle vendor（Hub zip 离线运行）。
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { copyTreeDeref } from "./copy-tree-deref.mjs";

/** @param {string} bundleRoot bundles/knowledge-mgmt */
export function monorepoRootFromBundle(bundleRoot) {
  return path.resolve(bundleRoot, "..", "..");
}

/**
 * @param {string} vendorRoot 目标 vendor/ 目录
 * @param {string} repoRoot monorepo 根
 */
export async function stageKnowledgeMgmtVendor(vendorRoot, repoRoot) {
  await rm(vendorRoot, { recursive: true, force: true });
  await mkdir(vendorRoot, { recursive: true });

  const copyTree = copyTreeDeref;

  const sqliteSrc = path.join(repoRoot, "packages", "sqlite-vec-mcp");
  const sqliteDest = path.join(vendorRoot, "sqlite-vec-mcp");
  for (const item of ["src", "bin", "package.json"]) {
    await copyTree(path.join(sqliteSrc, item), path.join(sqliteDest, item));
  }
  const sqliteNm = path.join(sqliteSrc, "node_modules");
  if (existsSync(sqliteNm)) {
    await copyTree(sqliteNm, path.join(sqliteDest, "node_modules"));
  }

  const wikiSrc = path.join(repoRoot, "packages", "knowledge-wiki");
  const wikiDest = path.join(vendorRoot, "knowledge-wiki");
  for (const item of ["src", "bin", "templates"]) {
    await copyTree(path.join(wikiSrc, item), path.join(wikiDest, item));
  }
}

/** @param {string} dataDir @param {string} bundleId */
export function bundleRuntimeDir(dataDir, bundleId) {
  return path.join(dataDir, "bundles", bundleId);
}

/**
 * 安装时持久化 vendor + scripts 到 OPENWORK_DATA_DIR。
 * @param {string} bundleExtractRoot zip 解压目录或 bundles/id 源目录
 * @param {string} dataDir
 * @param {{ id: string }} manifest
 * @param {string} repoRoot
 * @returns {Promise<string>} bundleRoot（供 ${BUNDLE_ROOT} 展开）
 */
export async function stageBundleRuntime(bundleExtractRoot, dataDir, manifest, repoRoot) {
  const dest = bundleRuntimeDir(dataDir, manifest.id);
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  const vendorSrc = path.join(bundleExtractRoot, "vendor");
  if (existsSync(vendorSrc)) {
    await copyTreeDeref(vendorSrc, path.join(dest, "vendor"));
  } else if (manifest.id === "knowledge-mgmt") {
    await stageKnowledgeMgmtVendor(path.join(dest, "vendor"), repoRoot);
  }

  const scriptsSrc = path.join(bundleExtractRoot, "scripts");
  if (existsSync(scriptsSrc)) {
    await copyTreeDeref(scriptsSrc, path.join(dest, "scripts"));
  }

  return dest;
}
