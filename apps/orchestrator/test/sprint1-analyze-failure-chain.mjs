// S1-A7 链路预检：analyze-failure 斜杠命令 + 技能 + test-db MCP 就绪（无需 OpenCode 进程）。
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { installBundle, uninstallBundle } from "../src/bundle/installer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = path.join(here, "..", "..", "..", "bundles", "test-automation");
const monorepoRoot = path.join(here, "..", "..", "..");
const testDbMcp = path.join(monorepoRoot, "packages", "test-db-mcp", "bin", "test-db-mcp.mjs");

async function mcpToolsList() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [testDbMcp], {
      env: { ...process.env, OPENWORK_TEST_DB: path.join(os.tmpdir(), "ow-ta-chain-db.json") },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const reqs = [
      { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ];
    child.stdin.write(reqs.map((r) => JSON.stringify(r)).join("\n") + "\n");
    let buf = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("test-db MCP 超时")); }, 10000);
    child.stdout.on("data", (c) => {
      buf += c.toString();
      for (const line of buf.split("\n")) {
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1 && msg.result?.tools) {
            clearTimeout(timer);
            child.kill();
            resolve(msg.result.tools.map((t) => t.name));
          }
        } catch { /* skip */ }
      }
    });
  });
}

async function main() {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-ta-chain-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-ta-chain-data-"));
  process.env.OPENWORK_MONOREPO_ROOT = monorepoRoot;
  try {
    await installBundle({ bundleDir, workspaceRoot, dataDir });

    const cmdPath = path.join(workspaceRoot, ".opencode", "commands", "analyze-failure.md");
    assert.ok(existsSync(cmdPath));
    const cmd = await readFile(cmdPath, "utf8");
    assert.match(cmd, /analyze-failure/i);
    assert.match(cmd, /test-db|test-runner|list.failures/i);

    const skillPath = path.join(workspaceRoot, ".opencode", "skills", "analyze-failure", "SKILL.md");
    assert.ok(existsSync(skillPath));
    const skill = await readFile(skillPath, "utf8");
    assert.match(skill, /test-db|list.failures/i);

    const cfg = JSON.parse(await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"));
    assert.ok(cfg.mcp?.["test-db"], "opencode.json 应含 test-db MCP");

    if (existsSync(testDbMcp)) {
      const tools = await mcpToolsList();
      assert.ok(tools.some((n) => /fail|run|list/i.test(n)), `test-db 工具应可 list: ${tools.join(",")}`);
    }

    await uninstallBundle({ id: "test-automation", dataDir });
    console.log("PASS: S1-A7 analyze-failure 链路预检（命令/技能/MCP）");
    console.log("NOTE: 完整会话 E2E：`pnpm --filter @openwork-plus/app test:analyze-failure-session`；桌面手工见 MANUAL-TEST.md §5");
  } finally {
    delete process.env.OPENWORK_MONOREPO_ROOT;
    await rm(workspaceRoot, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
