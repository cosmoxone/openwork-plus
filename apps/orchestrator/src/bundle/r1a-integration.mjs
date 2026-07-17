// R1a: Bundle 引擎层端到端集成测试。
// 与 c1-smoke.mjs（单元/合约测试）不同，本测试模拟真实 bundle 的完整生命周期：
// install → 验证 opencode.json 合并 → list → uninstall → 验证还原。
//
// 使用自构造的 fixture bundle（不触发 preinstall，不依赖外部环境），
// 覆盖 C1 的全部能力：opencode.* 合并、dependencies、scope、冲突检测。
//
// 运行：node apps/orchestrator/src/bundle/r1a-integration.mjs

import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { installBundle, uninstallBundle, listBundles } from "./installer.mjs";

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

async function readOpencodeJson(root) {
  const file = path.join(root, "opencode.json");
  if (!existsSync(file)) return {};
  return JSON.parse(await readFile(file, "utf8"));
}

/**
 * 在 baseDir 下创建一个完整的 fixture bundle 目录。
 * @param {string} baseDir
 * @param {object} manifest
 * @param {Record<string, string>} [files] 相对 bundle 根的额外文件（skill/command 内容等）
 */
async function makeFixtureBundle(baseDir, manifest, files = {}) {
  const dir = path.join(baseDir, manifest.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "bundle.json"), JSON.stringify(manifest, null, 2));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

/**
 * 完整生命周期的集成测试 harness：创建临时 workspace+dataDir，
 * 提供安装/卸载/验证的便捷方法。
 */
async function withHarness(fn) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "r1a-"));
  const harness = {
    tmp,
    dataDir: path.join(tmp, "data"),
    workspace: path.join(tmp, "ws"),
    fixturesDir: path.join(tmp, "fixtures"),
    async install(manifest, files = {}) {
      const dir = await makeFixtureBundle(this.fixturesDir, manifest, files);
      return installBundle({ bundleDir: dir, workspaceRoot: this.workspace, dataDir: this.dataDir });
    },
    async uninstall(id) {
      return uninstallBundle({ id, dataDir: this.dataDir, workspaceRoot: this.workspace });
    },
    async list() {
      return listBundles({ dataDir: this.dataDir });
    },
    async opencode() {
      return readOpencodeJson(this.workspace);
    },
    async opencodeAt(root) {
      return readOpencodeJson(root);
    },
    async fileExists(rel) {
      return existsSync(path.join(this.workspace, rel));
    },
  };
  await mkdir(harness.workspace, { recursive: true });
  await mkdir(harness.fixturesDir, { recursive: true });
  try {
    await fn(harness);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// ============ 集成场景 1：knowledge-mgmt 式 bundle 完整生命周期 ============

test("集成 1：knowledge-mgmt 式 bundle（skills + opencode.instructions + mcp）完整生命周期", async () => {
  await withHarness(async (h) => {
    // 安装
    const result = await h.install(
      {
        schemaVersion: "1.1.0",
        id: "knowledge-mgmt",
        name: "知识库",
        version: "0.5.0",
        scope: "workspace",
        opencode: {
          instructions: ["${BUNDLE_ROOT}/instructions/wiki.md"],
        },
        skills: [{ path: "skills/wiki-curator" }],
        commands: [{ path: "commands/corpus-scan.md" }],
        mcp: {
          servers: {
            "sqlite-vec-rag": {
              command: "node",
              args: ["${BUNDLE_ROOT}/vendor/sqlite-vec-mcp.mjs"],
            },
          },
        },
      },
      {
        "skills/wiki-curator/SKILL.md": "# Wiki Curator",
        "commands/corpus-scan.md": "# corpus-scan command",
        "instructions/wiki.md": "# Wiki guidelines",
      },
    );

    // 验证安装结果
    assert(result.id === "knowledge-mgmt", "id 应为 knowledge-mgmt");
    assert(result.addedMcp.includes("sqlite-vec-rag"), "应注册 sqlite-vec-rag MCP");
    assert(result.createdPaths.length === 2, "应复制 skills + commands 两个目录");

    // 验证 opencode.json 合并
    const oc = await h.opencode();
    assert(Array.isArray(oc.instructions) && oc.instructions.length === 1, "instructions 应合并");
    assert(oc.mcp && oc.mcp["sqlite-vec-rag"], "mcp.sqlite-vec-rag 应存在");
    assert(oc.mcp["sqlite-vec-rag"].command[0] === "node", "mcp 命令应平铺为 local 格式");

    // 验证文件复制
    assert(await h.fileExists(".opencode/skills/wiki-curator/SKILL.md"), "skill 文件应存在");
    assert(await h.fileExists(".opencode/commands/corpus-scan.md"), "command 文件应存在");

    // 验证 list
    const list = await h.list();
    assert(list.length === 1 && list[0].id === "knowledge-mgmt", "list 应显示已安装");

    // 卸载
    const unresult = await h.uninstall("knowledge-mgmt");
    assert(unresult.removedMcp.includes("sqlite-vec-rag"), "卸载应移除 MCP");

    // 验证还原
    const oc2 = await h.opencode();
    assert(!oc2.mcp || !oc2.mcp["sqlite-vec-rag"], "卸载后 MCP 应移除");
    assert(!oc2.instructions || oc2.instructions.length === 0, "卸载后 instructions 应移除");
    assert(!await h.fileExists(".opencode/skills/wiki-curator/SKILL.md"), "卸载后 skill 文件应删除");

    const list2 = await h.list();
    assert(list2.length === 0, "卸载后 list 应为空");
  });
});

// ============ 集成场景 2：computer-use 式 bundle（dependencies + opencode.permission） ============

test("集成 2：computer-use 式 bundle（dependencies 链 + opencode.permission 策略）", async () => {
  await withHarness(async (h) => {
    // 先装 base bundle（被依赖）
    await h.install({
      schemaVersion: "1.1.0",
      id: "sandbox-bootstrap",
      name: "Sandbox Bootstrap",
      version: "0.1.0",
    });

    // 装 computer-use（依赖 sandbox-bootstrap）
    const result = await h.install({
      schemaVersion: "1.1.0",
      id: "computer-use",
      name: "RPA",
      version: "0.1.0",
      dependencies: ["sandbox-bootstrap"],
      opencode: {
        permission: {
          webfetch: "ask",
          bash: "allow",
          mcp: { "gui-operate": "allow" },
        },
      },
    });

    assert(result.id === "computer-use", "computer-use 应安装成功");

    // 验证 permission 深度合并
    const oc = await h.opencode();
    assert(oc.permission.webfetch === "ask", "permission.webfetch 应为 ask");
    assert(oc.permission.bash === "allow", "permission.bash 应为 allow");
    assert(oc.permission.mcp["gui-operate"] === "allow", "permission.mcp.gui-operate 应为 allow");

    // 卸载 computer-use：permission 应移除
    await h.uninstall("computer-use");
    const oc2 = await h.opencode();
    assert(!oc2.permission || oc2.permission.webfetch === undefined, "卸载后 permission.webfetch 应移除");

    // sandbox-bootstrap 仍在
    const list = await h.list();
    assert(list.length === 1 && list[0].id === "sandbox-bootstrap", "sandbox-bootstrap 应仍在");
  });
});

// ============ 集成场景 3：多 bundle 共存 + 独立 opencode key ============

test("集成 3：多 bundle 共存（独立 opencode key 互不干扰）", async () => {
  await withHarness(async (h) => {
    // bundle-a 注册 plugin foo + tools.webfetch=false
    await h.install({
      schemaVersion: "1.1.0",
      id: "bundle-a",
      name: "A",
      version: "0.1.0",
      opencode: {
        plugin: ["foo-lib"],
        tools: { webfetch: false },
      },
    });

    // bundle-b 注册 plugin bar + agent 配置
    await h.install({
      schemaVersion: "1.1.0",
      id: "bundle-b",
      name: "B",
      version: "0.1.0",
      opencode: {
        plugin: ["bar-lib"],
        agent: { "test-runner": { temperature: 0.3 } },
      },
    });

    // 两个都在
    const list = await h.list();
    assert(list.length === 2, "两个 bundle 都应已安装");

    // opencode.json 应同时有双方的 key
    const oc = await h.opencode();
    assert(oc.plugin.includes("foo-lib") && oc.plugin.includes("bar-lib"), "两个 plugin 都应在");
    assert(oc.tools.webfetch === false, "tools.webfetch 应在");
    assert(oc.agent["test-runner"].temperature === 0.3, "agent 配置应在");

    // 卸载 bundle-a：foo-lib 和 tools.webfetch 移除，bar-lib 和 agent 保留
    await h.uninstall("bundle-a");
    const oc2 = await h.opencode();
    assert(!oc2.plugin || !oc2.plugin.includes("foo-lib"), "foo-lib 应移除");
    assert(oc2.plugin && oc2.plugin.includes("bar-lib"), "bar-lib 应保留");
    assert(!oc2.tools || oc2.tools.webfetch === undefined, "tools.webfetch 应移除");
    assert(oc2.agent && oc2.agent["test-runner"], "agent 配置应保留");

    // 卸载 bundle-b：全部清空
    await h.uninstall("bundle-b");
    const oc3 = await h.opencode();
    assert(!oc3.plugin || oc3.plugin.length === 0, "plugin 应清空");
    assert(!oc3.agent || Object.keys(oc3.agent).length === 0, "agent 应清空");
  });
});

// ============ 集成场景 4：依赖缺失保护 ============

test("集成 4：dependencies 缺失时安装中止（不留副作用）", async () => {
  await withHarness(async (h) => {
    let threw = false;
    try {
      await h.install({
        schemaVersion: "1.1.0",
        id: "needs-missing-dep",
        name: "Needs Missing Dep",
        version: "0.1.0",
        dependencies: ["nonexistent"],
        opencode: { permission: { bash: "allow" } },
      });
    } catch (e) {
      threw = true;
      assert(String(e.message).includes("缺少依赖 bundle"), "错误信息应说明缺依赖");
    }
    assert(threw, "缺依赖应抛错");

    // 验证无副作用：bundle 未注册，opencode.json 未被修改
    const list = await h.list();
    assert(list.length === 0, "失败后不应有 bundle 注册");
    const oc = await h.opencode();
    assert(Object.keys(oc).length === 0, "失败后 opencode.json 应为空");
  });
});

// ============ 集成场景 5：文件冲突保护 ============

test("集成 5：两个 bundle 争用同一 skill 路径时第二个失败（不覆盖）", async () => {
  await withHarness(async (h) => {
    await h.install(
      {
        schemaVersion: "1.1.0",
        id: "first-bundle",
        name: "First",
        version: "0.1.0",
        skills: [{ path: "skills/shared-skill" }],
      },
      { "skills/shared-skill/SKILL.md": "# First" },
    );

    let threw = false;
    try {
      await h.install(
        {
          schemaVersion: "1.1.0",
          id: "second-bundle",
          name: "Second",
          version: "0.1.0",
          skills: [{ path: "skills/shared-skill" }],
        },
        { "skills/shared-skill/SKILL.md": "# Second" },
      );
    } catch (e) {
      threw = true;
      assert(String(e.message).includes("文件路径冲突"), "错误信息应说明冲突");
    }
    assert(threw, "第二个 bundle 应报冲突");

    // 第一个 bundle 的文件未被覆盖
    const content = await readFile(path.join(h.workspace, ".opencode/skills/shared-skill/SKILL.md"), "utf8");
    assert(content.includes("First"), "第一个 bundle 的文件不应被覆盖");

    const list = await h.list();
    assert(list.length === 1 && list[0].id === "first-bundle", "只有第一个 bundle 应注册");
  });
});

// ============ 集成场景 6：replace 模式重装 ============

test("集成 6：replace=true 时重装同名 bundle（先卸载再装）", async () => {
  await withHarness(async (h) => {
    // 第一版
    await h.install(
      {
        schemaVersion: "1.1.0",
        id: "upgrade-test",
        name: "Upgrade Test",
        version: "0.1.0",
        opencode: { plugin: ["old-lib"] },
      },
    );

    // 直接装同名应报错
    let threw = false;
    try {
      await h.install({
        schemaVersion: "1.1.0",
        id: "upgrade-test",
        name: "Upgrade Test",
        version: "0.2.0",
        opencode: { plugin: ["new-lib"] },
      });
    } catch {
      threw = true;
    }
    assert(threw, "同名 bundle 无 replace 应报错");

    // 用 replace 重装
    const dir = await makeFixtureBundle(h.fixturesDir, {
      schemaVersion: "1.1.0",
      id: "upgrade-test",
      name: "Upgrade Test",
      version: "0.2.0",
      opencode: { plugin: ["new-lib"] },
    });
    await installBundle({
      bundleDir: dir,
      workspaceRoot: h.workspace,
      dataDir: h.dataDir,
      replace: true,
    });

    const list = await h.list();
    assert(list.length === 1, "replace 后应只有一个版本");
    assert(list[0].version === "0.2.0", "版本应为 0.2.0");

    const oc = await h.opencode();
    assert(oc.plugin.includes("new-lib") && !oc.plugin.includes("old-lib"), "plugin 应更新为新版本");
  });
});

// ---- runner ----

async function main() {
  console.log(`R1a 集成测试: ${tests.length} 个场景\n`);
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
  console.error("集成测试 runner 崩溃:", e);
  process.exit(2);
});
