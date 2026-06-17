// Industry Bundle 安装器：install / list / uninstall。
// 设计目标：可逆安装（uninstall 能精确移除注入的文件与 opencode.json 键）。
// 仅依赖 node 内置模块。

import { mkdir, readFile, writeFile, cp, rm, readdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadBundle } from "./schema.mjs";
import { extractBundleZip } from "./zip.mjs";

const execFileAsync = promisify(execFile);

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

/** 从 bundle 目录向上查找 monorepo 根（含 pnpm-workspace.yaml）。 */
export function resolveMonorepoRoot(startDir) {
  if (process.env.OPENWORK_MONOREPO_ROOT) {
    return path.resolve(process.env.OPENWORK_MONOREPO_ROOT);
  }
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

/** 当前平台对应的 cli.bin 键。 */
export function platformBinKey() {
  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : process.arch;
  if (process.platform === "darwin") return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  if (process.platform === "linux") return "linux-x64";
  if (process.platform === "win32") return "win32-x64";
  return `${process.platform}-${arch}`;
}

/** 展开 MCP 配置中的 ${WORKSPACE} / ${HOME} / ${MONOREPO_ROOT}。 */
function expandMcpValue(value, ctx) {
  if (typeof value !== "string") return value;
  return value
    .replaceAll("${WORKSPACE}", ctx.workspaceRoot)
    .replaceAll("${HOME}", ctx.home)
    .replaceAll("${MONOREPO_ROOT}", ctx.monorepoRoot);
}

/** @param {Record<string,any>} servers @param {{workspaceRoot:string,home:string,monorepoRoot:string}} ctx */
function expandMcpServers(servers, ctx) {
  /** @type {Record<string,any>} */
  const out = {};
  for (const [id, cfg] of Object.entries(servers ?? {})) {
    /** @type {any} */
    const next = { ...cfg };
    if (typeof next.command === "string") next.command = expandMcpValue(next.command, ctx);
    if (Array.isArray(next.args)) {
      next.args = next.args.map((a) => expandMcpValue(a, ctx));
    }
    if (next.env && typeof next.env === "object") {
      /** @type {Record<string,string>} */
      const env = {};
      for (const [k, v] of Object.entries(next.env)) {
        env[k] = expandMcpValue(String(v), ctx);
      }
      next.env = env;
    }
    out[id] = next;
  }
  return out;
}

/** @returns {string} */
function cliBinDir(dataDir) {
  return path.join(dataDir, "bin");
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

const WORKSPACE_UI_FILE = "bundle-ui.json";

/** @param {string} workspaceRoot */
function workspaceUiManifestPath(workspaceRoot) {
  return path.join(workspaceRoot, ".openwork", WORKSPACE_UI_FILE);
}

/** @param {string} workspaceRoot */
export async function readWorkspaceUiManifest(workspaceRoot) {
  const file = workspaceUiManifestPath(workspaceRoot);
  if (!existsSync(file)) return { schemaVersion: "1.0.0", bundles: [] };
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return { schemaVersion: "1.0.0", bundles: [] };
  }
}

/**
 * 同步工作区 bundle UI 清单（供桌面端读取 ui.routes）。
 * @param {string} workspaceRoot
 * @param {{id:string,name?:string,version?:string,routes?:string[]}} entry
 * @param {"add"|"remove"} op
 */
async function syncWorkspaceUiManifest(workspaceRoot, entry, op) {
  const manifest = await readWorkspaceUiManifest(workspaceRoot);
  const routes = entry.routes ?? [];
  if (op === "add") {
    manifest.bundles = (manifest.bundles ?? []).filter((b) => b.id !== entry.id);
    if (routes.length > 0) {
      manifest.bundles.push({
        id: entry.id,
        name: entry.name ?? entry.id,
        version: entry.version ?? "0.0.0",
        routes,
      });
    }
  } else {
    manifest.bundles = (manifest.bundles ?? []).filter((b) => b.id !== entry.id);
  }
  await atomicWrite(workspaceUiManifestPath(workspaceRoot), JSON.stringify(manifest, null, 2));
}

/**
 * 把 bundle 的 mcp.servers 合并进 opencode.json（可逆）。
 * @returns {Promise<string[]>} 实际新增的 server id 列表（供卸载移除）
 */
async function mergeMcp(workspaceRoot, servers, ctx) {
  const expanded = expandMcpServers(servers, ctx);
  const ids = Object.keys(expanded ?? {});
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
      config.mcp[id] = expanded[id];
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
 * @param {{bundleDir:string, workspaceRoot?:string, dataDir?:string, fromCodex?:boolean, replace?:boolean}} opts
 */
export async function installBundle(opts) {
  const workspaceRoot = resolveWorkspaceRoot(opts.workspaceRoot);
  const dataDir = resolveDataDir(opts.dataDir);

  let bundleDir = opts.bundleDir;
  /** @type {() => Promise<void>} */
  let cleanup = async () => {};
  if (bundleDir.toLowerCase().endsWith(".zip")) {
    const extracted = await extractBundleZip(bundleDir);
    bundleDir = extracted.dir;
    cleanup = extracted.cleanup;
  }

  try {
  const { manifest, root } = await loadBundle(bundleDir);

  const installed = await readInstalled(dataDir);
  if (installed.bundles.some((b) => b.id === manifest.id)) {
    if (opts.replace) {
      await uninstallBundle({ id: manifest.id, dataDir });
      const refreshed = await readInstalled(dataDir);
      installed.bundles = refreshed.bundles;
    } else {
      throw new Error(`bundle 已安装: ${manifest.id}（先 uninstall 或使用 replace）`);
    }
  }

  // 依赖检查
  const requiredBundles = manifest.requires?.bundles ?? [];
  const missing = requiredBundles.filter(
    (dep) => !installed.bundles.some((b) => b.id === dep),
  );
  if (missing.length > 0) {
    throw new Error(`缺少依赖 bundle: ${missing.join(", ")}（请先安装）`);
  }

  /** 执行 preinstall（如沙箱初始化），失败则中止安装。 */
  if (manifest.preinstall) {
    const parts = manifest.preinstall.trim().split(/\s+/);
    const cmd = parts[0];
    const cmdArgs = parts.slice(1);
    await execFileAsync(cmd, cmdArgs, {
      cwd: root,
      env: {
        ...process.env,
        OPENWORK_DATA_DIR: dataDir,
        OW_WORKSPACE_ROOT: workspaceRoot,
        OPENWORK_MONOREPO_ROOT: resolveMonorepoRoot(root),
      },
      timeout: 600_000,
    });
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
  await copyEntries(manifest.commands, path.join(opencodeDir, "commands"));

  const mcpCtx = {
    workspaceRoot,
    home: os.homedir(),
    monorepoRoot: resolveMonorepoRoot(root),
  };
  const addedMcp = await mergeMcp(workspaceRoot, manifest.mcp?.servers, mcpCtx);

  /** @type {string[]} */
  const installedBins = [];
  const binMap = manifest.cli?.bin;
  if (binMap && typeof binMap === "object") {
    const key = platformBinKey();
    const rel = binMap[key];
    if (rel) {
      const src = path.join(root, rel);
      if (!existsSync(src)) {
        throw new Error(`cli.bin[${key}] 不存在: ${rel}`);
      }
      const destDir = cliBinDir(dataDir);
      await mkdir(destDir, { recursive: true });
      // 去掉平台后缀（如 test-runner-win32-x64.exe → test-runner），再统一命名。
      let base = path.basename(rel).replace(/-(darwin|linux|win32)-[^./]+(\.exe)?$/i, "");
      if (base.toLowerCase().endsWith(".exe")) base = base.slice(0, -4);
      const destName = process.platform === "win32" ? `${base}.exe` : base;
      const dest = path.join(destDir, destName);
      await cp(src, dest);
      if (process.platform !== "win32") {
        await chmod(dest, 0o755);
      }
      installedBins.push(dest);
      createdPaths.push(dest);
    }
  }

  installed.bundles.push({
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    installedAt: new Date().toISOString(),
    workspaceRoot,
    createdPaths,
    addedMcp,
    installedBins,
    uiRoutes: manifest.ui?.routes ?? [],
    postuninstall: manifest.postuninstall ?? null,
  });
  await writeInstalled(dataDir, installed);

  await syncWorkspaceUiManifest(workspaceRoot, {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    routes: manifest.ui?.routes ?? [],
  }, "add");

  return {
    id: manifest.id,
    version: manifest.version,
    createdPaths,
    addedMcp,
    installedBins,
    preinstall: manifest.preinstall ?? null,
  };
  } finally {
    await cleanup();
  }
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

  if (record.postuninstall) {
    if (record.postuninstall === "knowledge:clear-index") {
      const script = path.join(
        resolveMonorepoRoot(record.workspaceRoot ?? process.cwd()),
        "packages",
        "knowledge-wiki",
        "bin",
        "knowledge-wiki.mjs",
      );
      if (existsSync(script)) {
        await execFileAsync(
          "node",
          [script, "clear-index", "--workspace", record.workspaceRoot ?? process.cwd()],
          { timeout: 120_000 },
        );
      }
    } else {
      const parts = String(record.postuninstall).trim().split(/\s+/);
      const cmd = parts[0];
      const cmdArgs = parts.slice(1);
      await execFileAsync(cmd, cmdArgs, {
        cwd: record.workspaceRoot ?? process.cwd(),
        env: {
          ...process.env,
          OPENWORK_DATA_DIR: dataDir,
          OW_WORKSPACE_ROOT: record.workspaceRoot ?? process.cwd(),
          OPENWORK_MONOREPO_ROOT: resolveMonorepoRoot(record.workspaceRoot ?? process.cwd()),
        },
        timeout: 120_000,
      });
    }
  }

  for (const p of record.createdPaths ?? []) {
    await rm(p, { recursive: true, force: true });
  }
  for (const b of record.installedBins ?? []) {
    await rm(b, { force: true });
  }
  await unmergeMcp(record.workspaceRoot, record.addedMcp ?? []);

  await syncWorkspaceUiManifest(record.workspaceRoot, { id: record.id }, "remove");

  installed.bundles = installed.bundles.filter((b) => b.id !== opts.id);
  await writeInstalled(dataDir, installed);
  return { id: opts.id, removedPaths: record.createdPaths ?? [], removedMcp: record.addedMcp ?? [] };
}
