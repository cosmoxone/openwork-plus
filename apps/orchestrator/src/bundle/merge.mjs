// opencode.json 深度合并纯函数（C1.2）。
// 设计原则：
//  - 与 v0.17.30 opencode.json 一字不差对齐（plugin 单数、mcp 平铺）
//  - 白名单 + 通用兜底：6 个字段显式处理，其余走通用对象深度合并
//  - 可逆：返回 added 清单，卸载时按清单精确移除
// 仅依赖 node 内置模块，便于单元测试。

import { OPENCODE_ARRAY_FIELDS } from "./schema.mjs";

/**
 * 深度合并两个值，返回 { merged, added }。
 * added 是"本次合并新引入的 key 路径"（点分隔），用于 receipt 记录与卸载回滚。
 *
 * 合并规则：
 *  - 数组类字段（plugin/instructions，及任意数组）：去重合并，added = incoming 中此前不存在的元素
 *  - 对象：递归合并，added = 子级 added 拼接
 *  - 标量：incoming 覆盖 existing，added = [key] 若 existing 为 undefined
 *
 * @param {any} existing 目标侧现有值
 * @param {any} incoming 本次要合并进来的值
 * @param {string} keyPath 当前 key 路径（点分隔，根为 ""）
 * @returns {{merged:any, added:string[]}}
 */
export function deepMerge(existing, incoming, keyPath = "") {
  // incoming 是 undefined：不合并
  if (incoming === undefined) return { merged: existing, added: [] };

  // existing 是 undefined：直接采用 incoming，整体都算新增
  if (existing === undefined) {
    const added = collectKeys(incoming, keyPath);
    return { merged: clone(incoming), added };
  }

  // 两者都是数组：去重合并
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const merged = [...existing];
    /** @type {string[]} */
    const added = [];
    for (const item of incoming) {
      // 仅对基本类型做去重（对象/数组直接追加，不去重）
      if (isPrimitive(item) && merged.some((m) => isPrimitive(m) && m === item)) {
        continue;
      }
      merged.push(item);
      added.push(`${keyPath}[${merged.length - 1}]`);
    }
    return { merged, added };
  }

  // 两者都是对象：递归合并
  if (isPlainObject(existing) && isPlainObject(incoming)) {
    /** @type {Record<string, any>} */
    const merged = { ...existing };
    /** @type {string[]} */
    const added = [];
    for (const [k, v] of Object.entries(incoming)) {
      const childPath = keyPath ? `${keyPath}.${k}` : k;
      const child = deepMerge(merged[k], v, childPath);
      merged[k] = child.merged;
      added.push(...child.added);
    }
    return { merged, added };
  }

  // 标量或类型不匹配：incoming 覆盖（记录被覆盖的旧值由调用方处理，这里只记 added）
  return { merged: clone(incoming), added: existing === undefined ? [keyPath] : [] };
}

/**
 * 从 opencode.json 移除指定 key 路径（点分隔）。
 * 路径形如 "permission.bash" / "plugin[2]" / "mcp.my-server"。
 * 不存在的路径静默跳过（卸载幂等）。
 * @param {any} config opencode.json 对象（会被原地修改）
 * @param {string[]} keyPaths 要移除的路径列表
 * @returns {any} 修改后的 config
 */
export function deepRemove(config, keyPaths) {
  if (!config || typeof config !== "object") return config;
  for (const p of keyPaths) {
    removePath(config, p);
  }
  return config;
}

// ---- 内部工具 ----

/** @returns {boolean} */
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** @returns {boolean} */
function isPrimitive(v) {
  return v === null || (typeof v !== "object" && typeof v !== "function");
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/** 递归收集一个值的所有"叶 key 路径"（用于 incoming 整体新增时记录 added）。 */
function collectKeys(value, keyPath) {
  if (isPlainObject(value)) {
    /** @type {string[]} */
    const out = [];
    for (const [k, v] of Object.entries(value)) {
      const childPath = keyPath ? `${keyPath}.${k}` : k;
      out.push(...collectKeys(v, childPath));
    }
    return out;
  }
  if (Array.isArray(value)) {
    // 数组：每个元素展开为 [idx] 路径（卸载时按索引精确移除）
    /** @type {string[]} */
    const out = [];
    for (let i = 0; i < value.length; i++) {
      const elemPath = `${keyPath}[${i}]`;
      const childKeys = collectKeys(value[i], elemPath);
      out.push(...(childKeys.length > 0 ? childKeys : [elemPath]));
    }
    return out;
  }
  return keyPath ? [keyPath] : [];
}

/** 按点分隔路径移除（支持数组下标 [n]）。 */
function removePath(root, keyPath) {
  if (!keyPath) return;
  const segments = parsePath(keyPath);
  if (segments.length === 0) return;
  // 走到父级
  let node = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    node = node?.[seg];
    if (node === undefined) return;
  }
  const last = segments[segments.length - 1];
  if (node === undefined || node === null) return;
  if (Array.isArray(node)) {
    const idx = typeof last === "number" ? last : parseInt(String(last), 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < node.length) {
      node.splice(idx, 1);
    }
  } else if (typeof node === "object") {
    delete node[last];
  }
}

/** 把 "a.b[2].c" 解析为 ["a","b",2,"c"]。 */
function parsePath(p) {
  /** @type {(string|number)[]} */
  const out = [];
  let i = 0;
  while (i < p.length) {
    if (p[i] === "[") {
      const end = p.indexOf("]", i);
      if (end === -1) break;
      const num = parseInt(p.slice(i + 1, end), 10);
      if (!Number.isNaN(num)) out.push(num);
      i = end + 1;
      if (p[i] === ".") i++;
    } else {
      let end = p.indexOf(".", i);
      const bracket = p.indexOf("[", i);
      if (end === -1 || (bracket !== -1 && bracket < end)) end = bracket;
      if (end === -1) end = p.length;
      out.push(p.slice(i, end));
      i = end;
      if (p[i] === ".") i++;
    }
  }
  return out;
}

export { isPlainObject };
export { OPENCODE_ARRAY_FIELDS };
