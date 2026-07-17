// C1 Bundle 三轨对齐 smoke 测试。
// 覆盖 doc 37 §7 的 9 项验收标准。
// 运行：node apps/orchestrator/src/bundle/c1-smoke.mjs
// 仅依赖 node 内置模块 + 待测的 schema/installer/merge。

import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { validateManifest, BUNDLE_SCHEMA_VERSION } from "./schema.mjs";
import { installBundle, uninstallBundle, listBundles } from "./installer.mjs";
import { deepMerge, deepRemove } from "./merge.mjs";

/** @returns {{name:string, fn:()=>Promise<void>}} */
const tests = [];
let passed = 0;
let failed = 0;

/**
 * @param {string} name
 * @param {() => Promise<void>} fn
 */
function test(name, fn) {
  tests.push({ name, fn });
}

/**
 * @param {any} cond
 * @param {string} msg
 */
function assert(cond, msg) {
  if (!cond) throw new Error(`断言失败: ${msg}`);
}

/** 读取 opencode.json（不存在返回 {}）。 */
async function readOpencodeJson(root) {
  const file = path.join(root, "opencode.json");
  if (!existsSync(file)) return {};
  return JSON.parse(await readFile(file, "utf8"));
}

/**
 * 在临时目录创建一个测试 bundle。
 * @param {string} baseDir
 * @param {Record<string, unknown>} manifest
 * @param {Record<string, string>} [extraFiles] 相对 bundle 根的额外文件
 */
async function makeBundle(baseDir, manifest, extraFiles = {}) {
  const dir = path.join(baseDir, manifest.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "bundle.json"), JSON.stringify(manifest, null, 2));
  for (const [rel, content] of Object.entries(extraFiles)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

// ---- C1.1 schema 校验测试 ----

test("C1.1a schemaVersion 默认为 1.1.0", () => {
  const m = validateManifest({ id: "x", name: "X", version: "1.0.0" });
  if (m.schemaVersion !== BUNDLE_SCHEMA_VERSION) throw new Error(`期望 ${BUNDLE_SCHEMA_VERSION}，收到 ${m.schemaVersion}`);
});

test("C1.1b scope 默认 workspace", () => {
  const m = validateManifest({ id: "x", name: "X", version: "1.0.0" });
  if (m.scope !== "workspace") throw new Error(`期望 workspace，收到 ${m.scope}`);
});

test("C1.1c scope 非法值报错", () => {
  let threw = false;
  try {
    validateManifest({ id: "x", name: "X", version: "1.0.0", scope: "global" });
  } catch {
    threw = true;
  }
  assert(threw, "scope='global' 应报错");
});

test("C1.1d opencode.plugin 必须是字符串数组", () => {
  let threw = false;
  try {
    validateManifest({ id: "x", name: "X", version: "1.0.0", opencode: { plugin: "foo" } });
  } catch {
    threw = true;
  }
  assert(threw, "opencode.plugin 字符串应报错");
});

test("C1.1e schemaVersion 1.0.0 旧 bundle 仍有效（向后兼容）", () => {
  const m = validateManifest({
    schemaVersion: "1.0.0",
    id: "legacy",
    name: "Legacy",
    version: "0.0.1",
  });
  if (m.scope !== "workspace") throw new Error("旧 bundle 应缺省 scope=workspace");
});

// ---- C1.2 opencode 深度合并测试（纯函数） ----

test("C1.2a 数组去重合并（plugin）", () => {
  const { merged, added } = deepMerge(["a", "b"], ["b", "c"], "plugin");
  if (merged.length !== 3 || !merged.includes("c")) throw new Error(`合并结果错误: ${JSON.stringify(merged)}`);
  if (added.length !== 1 || added[0] !== "plugin[2]") throw new Error(`added 错误: ${JSON.stringify(added)}`);
});

test("C1.2b 对象深度合并（permission.mcp）", () => {
  const existing = { bash: "ask", mcp: { foo: "allow" } };
  const incoming = { edit: "allow", mcp: { bar: "deny" } };
  const { merged } = deepMerge(existing, incoming, "permission");
  if (merged.bash !== "ask" || merged.edit !== "allow") throw new Error("标量合并错误");
  if (merged.mcp.foo !== "allow" || merged.mcp.bar !== "deny") throw new Error("嵌套对象合并错误");
});

test("C1.2c 卸载移除（deepRemove 点分隔路径）", () => {
  const config = { permission: { bash: "ask", edit: "allow" }, plugin: ["a", "b"] };
  deepRemove(config, ["permission.bash", "plugin[0]"]);
  if (config.permission.bash !== undefined) throw new Error("permission.bash 未移除");
  if (config.permission.edit !== "allow") throw new Error("permission.edit 误删");
  if (config.plugin.length !== 1 || config.plugin[0] !== "b") throw new Error("plugin[0] 未正确移除");
});

// ---- C1.2 opencode 端到端合并测试（install/uninstall） ----

test("C1.2d 安装 opencode.permission 后 opencode.json 正确合并", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "c1-opencode-"));
  try {
    const dataDir = path.join(tmp, "data");
    const ws = path.join(tmp, "ws");
    await mkdir(ws, { recursive: true });
    const dir = await makeBundle(tmp, {
      schemaVersion: "1.1.0",
      id: "perm-test",
      name: "Perm Test",
      version: "0.1.0",
      opencode: { permission: { webfetch: "ask", bash: "allow" } },
    });
    await installBundle({ bundleDir: dir, workspaceRoot: ws, dataDir });
    const oc = await readOpencodeJson(ws);
    if (oc.permission?.webfetch !== "ask") throw new Error(`webfetch 未合并: ${JSON.stringify(oc)}`);
    if (oc.permission?.bash !== "allow") throw new Error("bash 未合并");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("C1.2e 卸载后 opencode.json 合并字段精确移除", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "c1-uninstall-"));
  try {
    const dataDir = path.join(tmp, "data");
    const ws = path.join(tmp, "ws");
    await mkdir(ws, { recursive: true });
    const dir = await makeBundle(tmp, {
      schemaVersion: "1.1.0",
      id: "perm-test2",
      name: "Perm Test 2",
      version: "0.1.0",
      opencode: { permission: { bash: "allow" } },
    });
    await installBundle({ bundleDir: dir, workspaceRoot: ws, dataDir });
    await uninstallBundle({ id: "perm-test2", dataDir, workspaceRoot: ws });
    const oc = await readOpencodeJson(ws);
    if (oc.permission?.bash !== undefined) throw new Error(`bash 未移除: ${JSON.stringify(oc)}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

// ---- C1.3 dependencies 测试 ----

test("C1.3 dependencies 缺失时报错", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "c1-deps-"));
  try {
    const dataDir = path.join(tmp, "data");
    const ws = path.join(tmp, "ws");
    await mkdir(ws, { recursive: true });
    const dir = await makeBundle(tmp, {
      schemaVersion: "1.1.0",
      id: "needs-dep",
      name: "Needs Dep",
      version: "0.1.0",
      dependencies: ["nonexistent-dep"],
    });
    let threw = false;
    try {
      await installBundle({ bundleDir: dir, workspaceRoot: ws, dataDir });
    } catch (e) {
      threw = true;
      if (!String(e.message).includes("缺少依赖 bundle")) throw new Error(`错误信息不对: ${e.message}`);
    }
    assert(threw, "缺少 dependencies 应报错");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("C1.3 requires.bundles 作为 dependencies 别名（向后兼容）", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "c1-deps2-"));
  try {
    const dataDir = path.join(tmp, "data");
    const ws = path.join(tmp, "ws");
    await mkdir(ws, { recursive: true });
    const dir = await makeBundle(tmp, {
      schemaVersion: "1.0.0",
      id: "needs-dep-legacy",
      name: "Needs Dep Legacy",
      version: "0.1.0",
      requires: { bundles: ["nonexistent-legacy"] },
    });
    let threw = false;
    try {
      await installBundle({ bundleDir: dir, workspaceRoot: ws, dataDir });
    } catch {
      threw = true;
    }
    assert(threw, "requires.bundles 也应触发依赖检查");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

// ---- C1.4 scope 测试 ----

test("C1.4 scope=user 写入用户配置目录", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "c1-scope-"));
  try {
    const dataDir = path.join(tmp, "data");
    const ws = path.join(tmp, "ws");
    await mkdir(ws, { recursive: true });
    // 用临时 HOME 覆盖 resolveUserConfigRoot（仅本测试内）
    const fakeHome = path.join(tmp, "fake-home");
    await mkdir(fakeHome, { recursive: true });
    const oldHome = process.env.HOME;
    const oldAppdata = process.env.APPDATA;
    process.env.HOME = fakeHome;
    if (process.platform === "win32") process.env.APPDATA = path.join(fakeHome, "AppData", "Roaming");

    const dir = await makeBundle(tmp, {
      schemaVersion: "1.1.0",
      id: "user-scope-test",
      name: "User Scope",
      version: "0.1.0",
      scope: "user",
      opencode: { permission: { edit: "allow" } },
    });
    await installBundle({ bundleDir: dir, workspaceRoot: ws, dataDir });

    // 验证 opencode.json 写在 user 配置目录而非 workspace
    const userConfigRoot = process.platform === "win32"
      ? path.join(process.env.APPDATA, "opencode")
      : path.join(fakeHome, ".config", "opencode");
    const userOc = await readOpencodeJson(userConfigRoot);
    if (userOc.permission?.edit !== "allow") throw new Error(`user scope opencode.json 未合并: ${JSON.stringify(userOc)}`);

    const wsOc = await readOpencodeJson(ws);
    if (wsOc.permission?.edit !== undefined) throw new Error("scope=user 不应写入 workspace opencode.json");

    process.env.HOME = oldHome;
    process.env.APPDATA = oldAppdata;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

// ---- C1.5 文件冲突检测测试 ----

test("C1.5a 两个 bundle 竞争同一 skill 文件路径时报冲突", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "c1-conflict-"));
  try {
    const dataDir = path.join(tmp, "data");
    const ws = path.join(tmp, "ws");
    await mkdir(ws, { recursive: true });

    // 两个 bundle，skills 的 basename 相同（browser-automation）
    const dir1 = await makeBundle(tmp, {
      schemaVersion: "1.1.0",
      id: "bundle-a",
      name: "A",
      version: "0.1.0",
      skills: [{ path: "skills/browser-automation" }],
    }, { "skills/browser-automation/SKILL.md": "# A" });

    const dir2 = await makeBundle(path.join(tmp, "nested"), {
      schemaVersion: "1.1.0",
      id: "bundle-b",
      name: "B",
      version: "0.1.0",
      skills: [{ path: "skills/browser-automation" }],
    }, { "skills/browser-automation/SKILL.md": "# B" });

    await installBundle({ bundleDir: dir1, workspaceRoot: ws, dataDir });
    let threw = false;
    try {
      await installBundle({ bundleDir: dir2, workspaceRoot: ws, dataDir });
    } catch (e) {
      threw = true;
      if (!String(e.message).includes("文件路径冲突")) throw new Error(`错误信息不对: ${e.message}`);
    }
    assert(threw, "第二个 bundle 应报冲突");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("C1.5b 卸载 bundle 不影响其他 bundle 的独立 opencode key", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "c1-indep-"));
  try {
    const dataDir = path.join(tmp, "data");
    const ws = path.join(tmp, "ws");
    await mkdir(ws, { recursive: true });

    const dir1 = await makeBundle(tmp, {
      schemaVersion: "1.1.0",
      id: "indep-a",
      name: "Indep A",
      version: "0.1.0",
      opencode: { plugin: ["foo"] },
    });
    const dir2 = await makeBundle(path.join(tmp, "n"), {
      schemaVersion: "1.1.0",
      id: "indep-b",
      name: "Indep B",
      version: "0.1.0",
      opencode: { plugin: ["bar"] },
    });

    await installBundle({ bundleDir: dir1, workspaceRoot: ws, dataDir });
    await installBundle({ bundleDir: dir2, workspaceRoot: ws, dataDir });

    // 卸载 indep-a：bar（属于 indep-b）应保留，foo 应移除
    await uninstallBundle({ id: "indep-a", dataDir, workspaceRoot: ws });
    const oc = await readOpencodeJson(ws);
    if (!oc.plugin?.includes("bar")) throw new Error(`bar 被误删: ${JSON.stringify(oc)}`);
    if (oc.plugin?.includes("foo")) throw new Error(`foo 应被移除: ${JSON.stringify(oc)}`);

    await uninstallBundle({ id: "indep-b", dataDir, workspaceRoot: ws });
    const oc2 = await readOpencodeJson(ws);
    if (oc2.plugin && oc2.plugin.length > 0) throw new Error(`plugin 应清空: ${JSON.stringify(oc2)}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

// ---- runner ----

async function main() {
  console.log(`C1 smoke: ${tests.length} 项测试\n`);
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`      ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed}/${tests.length} 通过${failed > 0 ? `，${failed} 失败` : ""}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("smoke runner 崩溃:", e);
  process.exit(2);
});
