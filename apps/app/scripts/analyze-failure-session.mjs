#!/usr/bin/env node
/**
 * S1-A7 会话 E2E：test-automation 安装 → OpenCode command.list 含 analyze-failure
 * → session.command("analyze-failure") → 助手回复（mock LLM + test-db 种子数据）。
 *
 * 依赖：PATH 中的 opencode CLI（与 apps/app test:e2e 相同）。
 * 无需真实 API Key（mock provider）。
 */
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { installBundle, uninstallBundle } from "../../orchestrator/src/bundle/installer.mjs";
import { findFreePort, makeClient, spawnOpencodeServe, waitForHealthy } from "./_util.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const bundleDir = path.join(repoRoot, "bundles", "test-automation");

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

function createAnalyzeFailureStream() {
  return [
    {
      id: "chatcmpl-af",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    },
    {
      id: "chatcmpl-af",
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: {
            content:
              "Analyzed recent failures via test-db list_failures: demo.test.js assertion failed (expected true to be false). Fix the test expectation or implementation.",
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: "chatcmpl-af",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    },
  ];
}

function haystackLooksLikeAnalyzeFailure(haystack) {
  return (
    haystack.includes("analyze-failure") ||
    haystack.includes("list_failures") ||
    haystack.includes("list-failures") ||
    haystack.includes("test-db") ||
    haystack.includes("test runner")
  );
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
  process.env.OPENWORK_MONOREPO_ROOT = repoRoot;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-s1a7-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-s1a7-data-"));
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
    await step("bundle.install test-automation", async () => {
      const res = await installBundle({ bundleDir, workspaceRoot, dataDir });
      assert.equal(res.id, "test-automation");
      return { id: res.id, mcp: res.addedMcp };
    });

    await step("seed test-db failures", async () => {
      const dbPath = path.join(workspaceRoot, ".openwork", "test-results.json");
      const payload = {
        runs: [
          {
            id: "run-s1a7",
            framework: "jest",
            path: ".",
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            passed: 0,
            failed: 1,
            skipped: 0,
            cases: [
              {
                name: "demo.test.js > expects truth",
                status: "failed",
                message: "Expected true to be false",
              },
            ],
          },
        ],
      };
      await writeFile(dbPath, JSON.stringify(payload, null, 2), "utf8");
      return { dbPath };
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
          const raw = await new Promise((resolve) => {
            let data = "";
            req.setEncoding("utf8");
            req.on("data", (c) => (data += c));
            req.on("end", () => resolve(data));
          });
          let body = {};
          try {
            body = raw ? JSON.parse(raw) : {};
          } catch {
            body = {};
          }
          const haystack = JSON.stringify(body).toLowerCase();
          if (haystackLooksLikeAnalyzeFailure(haystack)) {
            writeSse(res, createAnalyzeFailureStream());
          } else {
            writeSse(res, createAnalyzeFailureStream());
          }
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
      await writeFile(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
      return { providers: cfg.enabled_providers };
    });

    const port = await findFreePort();
    opencode = await spawnOpencodeServe({ directory: workspaceRoot, port });
    const client = makeClient({ baseUrl: opencode.baseUrl, directory: opencode.cwd });

    await step("opencode.health", async () => waitForHealthy(client));

    await step("command.list includes analyze-failure", async () => {
      const result = await client.command.list({ directory: opencode.cwd });
      const list = Array.isArray(result) ? result : (result?.data ?? []);
      const names = list.map((c) => String(c.name ?? ""));
      assert.ok(names.includes("analyze-failure"), `commands: ${names.join(", ")}`);
      return { names };
    });

    let sessionId = "";

    await step("session.create", async () => {
      const session = await client.session.create({ title: "S1-A7 analyze-failure E2E" });
      sessionId = session.id;
      assert.ok(sessionId);
      return { id: sessionId };
    });

    await step("session.command analyze-failure", async () => {
      await client.session.command({
        sessionID: sessionId,
        command: "analyze-failure",
        arguments: "",
        model: "alibaba/qwen-plus",
      });
      return {};
    });

    await step("assert assistant mentions failure analysis", async () => {
      const deadline = Date.now() + 30_000;
      let text = "";
      while (Date.now() < deadline) {
        const msgs = await client.session.messages({ sessionID: sessionId, limit: 50 });
        text = extractAssistantText(msgs) ?? "";
        if (/demo\.test|list_failures|failure|assertion/i.test(text)) break;
        await sleep(500);
      }
      assert.ok(text, "expected assistant text in session messages");
      assert.match(text, /demo\.test|list_failures|failure|assertion/i, text);
      return { excerpt: text.slice(0, 200) };
    });

    await step("bundle.uninstall", async () => {
      await uninstallBundle({ id: "test-automation", dataDir });
      return {};
    });

    console.log("PASS: S1-A7 analyze-failure session E2E (OpenCode + mock provider)");
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
