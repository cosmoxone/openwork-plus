// Industry Bundle 清单（bundle.json）schema 与校验。
// 对齐融合契约 §8 与 Industry Bundle 文档；同时识别 Codex `.codex-plugin/plugin.json`。
// 仅依赖 node 内置模块，便于独立运行与冒烟测试。

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const BUNDLE_CONTRACT_ID = "com.openwork.convergence.bundle";
export const BUNDLE_SCHEMA_VERSION = "1.0.0";

/**
 * @typedef {Object} McpServerEntry
 * @property {string} [command]
 * @property {string[]} [args]
 * @property {string} [url]
 * @property {Record<string,string>} [env]
 */

/**
 * @typedef {Object} BundleManifest
 * @property {string} id
 * @property {string} name
 * @property {string} version
 * @property {string} [schemaVersion]
 * @property {string} [contractId]
 * @property {string} [description]
 * @property {string} [homepage]
 * @property {string} [author]
 * @property {{platform?:string[],runtime?:string[],bundles?:string[]}} [requires]
 * @property {{path:string}[]} [skills]
 * @property {{path:string}[]} [agents]
 * @property {{path:string}[]} [commands]
 * @property {{servers?:Record<string,McpServerEntry>}} [mcp]
 * @property {{tools?:string[],bin?:Record<string,string>}} [cli]
 * @property {{routes?:string[]}} [ui]
 * @property {string} [preinstall]
 * @property {string} [postuninstall]
 */

/** 校验错误集合 */
export class BundleValidationError extends Error {
  /** @param {string[]} issues */
  constructor(issues) {
    super(`bundle.json 校验失败:\n - ${issues.join("\n - ")}`);
    this.name = "BundleValidationError";
    this.issues = issues;
  }
}

/**
 * 校验 manifest 的必需字段与基本结构。
 * @param {any} raw
 * @returns {BundleManifest}
 */
export function validateManifest(raw) {
  /** @type {string[]} */
  const issues = [];
  if (!raw || typeof raw !== "object") {
    throw new BundleValidationError(["manifest 不是对象"]);
  }
  for (const key of ["id", "name", "version"]) {
    if (typeof raw[key] !== "string" || raw[key].trim() === "") {
      issues.push(`缺少必需字符串字段: ${key}`);
    }
  }
  if (raw.id && !/^[a-z0-9][a-z0-9._-]*$/i.test(raw.id)) {
    issues.push(`id 含非法字符: ${raw.id}`);
  }
  const arrayOfPath = (field) => {
    if (raw[field] === undefined) return;
    if (!Array.isArray(raw[field])) {
      issues.push(`${field} 必须是数组`);
      return;
    }
    raw[field].forEach((entry, i) => {
      if (!entry || typeof entry.path !== "string") {
        issues.push(`${field}[${i}] 缺少 path`);
      }
    });
  };
  arrayOfPath("skills");
  arrayOfPath("agents");
  arrayOfPath("commands");
  if (raw.mcp !== undefined) {
    if (typeof raw.mcp !== "object" || Array.isArray(raw.mcp)) {
      issues.push("mcp 必须是对象");
    } else if (raw.mcp.servers && typeof raw.mcp.servers !== "object") {
      issues.push("mcp.servers 必须是对象（id -> 配置）");
    }
  }
  if (issues.length > 0) throw new BundleValidationError(issues);
  return /** @type {BundleManifest} */ ({
    schemaVersion: raw.schemaVersion ?? BUNDLE_SCHEMA_VERSION,
    contractId: raw.contractId ?? BUNDLE_CONTRACT_ID,
    ...raw,
  });
}

/**
 * 把 Codex `plugin.json` 映射为 bundle manifest 语义。
 * 仅做最小字段映射，技能格式（SKILL.md）天然一致无需转换。
 * @param {any} plugin
 * @param {{skills?:{path:string}[]}} discovered
 * @returns {BundleManifest}
 */
export function mapCodexPlugin(plugin, discovered) {
  return validateManifest({
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    contractId: BUNDLE_CONTRACT_ID,
    id: plugin.id ?? plugin.name,
    name: plugin.displayName ?? plugin.name ?? plugin.id,
    version: plugin.version ?? "0.0.0",
    description: plugin.description,
    author: plugin.author,
    skills: discovered.skills ?? [],
  });
}

/**
 * 从目录加载 bundle，支持三种来源：
 *  - 原生 bundle.json
 *  - Codex 插件目录（.codex-plugin/plugin.json）
 *  - 仅含 SKILL.md 的技能目录（包装为最小 bundle）
 * @param {string} dir
 * @returns {Promise<{manifest:BundleManifest, root:string, source:"bundle"|"codex"|"skills"}>}
 */
export async function loadBundle(dir) {
  const root = path.resolve(dir);
  const dirStat = await stat(root).catch(() => null);
  if (!dirStat || !dirStat.isDirectory()) {
    throw new Error(`bundle 路径不是目录: ${root}`);
  }

  const bundleJson = path.join(root, "bundle.json");
  if (existsSync(bundleJson)) {
    const raw = JSON.parse(await readFile(bundleJson, "utf8"));
    return { manifest: validateManifest(raw), root, source: "bundle" };
  }

  const codexManifest = path.join(root, ".codex-plugin", "plugin.json");
  if (existsSync(codexManifest)) {
    const plugin = JSON.parse(await readFile(codexManifest, "utf8"));
    const skills = await discoverSkills(root);
    return { manifest: mapCodexPlugin(plugin, { skills }), root, source: "codex" };
  }

  // 仅技能目录：包装为最小 bundle
  if (existsSync(path.join(root, "SKILL.md")) || existsSync(path.join(root, "skills"))) {
    const skills = await discoverSkills(root);
    if (skills.length === 0) {
      throw new Error(`目录内未发现 bundle.json / plugin.json / SKILL.md: ${root}`);
    }
    const id = path.basename(root).replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
    return {
      manifest: validateManifest({ id, name: id, version: "0.0.0", skills }),
      root,
      source: "skills",
    };
  }

  throw new Error(`目录内未发现可识别的清单文件: ${root}`);
}

/**
 * 发现目录下的 SKILL.md 技能（root/SKILL.md 或 root/skills/<name>/SKILL.md）。
 * @param {string} root
 * @returns {Promise<{path:string}[]>}
 */
async function discoverSkills(root) {
  const { readdir } = await import("node:fs/promises");
  /** @type {{path:string}[]} */
  const out = [];
  if (existsSync(path.join(root, "SKILL.md"))) out.push({ path: "." });
  const skillsDir = path.join(root, "skills");
  if (existsSync(skillsDir)) {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && existsSync(path.join(skillsDir, e.name, "SKILL.md"))) {
        out.push({ path: path.join("skills", e.name) });
      }
    }
  }
  return out;
}
