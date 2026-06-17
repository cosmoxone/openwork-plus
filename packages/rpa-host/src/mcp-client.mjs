import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {string} serverPath
 * @param {string} toolName
 * @param {Record<string, unknown>} [args]
 * @param {{ dataDir?: string, timeoutMs?: number }} [opts]
 */
export async function callMcpTool(serverPath, toolName, args = {}, opts = {}) {
  const env = { ...process.env };
  if (opts.dataDir) env.OPENWORK_DATA_DIR = opts.dataDir;

  const child = spawn(process.execPath, [serverPath], { env, stdio: ["pipe", "pipe", "ignore"] });

  /** @type {Promise<unknown>} */
  const resultPromise = new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("MCP call timed out"));
    }, opts.timeoutMs ?? 30_000);

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      for (const line of buf.split("\n")) {
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 2 && msg.result !== undefined) {
          clearTimeout(timer);
          child.kill();
          resolve(msg.result);
          return;
        }
        if (msg.id === 2 && msg.error) {
          clearTimeout(timer);
          child.kill();
          reject(new Error(msg.error.message ?? "MCP tool error"));
        }
      }
    });

    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timer);
        reject(new Error(`MCP server exited with code ${code}`));
      }
    });
  });

  const requests = [
    {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "rpa-host", version: "0.1.0" },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: toolName, arguments: args } },
  ];
  child.stdin.write(requests.map((r) => JSON.stringify(r)).join("\n") + "\n");

  return resultPromise;
}

/** @param {string} [monorepoRoot] */
export function defaultGuiOperateServerPath(monorepoRoot) {
  const root =
    monorepoRoot ??
    process.env.OPENWORK_MONOREPO_ROOT ??
    path.resolve(here, "..", "..");
  return path.join(root, "packages", "gui-operate-mcp", "dist", "server.js");
}

export { defaultGuiOperateServerPath as resolveGuiOperateServerPath };
