// Industry Bundle 安装器：install / list / uninstall。
// 设计目标：可逆安装（uninstall 能精确移除注入的文件与 opencode.json 键）。
// 仅依赖 node 内置模块。

import { mkdir, readFile, writeFile, cp, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { loadBundle } from "./schema.mjs";

const INSTALLED_FILE = "installed-bundles.json";

/**
 * 解析数据目录（与融合契约的中性环境变量约定一致）。
 * @param {string} [override]
 */
export function resolveDataDir(override) {
  if (override) return path.resolve(override);
  if (process.env.OPENWORK_DATA_DIR) return path.resolve(process.env.OPENWORK_DATA_DIR);
  const home = os.homedir();
  return process.platform === "win32"
    ? path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "openwork")
    : path.join(home, ".openwork");
}

/**
 * 解析工作区根（含 opencode.json 的目录）。
 * @param {string} [override]
 */
export function resolveWorkspaceRoot(override) {
  if (override) return path.resolve(override);
  if (process.env.OW_WORKSPACE_ROOT) return path.resolve(process.env.OW_WORKSPACE_ROOT);
  return process.cwd();
}

/** @param {string} dataDir */
async function readInstalled(dataDir) {
  const file = path.join(dataDir, INSTALLED_FILE);
  if (!existsSync(file)) return { schemaVersion: "1.0.0", bundles: [] };
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return { schemaVersion: "1.0.0", bundles: [] };
  }
}

/** 原子写：写临时文件后 rename。 */
async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, content, "utf8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, file);
}

/** @param {string} dataDir @param {any} state */
async function writeInstalled(dataDir, state) {
  await atomicWrite(path.join(dataDir, INSTALLED_FILE), JSON.stringify(state, null, 2));
}

/**
 * 把 bundle 的 mcp.servers 合并进 opencode.json（可逆）。
 * @returns {Promise<string[]>} 实际新增的 server id 列表（供卸载移除）
 */
async function mergeMcp(workspaceRoot, servers) {
  const ids = Object.keys(servers ?? {});
  if (ids.length === 0) return [];
  const file = path.join(workspaceRoot, "opencode.json");
  /** @type {any} */
  let config = {};
  if (existsSync(file)) {
    try {
      config = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      throw new Error(`opencode.json 不是合法 JSON，拒绝合并: ${error.message}`);
    }
  }
  if (!config.mcp || typeof config.mcp !== "object") config.mcp = {};
  /** @type {string[]} */
  const added = [];
  for (const id of ids) {
    if (config.mcp[id] === undefined) {
      config.mcp[id] = servers[id];
      added.push(id);
    }
  }
  await atomicWrite(file, JSON.stringify(config, null, 2));
  return added;
}

/** 从 opencode.json 移除指定 mcp server id。 */
async function unmergeMcp(workspaceRoot, ids) {
  if (!ids || ids.length === 0) return;
  const file = path.join(workspaceRoot, "opencode.json");
  if (!existsSync(file)) return;
  const config = JSON.parse(await readFile(file, "utf8"));
  if (config.mcp) {
    for (const id of ids) delete config.mcp[id];
    if (Object.keys(config.mcp).length === 0) delete config.mcp;
  }
  await atomicWrite(file, JSON.stringify(config, null, 2));
}

/**
 * 安装 bundle。
 * @param {{bundleDir:string, workspaceRoot?:string, dataDir?:string, fromCodex?:boolean}} opts
 */
export async function installBundle(opts) {
  const workspaceRoot = resolveWorkspaceRoot(opts.workspaceRoot);
  const dataDir = resolveDataDir(opts.dataDir);
  const { manifest, root } = await loadBundle(opts.bundleDir);

  const installed = await readInstalled(dataDir);
  if (installed.bundles.some((b) => b.id === manifest.id)) {
    throw new Error(`bundle 已安装: ${manifest.id}（先 uninstall 再重装）`);
  }

  // 依赖检查
  const requiredBundles = manifest.requires?.bundles ?? [];
  const missing = requiredBundles.filter(
    (dep) => !installed.bundles.some((b) => b.id === dep),
  );
  if (missing.length > 0) {
    throw new Error(`缺少依赖 bundle: ${missing.join(", ")}（请先安装）`);
  }

  /** @type {string[]} */
  const createdPaths = [];
  const copyEntries = async (entries, destBase) => {
    for (const entry of entries ?? []) {
      const src = path.join(root, entry.path);
      if (!existsSync(src)) throw new Error(`声明的路径不存在: ${entry.path}`);
      const dest = path.join(destBase, path.basename(entry.path));
      await mkdir(path.dirname(dest), { recursive: true });
      await cp(src, dest, { recursive: true });
      createdPaths.push(dest);
    }
  };

  const opencodeDir = path.join(workspaceRoot, ".opencode");
  await copyEntries(manifest.skills, path.join(opencodeDir, "skills"));
  await copyEntries(manifest.agents, path.join(opencodeDir, "agent"));
  await copyEntries(manifest.commands, path.join(opencodeDir, "command"));

  const addedMcp = await mergeMcp(workspaceRoot, manifest.mcp?.servers);

  installed.bundles.push({
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    installedAt: new Date().toISOString(),
    workspaceRoot,
    createdPaths,
    addedMcp,
  });
  await writeInstalled(dataDir, installed);

  return {
    id: manifest.id,
    version: manifest.version,
    createdPaths,
    addedMcp,
    preinstall: manifest.preinstall ?? null,
  };
}

/** @param {{dataDir?:string}} [opts] */
export async function listBundles(opts) {
  const dataDir = resolveDataDir(opts?.dataDir);
  const installed = await readInstalled(dataDir);
  return installed.bundles;
}

/**
 * 卸载 bundle：移除注入文件 + 移除 opencode.json 中新增的 mcp 键。
 * @param {{id:string, dataDir?:string}} opts
 */
export async function uninstallBundle(opts) {
  const dataDir = resolveDataDir(opts.dataDir);
  const installed = await readInstalled(dataDir);
  const record = installed.bundles.find((b) => b.id === opts.id);
  if (!record) throw new Error(`未找到已安装 bundle: ${opts.id}`);

  for (const p of record.createdPaths ?? []) {
    await rm(p, { recursive: true, force: true });
  }
  await unmergeMcp(record.workspaceRoot, record.addedMcp ?? []);

  installed.bundles = installed.bundles.filter((b) => b.id !== opts.id);
  await writeInstalled(dataDir, installed);
  return { id: opts.id, removedPaths: record.createdPaths ?? [], removedMcp: record.addedMcp ?? [] };
}
