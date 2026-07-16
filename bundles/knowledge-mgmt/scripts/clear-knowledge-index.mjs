#!/usr/bin/env node
/** bundle postuninstall：清理 workspace 向量索引（保留 wiki 文件，Hub 离线可用） */
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundleRoot = path.resolve(here, "..");
const workspaceRoot = process.env.OW_WORKSPACE_ROOT || process.cwd();

async function loadClearModule() {
  const vendored = path.join(bundleRoot, "vendor", "knowledge-wiki", "src", "index-sync.mjs");
  if (existsSync(vendored)) {
    return import(pathToFileURL(vendored).href);
  }
  if (process.env.OPENWORK_MONOREPO_ROOT) {
    const fromMonorepo = path.join(
      process.env.OPENWORK_MONOREPO_ROOT,
      "packages",
      "knowledge-wiki",
      "src",
      "index-sync.mjs",
    );
    if (existsSync(fromMonorepo)) {
      return import(pathToFileURL(fromMonorepo).href);
    }
  }
  let dir = bundleRoot;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "packages", "knowledge-wiki", "src", "index-sync.mjs");
    if (existsSync(candidate)) {
      return import(pathToFileURL(candidate).href);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("knowledge-wiki clear-index 模块未找到");
}

const { clearKnowledgeIndex } = await loadClearModule();
await clearKnowledgeIndex(workspaceRoot);
console.log(`knowledge-mgmt: cleared vector index for ${workspaceRoot}`);
