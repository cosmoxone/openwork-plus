#!/usr/bin/env node
/**
 * S3-E7 会话 E2E：computer-use 安装 → OpenCode command.list 含 gui-screenshot
 * → session.command("gui-screenshot") → 助手回复（mock LLM；不依赖真实桌面截图）。
 *
 * 依赖：PATH 中的 opencode CLI；packages/gui-operate-mcp 已 build。
 */
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { installBundle, uninstallBundle } from "../../orchestrator/src/bundle/installer.mjs";
import { findFreePort, makeClient, spawnOpencodeServe, waitForHealthy } from "./_util.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const bundleDir = path.join(repoRoot, "bundles", "computer-use");
const guiServer = path.join(repoRoot, "packages", "gui-operate-mcp", "dist", "server.js");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function writeSse(res, chunks) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

function createGuiScreenshotStream() {
  const content =
    "Captured a desktop screenshot via gui-operate MCP. Visible: OpenWork main window, taskbar, and clickable buttons including Settings and New Session.";
  return [
    {
      id: "chatcmpl-gui",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    },
    {
      id: "chatcmpl-gui",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    },
    {
      id: "chatcmpl-gui",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    },
  ];
}

function extractAssistantText(messages) {
  const list = Array.isArray(messages) ? messages.slice() : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const msg = list[i];
    const parts = Array.isArray(msg?.parts) ? msg.parts : [];
    for (let p = parts.length - 1; p >= 0; p -= 1) {
      const part = parts[p];
      if (part?.type === "text" && typeof part.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }
  return null;
}

async function main() {
  if (!existsSync(guiServer)) {
    console.error("SKIP: 请先构建 gui-operate-mcp（cd packages/gui-operate-mcp && npm run build）");
    process.exit(0);
  }

  process.env.OPENWORK_MONOREPO_ROOT = repoRoot;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-s3e7-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-s3e7-data-"));
  const mockSockets = new Set();

  /** @type {import('node:http').Server | null} */
  let mock = null;
  /** @type {Awaited<ReturnType<typeof spawnOpencodeServe>> | null} */
  let opencode = null;

  const results = { ok: true, steps: [] };

  function step(name, fn) {
    results.steps.push({ name, status: "running" });
    const idx = results.steps.length - 1;
    return Promise.resolve()
      .then(fn)
      .then((data) => {
        results.steps[idx] = { name, status: "ok", data };
      })
      .catch((e) => {
        results.ok = false;
        results.steps[idx] = {
          name,
          status: "error",
          error:
            e instanceof Error
              ? e.message
              : typeof e === "object" && e !== null
                ? JSON.stringify(e)
                : String(e),
        };
        throw e;
      });
  }

  try {
    await step("bundle.install computer-use", async () => {
      const res = await installBundle({ bundleDir, workspaceRoot, dataDir });
      assert.equal(res.id, "computer-use");
      return { id: res.id, mcp: res.addedMcp };
    });

    const mockPort = await findFreePort();
    const baseURL = `http://127.0.0.1:${mockPort}/v1`;

    await step("provider.mock.start", async () => {
      mock = http.createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
        if (req.method === "GET" && url.pathname.endsWith("/models")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ object: "list", data: [{ id: "qwen-plus", object: "model" }] }));
          return;
        }
        if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
          writeSse(res, createGuiScreenshotStream());
          return;
        }
        res.writeHead(404);
        res.end("not found");
      });
      mock.on("connection", (s) => {
        mockSockets.add(s);
        s.on("close", () => mockSockets.delete(s));
      });
      await new Promise((resolve) => mock.listen(mockPort, "127.0.0.1", resolve));
      return { baseURL };
    });

    await step("workspace.opencode.json merge mock provider", async () => {
      const cfgPath = path.join(workspaceRoot, "opencode.json");
      const cfg = JSON.parse(await readFile(cfgPath, "utf8"));
      cfg.$schema = cfg.$schema ?? "https://opencode.ai/config.json";
      cfg.enabled_providers = ["alibaba"];
      cfg.provider = {
        ...(cfg.provider ?? {}),
        alibaba: {
          options: { apiKey: "test-key", baseURL },
        },
      };
      // 会话 E2E 只验证斜杠命令链路；无头 CI 不启动 gui-operate MCP 进程。
      if (cfg.mcp?.["gui-operate"]) {
        cfg.mcp["gui-operate"].enabled = false;
      }
      await writeFile(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
      return { providers: cfg.enabled_providers };
    });

    const port = await findFreePort();
    opencode = await spawnOpencodeServe({ directory: workspaceRoot, port });
    const client = makeClient({ baseUrl: opencode.baseUrl, directory: opencode.cwd });

    await step("opencode.health", async () => waitForHealthy(client));

    await step("command.list includes gui-screenshot", async () => {
      const result = await client.command.list({ directory: opencode.cwd });
      const list = Array.isArray(result) ? result : (result?.data ?? []);
      const names = list.map((c) => String(c.name ?? ""));
      assert.ok(names.includes("gui-screenshot"), `commands: ${names.join(", ")}`);
      return { names };
    });

    let sessionId = "";

    await step("session.create", async () => {
      const session = await client.session.create({ title: "S3-E7 gui-screenshot E2E" });
      sessionId = session.id;
      assert.ok(sessionId);
      return { id: sessionId };
    });

    await step("session.command gui-screenshot", async () => {
      await client.session.command({
        sessionID: sessionId,
        command: "gui-screenshot",
        arguments: "",
        model: "alibaba/qwen-plus",
      });
      return {};
    });

    await step("assert assistant describes screenshot", async () => {
      const deadline = Date.now() + 30_000;
      let text = "";
      while (Date.now() < deadline) {
        const msgs = await client.session.messages({ sessionID: sessionId, limit: 50 });
        text = extractAssistantText(msgs) ?? "";
        if (/screenshot|gui-operate|window|desktop/i.test(text)) break;
        await sleep(500);
      }
      assert.ok(text, "expected assistant text in session messages");
      assert.match(text, /screenshot|gui-operate|window|desktop/i, text);
      return { excerpt: text.slice(0, 200) };
    });

    await step("bundle.uninstall", async () => {
      await uninstallBundle({ id: "computer-use", dataDir });
      return {};
    });

    console.log("PASS: S3-E7 gui-screenshot session E2E (OpenCode + mock provider)");
    console.log(JSON.stringify(results, null, 2));
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e !== null
          ? JSON.stringify(e)
          : String(e);
    results.ok = false;
    results.error = message;
    if (opencode) results.stderr = opencode.getStderr?.();
    console.error("FAIL:", message);
    console.error(JSON.stringify(results, null, 2));
    process.exitCode = 1;
  } finally {
    if (opencode) await opencode.close();
    if (mock) {
      for (const s of mockSockets) s.destroy();
      await new Promise((r) => mock.close(r));
    }
    delete process.env.OPENWORK_MONOREPO_ROOT;
    await sleep(250);
    for (const dir of [workspaceRoot, dataDir]) {
      try {
        await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {
        // Windows may still hold handles briefly after opencode exits.
      }
    }
    if (results.ok) process.exitCode = 0;
  }
}

main();
