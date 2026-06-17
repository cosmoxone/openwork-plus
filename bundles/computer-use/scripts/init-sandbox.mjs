#!/usr/bin/env node
/**
 * computer-use bundle preinstall：首次安装时初始化 WSL2/Lima 沙箱环境。
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundleRoot = path.resolve(here, "..");
const monorepoRoot = path.resolve(bundleRoot, "..", "..", "..");

process.env.OPENWORK_MONOREPO_ROOT = process.env.OPENWORK_MONOREPO_ROOT ?? monorepoRoot;

async function loadBootstrapModule() {
  if (process.env.OPENWORK_MONOREPO_ROOT) {
    const fromMonorepo = path.join(
      process.env.OPENWORK_MONOREPO_ROOT,
      "packages",
      "sandbox-bootstrap",
      "src",
      "index.mjs",
    );
    if (existsSync(fromMonorepo)) {
      return import(pathToFileURL(fromMonorepo).href);
    }
  }
  const vendored = path.join(bundleRoot, "vendor", "sandbox-bootstrap", "index.mjs");
  if (existsSync(vendored)) {
    return import(pathToFileURL(vendored).href);
  }
  throw new Error("sandbox-bootstrap 未找到（开发环境需 OPENWORK_MONOREPO_ROOT）");
}

const { bootstrap, resolveDataDir } = await loadBootstrapModule();

const dataDir = resolveDataDir(process.env.OPENWORK_DATA_DIR);
console.error(`[computer-use preinstall] dataDir=${dataDir}`);

const result = await bootstrap({
  dataDir,
  onProgress: (p) => console.error(`[sandbox] ${p.phase}: ${p.message}`),
});

console.log(JSON.stringify({ ok: true, mode: result.mode, error: result.error ?? null }));
