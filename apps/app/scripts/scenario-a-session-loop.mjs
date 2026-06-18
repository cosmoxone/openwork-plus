#!/usr/bin/env node
/**
 * P1-4 场景 A 四步闭环（OpenCode 会话 + mock LLM）：
 * /generate-test-cases → 种子 test-results → /analyze-failure → /create-regression
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

function streamText(text) {
  return [
    {
      id: "chatcmpl-loop",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    },
    {
      id: "chatcmpl-loop",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    },
    {
      id: "chatcmpl-loop",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    },
  ];
}

const MOCK_BY_COMMAND = {
  "generate-test-cases":
    "Generated jest cases for sum.test.js: should add numbers, should handle negatives. Suggested path: tests/sum.test.js",
  "analyze-failure":
    "Failure in demo.test.js: Expected true to be false. Recommend fixing assertion or implementation; see list_failures.",
  "create-regression":
    "Created regression checklist: re-run jest on sum.test.js, verify demo.test.js expectation, add CI gate.",
};

async function waitForNewAssistantMatch(sessionId, client, pattern, seen) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const msgs = await client.session.messages({ sessionID: sessionId, limit: 80 });
    for (const msg of msgs) {
      const parts = Array.isArray(msg?.parts) ? msg.parts : [];
      for (const part of parts) {
        if (part?.type !== "text" || typeof part.text !== "string") continue;
        const text = part.text.trim();
        if (!text || seen.has(text) || !pattern.test(text)) continue;
        seen.add(text);
        return text;
      }
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for assistant: ${pattern}`);
}

async function main() {
  process.env.OPENWORK_MONOREPO_ROOT = repoRoot;
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "ow-p14-ws-"));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-p14-data-"));
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
          error: e instanceof Error ? e.message : String(e),
        };
        throw e;
      });
  }

  try {
    await step("bundle.install test-automation", async () => {
      const res = await installBundle({ bundleDir, workspaceRoot, dataDir });
      assert.equal(res.id, "test-automation");
      return { mcp: res.addedMcp };
    });

    await step("seed test-results after virtual run", async () => {
      const dbPath = path.join(workspaceRoot, ".openwork", "test-results.json");
      await writeFile(
        dbPath,
        JSON.stringify(
          {
            runs: [
              {
                id: "run-p14",
                framework: "jest",
                path: ".",
                startedAt: new Date().toISOString(),
                finishedAt: new Date().toISOString(),
                passed: 2,
                failed: 1,
                skipped: 0,
                cases: [
                  { name: "demo.test.js > expects truth", status: "failed", message: "Expected true to be false" },
                ],
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );
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
          const haystack = raw.toLowerCase();
          let text = "Scenario A loop step acknowledged.";
          for (const [cmd, reply] of Object.entries(MOCK_BY_COMMAND)) {
            if (haystack.includes(cmd)) {
              text = reply;
              break;
            }
          }
          writeSse(res, streamText(text));
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
      cfg.enabled_providers = ["alibaba"];
      cfg.provider = {
        ...(cfg.provider ?? {}),
        alibaba: { options: { apiKey: "test-key", baseURL } },
      };
      if (cfg.mcp?.["github-actions"]) cfg.mcp["github-actions"].enabled = false;
      if (cfg.mcp?.["test-db"]) cfg.mcp["test-db"].enabled = false;
      await writeFile(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
    });

    const port = await findFreePort();
    opencode = await spawnOpencodeServe({ directory: workspaceRoot, port });
    const client = makeClient({ baseUrl: opencode.baseUrl, directory: opencode.cwd });
    await step("opencode.health", async () => waitForHealthy(client));

    let sessionId = "";
    const seenAssistant = new Set();
    await step("session.create", async () => {
      sessionId = (await client.session.create({ title: "P1-4 scenario A loop" })).id;
      assert.ok(sessionId);
    });

    const commands = ["generate-test-cases", "analyze-failure", "create-regression"];
    for (const command of commands) {
      await step(`session.command ${command}`, async () => {
        await client.session.command({
          sessionID: sessionId,
          command,
          arguments: "",
          model: "alibaba/qwen-plus",
        });
        const pattern =
          command === "generate-test-cases"
            ? /jest|test\.js|cases/i
            : command === "analyze-failure"
              ? /failure|demo\.test|list_failures/i
              : /regression|checklist|ci/i;
        const excerpt = await waitForNewAssistantMatch(sessionId, client, pattern, seenAssistant);
        return { excerpt: excerpt.slice(0, 120) };
      });
    }

    await step("bundle.uninstall", async () => {
      await uninstallBundle({ id: "test-automation", dataDir });
    });

    console.log("PASS: P1-4 scenario A four-step session loop");
    console.log(JSON.stringify(results, null, 2));
  } catch (e) {
    console.error("FAIL:", e instanceof Error ? e.message : String(e));
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
        // ignore
      }
    }
    if (results.ok) process.exitCode = 0;
  }
}

main();
