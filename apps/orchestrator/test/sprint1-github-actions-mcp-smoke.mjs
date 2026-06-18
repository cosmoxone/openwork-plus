// S1-A8：github-actions MCP 就绪；有 GITHUB_TOKEN 时 tools/list 冒烟。
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { installBundle, uninstallBundle } from "../src/bundle/installer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = path.join(here, "..", "..", "..", "bundles", "test-automation");
const monorepoRoot = path.join(here, "..", "..", "..");

async function mcpToolsList(token) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["-y", "@modelcontextprotocol/server-github"], {
      env: { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: token },
      stdio: ["pipe", "pipe", "ignore"],
      shell: true,
    });
    const reqs = [
      {
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "openwork-smoke", version: "0" },
        },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ];
    child.stdin.write(reqs.map((r) => JSON.stringify(r)).join("\n") + "\n");
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("github-actions MCP tools/list 超时"));
    }, 30_000);
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
        } catch {
          // skip partial lines
        }
      }
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

async function main() {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim();
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-gha-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-gha-data-"));
  process.env.OPENWORK_MONOREPO_ROOT = monorepoRoot;

  try {
    await installBundle({ bundleDir, workspaceRoot, dataDir });
    const cfg = JSON.parse(await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"));
    const gh = cfg.mcp?.["github-actions"];
    assert.ok(gh, "opencode.json 应含 github-actions MCP");
    assert.equal(gh.type, "local");
    assert.ok(Array.isArray(gh.command), "github-actions command 应为数组");

    if (!token) {
      console.log("SKIP: 未设置 GITHUB_TOKEN，跳过 github-actions MCP tools/list");
      console.log("PASS: S1-A8 github-actions MCP 配置预检");
      return;
    }

    const tools = await mcpToolsList(token);
    assert.ok(tools.length > 0, `tools/list 应非空: ${tools.join(",")}`);
    console.log("PASS: S1-A8 github-actions MCP tools/list", tools.slice(0, 5).join(", "));
    await uninstallBundle({ id: "test-automation", dataDir });
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
