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
import { stageBundleRuntime } from "./vendor-stage.mjs";
import { deepMerge, isPlainObject } from "./merge.mjs";
import { readUserDataOrReset } from "./fault-tolerant.mjs";

/** @param {any} v */
function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

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

/**
 * 解析 user scope 的 opencode 配置根（C1.4）。
 * *nix: ~/.config/opencode；Windows: %APPDATA%/opencode。
 * @returns {string}
 */
export function resolveUserConfigRoot() {
  const home = os.homedir();
  return process.platform === "win32"
    ? path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "opencode")
    : path.join(home, ".config", "opencode");
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

/** 展开 MCP 配置中的 ${WORKSPACE} / ${HOME} / ${MONOREPO_ROOT} / ${BUNDLE_ROOT}。 */
function expandMcpValue(value, ctx) {
  if (typeof value !== "string") return value;
  return value
    .replaceAll("${WORKSPACE}", ctx.workspaceRoot)
    .replaceAll("${HOME}", ctx.home)
    .replaceAll("${MONOREPO_ROOT}", ctx.monorepoRoot)
    .replaceAll("${BUNDLE_ROOT}", ctx.bundleRoot);
}

/** 将 bundle 清单中的 command/args/env 转为 OpenCode 1.4+ 的 local MCP 形态。 */
function normalizeMcpServerConfig(cfg) {
  if (cfg.type === "local" && Array.isArray(cfg.command)) {
    if (cfg.env && !cfg.environment) {
      const { env, ...rest } = cfg;
      return { ...rest, environment: env };
    }
    return cfg;
  }

  /** @type {Record<string, unknown>} */
  const next = { type: "local" };
  const cmd = typeof cfg.command === "string" ? cfg.command : "";
  const args = Array.isArray(cfg.args) ? cfg.args : [];
  next.command = cmd ? [cmd, ...args] : args;
  if (cfg.env && typeof cfg.env === "object") next.environment = cfg.env;
  if (typeof cfg.cwd === "string") next.cwd = cfg.cwd;
  if (typeof cfg.enabled === "boolean") next.enabled = cfg.enabled;
  if (typeof cfg.timeout === "number") next.timeout = cfg.timeout;
  return next;
}

/** @param {Record<string,any>} servers @param {{workspaceRoot:string,home:string,monorepoRoot:string,bundleRoot:string}} ctx */
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
    if (typeof next.cwd === "string") next.cwd = expandMcpValue(next.cwd, ctx);
    out[id] = normalizeMcpServerConfig(next);
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
  const defaultState = { schemaVersion: "1.0.0", bundles: [] };
  const result = await readUserDataOrReset({
    file,
    defaultValue: defaultState,
    label: "installed-bundles.json",
    atomicWrite,
  });
  return result.value;
}

/** 原子写：写临时文件后 rename。 */
async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, content, "utf8");
  const { rename } = await import("node:fs/promises");
  await rename(tmp, file);
}

/**
 * 读取 workspace 的 opencode.json，遇到不合法 JSON 时**不抛错**：
 * 把原文件备份为 `opencode.json.corrupt-<ts>.json`，然后视为 `{}`，
 * 让 bundle 安装继续。理由：bundle 安装是用户主动行为，不应因目标 workspace
 * 已经存在的脏配置而被卡住；同时备份原文件，用户可手动恢复。
 *
 * Thin wrapper over the generic `readUserDataOrReset` helper from
 * fault-tolerant.mjs. Kept as a local function to preserve the existing
 * return shape (`{config, recoveredFromCorrupt, backupPath}`) so callers
 * don't need to change.
 *
 * @param {string} workspaceRoot
 * @returns {Promise<{config: any, recoveredFromCorrupt: boolean, backupPath?: string}>}
 */
async function readOpencodeJsonOrReset(workspaceRoot) {
  const file = path.join(workspaceRoot, "opencode.json");
  const result = await readUserDataOrReset({
    file,
    defaultValue: /** @type {any} */ ({}),
    label: "opencode.json",
    atomicWrite,
  });
  return {
    config: result.value,
    recoveredFromCorrupt: result.recoveredFromCorrupt,
    backupPath: result.backupPath,
  };
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
  const { config } = await readOpencodeJsonOrReset(workspaceRoot);
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
 * 把 bundle 的 opencode.* 合并块深度合并进 opencode.json（C1.2）。
 * 合并前备份 opencode.json 到 .opencode-backup-<timestamp>.json。
 *
 * 合并规则（字段特性化，可预测）：
 *  - 数组字段（plugin/instructions）：去重合并，按值
 *  - 对象字段（permission/tools/agent）：深度合并，按 key
 *  - mcp：按 server id 合并，已存在跳过（对齐 mergeMcp）
 *  - 其余字段：通用对象深度合并兜底
 *
 * @param {string} workspaceRoot
 * @param {Record<string, unknown>} opencodeBlock bundle.opencode 字段
 * @returns {Promise<Record<string, unknown>>} 本 bundle 的 opencode 声明快照（供 receipt 记录，卸载时逆向使用）
 */
async function mergeOpencodeBlock(workspaceRoot, opencodeBlock) {
  if (!opencodeBlock || typeof opencodeBlock !== "object") return {};
  const file = path.join(workspaceRoot, "opencode.json");
  // 容错读取：不合法时自动备份并重置为 {}，避免阻塞安装。
  const { config: parsedConfig, recoveredFromCorrupt } = await readOpencodeJsonOrReset(workspaceRoot);
  /** @type {any} */
  let config = parsedConfig;
  if (!recoveredFromCorrupt && existsSync(file)) {
    // 仅在文件本身合法时才做合并前备份（recoveredFromCorrupt=true 时已经在 helper 里备份过）
    const backup = path.join(workspaceRoot, `.opencode-backup-${Date.now()}.json`);
    await atomicWrite(backup, JSON.stringify(config, null, 2));
  }

  const ARRAY_FIELDS = new Set(["plugin", "instructions"]);
  /** @type {Record<string, unknown>} */
  const declared = {};

  for (const [field, incoming] of Object.entries(opencodeBlock)) {
    if (incoming === undefined) continue;
    declared[field] = clone(incoming);

    // mcp 字段：对齐 mergeMcp 的"已存在 id 跳过"语义
    if (field === "mcp" && isPlainObject(incoming)) {
      if (!isPlainObject(config.mcp)) config.mcp = {};
      for (const [id, serverCfg] of Object.entries(incoming)) {
        if (config.mcp[id] === undefined) {
          config.mcp[id] = clone(serverCfg);
        }
      }
      continue;
    }

    // 数组字段：去重合并
    if (ARRAY_FIELDS.has(field) && Array.isArray(incoming)) {
      if (!Array.isArray(config[field])) config[field] = [];
      for (const item of incoming) {
        if (!config[field].some((m) => JSON.stringify(m) === JSON.stringify(item))) {
          config[field].push(clone(item));
        }
      }
      continue;
    }

    // 其余字段（对象为主）：通用深度合并
    const { merged } = deepMerge(config[field], incoming, field);
    config[field] = merged;
  }

  await atomicWrite(file, JSON.stringify(config, null, 2));
  return declared;
}

/**
 * 从 opencode.json 逆向移除本 bundle 的 opencode 声明（C1.2 卸载侧）。
 * 与 mergeOpencodeBlock 对称：按本 bundle 的声明快照逐字段逆向。
 *
 * @param {string} workspaceRoot
 * @param {Record<string, unknown>} declared 本 bundle 的 opencode 声明快照（receipt.opencodeMerges）
 * @param {Record<string, unknown>[]} otherDeclareds 其他剩余 bundle 的声明快照（用于判断 key 是否保留）
 */
async function unmergeOpencodeBlock(workspaceRoot, declared, otherDeclareds = []) {
  if (!declared || Object.keys(declared).length === 0) return;
  const file = path.join(workspaceRoot, "opencode.json");
  if (!existsSync(file)) return;
  // 容错读取：卸载不应因 opencode.json 损坏而崩溃。
  const { config: parsed } = await readOpencodeJsonOrReset(workspaceRoot);
  const config = parsed;
  if (!config || typeof config !== "object") return;

  const ARRAY_FIELDS = new Set(["plugin", "instructions"]);

  for (const [field, declaredValue] of Object.entries(declared)) {
    // mcp：按 id 移除，被其他 bundle 声明的 id 保留
    if (field === "mcp" && isPlainObject(declaredValue)) {
      if (!isPlainObject(config.mcp)) continue;
      const otherIds = new Set(otherDeclareds.flatMap((d) => Object.keys(d.mcp ?? {})));
      for (const id of Object.keys(declaredValue)) {
        if (!otherIds.has(id)) delete config.mcp[id];
      }
      if (Object.keys(config.mcp).length === 0) delete config.mcp;
      continue;
    }

    // 数组字段：按值移除（仅当值不被其他 bundle 声明时）
    if (ARRAY_FIELDS.has(field) && Array.isArray(declaredValue)) {
      if (!Array.isArray(config[field])) continue;
      const otherValues = new Set(
        otherDeclareds
          .filter((d) => Array.isArray(d[field]))
          .flatMap((d) => d[field].map((v) => JSON.stringify(v))),
      );
      config[field] = config[field].filter(
        (v) => otherValues.has(JSON.stringify(v)) || !declaredValue.some((dv) => JSON.stringify(dv) === JSON.stringify(v)),
      );
      if (config[field].length === 0) delete config[field];
      continue;
    }

    // 对象字段：按 key 移除，被其他 bundle 声明的 key 保留
    if (isPlainObject(declaredValue)) {
      const otherKeys = new Set(otherDeclareds.flatMap((d) => Object.keys(d[field] ?? {})));
      removeKeys(config[field], declaredValue, field, otherKeys);
      if (isPlainObject(config[field]) && Object.keys(config[field]).length === 0) delete config[field];
      continue;
    }
  }

  await atomicWrite(file, JSON.stringify(config, null, 2));
}

/**
 * 递归移除对象字段中本 bundle 声明的 key（被其他 bundle 声明的 key 保留）。
 * @param {any} configNode opencode.json 对应字段的当前节点
 * @param {any} declaredNode 本 bundle 在该字段声明的对象
 * @param {string} fieldPath 当前字段路径（用于日志，暂未使用）
 * @param {Set<string>} otherSiblingKeys 同级被其他 bundle 声明的 key（仅顶层判断）
 */
function removeKeys(configNode, declaredNode, fieldPath, otherSiblingKeys) {
  if (!isPlainObject(configNode) || !isPlainObject(declaredNode)) return;
  for (const [k, v] of Object.entries(declaredNode)) {
    // 该 key 被其他 bundle 也声明 → 保留（不删），但可继续向下清理？不，保留整个子树
    if (otherSiblingKeys.has(k)) continue;
    if (configNode[k] === undefined) continue;
    if (isPlainObject(v) && isPlainObject(configNode[k])) {
      // 嵌套对象：递归移除本 bundle 声明的子 key
      removeKeys(configNode[k], v, `${fieldPath}.${k}`, new Set());
      if (Object.keys(configNode[k]).length === 0) delete configNode[k];
    } else {
      delete configNode[k];
    }
  }
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

  // C1.4: 根据 scope 决定文件/opencode.json 写入根
  const scope = manifest.scope === "user" ? "user" : "workspace";
  const targetRoot = scope === "user" ? resolveUserConfigRoot() : workspaceRoot;

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

  // C1.3: 依赖检查（requires.bundles 作为 dependencies 的别名，取并集）
  const deps = [
    ...(manifest.requires?.bundles ?? []),
    ...(manifest.dependencies ?? []),
  ];
  const uniqueDeps = [...new Set(deps)];
  const missing = uniqueDeps.filter(
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

  // C1.5: 文件路径冲突检测（仅文件类资源，opencode.json 合并字段不检测）
  /** @param {{path:string}[]} entries @param {string} destBase @returns {string[]} */
  const computeDestPaths = (entries, destBase) =>
    (entries ?? [])
      .map((entry) => path.join(destBase, path.basename(entry.path)))
      .map((p) => path.resolve(p));

  const opencodeDir = path.join(targetRoot, ".opencode");
  const plannedDest = [
    ...computeDestPaths(manifest.skills, path.join(opencodeDir, "skills")),
    ...computeDestPaths(manifest.agents, path.join(opencodeDir, "agent")),
    ...computeDestPaths(manifest.commands, path.join(opencodeDir, "commands")),
  ];
  if (plannedDest.length > 0) {
    const conflictMap = new Map(); // path -> bundle id
    for (const other of installed.bundles) {
      for (const p of other.createdPaths ?? []) {
        conflictMap.set(path.resolve(p), other.id);
      }
    }
    const conflicts = plannedDest.filter((p) => conflictMap.has(p));
    if (conflicts.length > 0) {
      const detail = conflicts.map((p) => `${p}（已被 ${conflictMap.get(p)} 占用）`).join("; ");
      throw new Error(`文件路径冲突，请先卸载占用 bundle: ${detail}`);
    }
  }

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

  await copyEntries(manifest.skills, path.join(opencodeDir, "skills"));
  await copyEntries(manifest.agents, path.join(opencodeDir, "agent"));
  await copyEntries(manifest.commands, path.join(opencodeDir, "commands"));

  const monorepoRoot = resolveMonorepoRoot(root);
  const bundleRoot = await stageBundleRuntime(root, dataDir, manifest, monorepoRoot);

  const mcpCtx = {
    workspaceRoot,
    home: os.homedir(),
    monorepoRoot,
    bundleRoot,
  };
  const addedMcp = await mergeMcp(targetRoot, manifest.mcp?.servers, mcpCtx);

  // C1.2: 合并 opencode.* 块（plugin/permission/instructions/tools/agent/mcp），返回声明快照供 receipt
  const opencodeDeclared = await mergeOpencodeBlock(targetRoot, manifest.opencode);

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
    scope,
    targetRoot,
    workspaceRoot,
    bundleRoot,
    createdPaths,
    addedMcp,
    opencodeMerges: opencodeDeclared,
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
    opencodeMerges: opencodeDeclared,
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
 * 卸载 bundle：移除注入文件 + 移除 opencode.json 中新增的 mcp/opencode 合并键。
 * @param {{id:string, dataDir?:string, workspaceRoot?:string}} opts
 */
export async function uninstallBundle(opts) {
  const dataDir = resolveDataDir(opts.dataDir);
  const workspaceRoot = resolveWorkspaceRoot(opts.workspaceRoot);
  const installed = await readInstalled(dataDir);
  const record = installed.bundles.find((b) => b.id === opts.id);
  if (!record) throw new Error(`未找到已安装 bundle: ${opts.id}`);

  if (record.postuninstall) {
    const bundleRoot =
      record.bundleRoot ?? path.join(dataDir, "bundles", record.id);
    const parts = String(record.postuninstall).trim().split(/\s+/);
    const cmd = parts[0];
    const cmdArgs = parts.slice(1);
    await execFileAsync(cmd, cmdArgs, {
      cwd: existsSync(bundleRoot) ? bundleRoot : (record.workspaceRoot ?? process.cwd()),
      env: {
        ...process.env,
        OPENWORK_DATA_DIR: dataDir,
        OW_WORKSPACE_ROOT: record.workspaceRoot ?? process.cwd(),
        OPENWORK_MONOREPO_ROOT: resolveMonorepoRoot(record.workspaceRoot ?? process.cwd()),
      },
      timeout: 120_000,
    });
  }

  for (const p of record.createdPaths ?? []) {
    await rm(p, { recursive: true, force: true });
  }
  for (const b of record.installedBins ?? []) {
    await rm(b, { force: true });
  }
  if (record.bundleRoot && existsSync(record.bundleRoot)) {
    await rm(record.bundleRoot, { recursive: true, force: true });
  }
  // C1.4: 优先用 targetRoot（scope=user 时指向用户配置目录），旧记录回退 workspaceRoot
  const removalRoot = record.targetRoot ?? record.workspaceRoot ?? workspaceRoot;
  await unmergeMcp(removalRoot, record.addedMcp ?? []);

  // C1.5: 回滚 opencode 合并字段。按本 bundle 的声明快照逆向，被其他 bundle 声明的 key 保留。
  const opencodeDeclared = record.opencodeMerges;
  if (opencodeDeclared && typeof opencodeDeclared === "object" && !Array.isArray(opencodeDeclared)) {
    const otherDeclareds = installed.bundles
      .filter((b) => b.id !== opts.id)
      .map((b) => b.opencodeMerges)
      .filter((d) => d && typeof d === "object" && !Array.isArray(d));
    await unmergeOpencodeBlock(removalRoot, opencodeDeclared, otherDeclareds);
  }

  await syncWorkspaceUiManifest(record.workspaceRoot ?? workspaceRoot, { id: record.id }, "remove");

  installed.bundles = installed.bundles.filter((b) => b.id !== opts.id);
  await writeInstalled(dataDir, installed);
  return {
    id: opts.id,
    removedPaths: record.createdPaths ?? [],
    removedMcp: record.addedMcp ?? [],
    removedOpencodeMerges: record.opencodeMerges ?? [],
  };
}
