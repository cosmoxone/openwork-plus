/**
 * execpolicy 规则引擎（P0-ARC-3 最小实现）。
 * 规则文件：$OPENWORK_DATA_DIR/rules/*.json
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

/** @typedef {"allow"|"deny"|"needs-approval"} PolicyDecision */

/**
 * @typedef {Object} ExecRule
 * @property {string} [id]
 * @property {PolicyDecision} action
 * @property {string} [pattern]   // 简单 glob：* 匹配任意
 * @property {string} [prefix]    // argv[0] 前缀
 */

function defaultDataDir() {
  if (process.env.OPENWORK_DATA_DIR) return path.resolve(process.env.OPENWORK_DATA_DIR);
  return process.platform === "win32"
    ? path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "openwork")
    : path.join(os.homedir(), ".openwork");
}

/** 内置默认规则（可被 rules/*.json 扩展覆盖顺序：deny > needs-approval > allow） */
const BUILTIN_RULES = /** @type {ExecRule[]} */ ([
  { id: "allow-echo", action: "allow", prefix: "echo" },
  { id: "allow-node", action: "allow", prefix: "node" },
  { id: "deny-bare-bash-c", action: "deny", pattern: "bash -c *" },
  { id: "approve-rm-rf", action: "needs-approval", pattern: "rm -rf *" },
  { id: "approve-format", action: "needs-approval", prefix: "format" },
]);

function argvToString(argv) {
  return (argv ?? []).map((a) => String(a)).join(" ");
}

function matchPattern(line, pattern) {
  if (!pattern) return false;
  if (pattern.endsWith(" *")) {
    return line.startsWith(pattern.slice(0, -2));
  }
  return line === pattern;
}

/**
 * @param {string[]} argv
 * @param {ExecRule[]} rules
 * @returns {{ decision: PolicyDecision, ruleId?: string }}
 */
export function evaluateExec(argv, rules = BUILTIN_RULES) {
  const line = argvToString(argv);
  const bin = argv[0] ? String(argv[0]) : "";

  /** @type {PolicyDecision | null} */
  let decision = null;
  /** @type {string | undefined} */
  let ruleId;

  for (const rule of rules) {
    let hit = false;
    if (rule.prefix && (bin === rule.prefix || bin.endsWith(`/${rule.prefix}`) || bin.endsWith(`\\${rule.prefix}`))) {
      hit = true;
    }
    if (rule.pattern && matchPattern(line, rule.pattern)) {
      hit = true;
    }
    if (!hit) continue;

    ruleId = rule.id;
    if (rule.action === "deny") {
      return { decision: "deny", ruleId };
    }
    if (rule.action === "needs-approval") {
      decision = "needs-approval";
    } else if (rule.action === "allow" && decision !== "needs-approval") {
      decision = "allow";
    }
  }

  if (decision) return { decision, ruleId };
  return { decision: "needs-approval", ruleId: "default-needs-approval" };
}

/**
 * 从 $OPENWORK_DATA_DIR/rules/*.json 加载规则（可选）。
 * @returns {Promise<ExecRule[]>}
 */
export async function loadRulesFromDisk(dataDir) {
  const dir = path.join(dataDir ?? defaultDataDir(), "rules");
  if (!existsSync(dir)) return [...BUILTIN_RULES];
  /** @type {ExecRule[]} */
  const loaded = [];
  for (const name of await readdir(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(await readFile(path.join(dir, name), "utf8"));
      const rules = Array.isArray(raw) ? raw : raw.rules;
      if (Array.isArray(rules)) loaded.push(...rules);
    } catch {
      /* skip bad file */
    }
  }
  return loaded.length ? [...BUILTIN_RULES, ...loaded] : [...BUILTIN_RULES];
}
