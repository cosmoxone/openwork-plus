// P1-3：GitHub MCP 只读 API 冒烟（证明 CI 相关能力可连通）。
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

async function mcpToolCall(token, toolName, args) {
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
          clientInfo: { name: "openwork-ci-smoke", version: "0" },
        },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: args },
      },
    ];
    child.stdin.write(reqs.map((r) => JSON.stringify(r)).join("\n") + "\n");
    child.stdin.end();
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`github MCP tools/call(${toolName}) 超时`));
    }, 45_000);
    child.stdout.on("data", (c) => {
      buf += c.toString();
      for (const line of buf.split("\n")) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1) {
            clearTimeout(timer);
            child.kill();
            if (msg.error) reject(new Error(JSON.stringify(msg.error)));
            else resolve(msg.result);
          }
        } catch {
          /* partial line */
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
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-ci-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-ci-data-"));
  process.env.OPENWORK_MONOREPO_ROOT = monorepoRoot;

  try {
    await installBundle({ bundleDir, workspaceRoot, dataDir });
    const cfg = JSON.parse(await readFile(path.join(workspaceRoot, "opencode.json"), "utf8"));
    assert.ok(cfg.mcp?.["github-actions"], "opencode.json 应含 github-actions MCP");

    if (!token) {
      console.log("SKIP: 未设置 GITHUB_TOKEN，跳过 GitHub MCP 只读 API 调用");
      console.log("PASS: P1-3 CI 触发配置预检（需 token 完成端到端）");
      return;
    }

    const result = await mcpToolCall(token, "search_repositories", {
      query: "openwork language:typescript",
      page: 1,
      perPage: 3,
    });
    const text = result?.content?.find((c) => c.type === "text")?.text ?? "";
    assert.ok(text.length > 0, "search_repositories 应返回文本内容");
    assert.ok(!result.isError, "search_repositories 不应报错");
    console.log("PASS: P1-3 GitHub MCP search_repositories（CI 连通）");
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
