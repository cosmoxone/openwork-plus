#!/usr/bin/env node
/**
 * P1–P5 机器侧预演：在人工点桌面/UI 前先跑一遍可自动化项。
 *
 * 环境变量：
 *   OPENWORK_CATALOG_URL   — P1 公网 catalog（可选；未设则仅本地 Hub 模拟，见 P1-local）
 *   SKIP_P0=1              — 跳过 pre-manual-test（已跑过时）
 *   SKIP_PLAYWRIGHT=1      — 跳过 P5 Playwright（无 Chrome / 省时间）
 *   SKIP_OPENCODE=1        — 跳过需 opencode 的会话脚本（默认会 resolve sidecar 或 prepare:sidecar）
 *   OPENWORK_MONOREPO_ROOT — 仓库根（默认自动推断）
 *
 * 用法：pnpm run pre-manual-test:p1-p5
 */
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureOpencodeBin, findOpencodeBinSync } from "./resolve-opencode-bin.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.OPENWORK_MONOREPO_ROOT ?? path.join(here, "..");

/** @type {Array<{ phase: string, name: string, script?: string, args?: string[], pnpmArgs?: string[], fn?: () => Promise<void>, optional?: boolean, requiresOpencode?: boolean }>} */
const STEPS = [];

function hasOpencode() {
  return Boolean(findOpencodeBinSync(root));
}

function runNode(scriptRel, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, scriptRel), ...args], {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        OPENWORK_MONOREPO_ROOT: root,
        OPENCODE_BIN: process.env.OPENCODE_BIN,
        OPENWORK_OPENCODE_BIN: process.env.OPENWORK_OPENCODE_BIN,
      },
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${scriptRel} exit ${code}`))));
  });
}

function runPnpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: root,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        OPENWORK_MONOREPO_ROOT: root,
        OPENCODE_BIN: process.env.OPENCODE_BIN,
        OPENWORK_OPENCODE_BIN: process.env.OPENWORK_OPENCODE_BIN,
      },
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`pnpm ${args.join(" ")} exit ${code}`))));
  });
}

function startStaticServer(dir, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const rel = decodeURIComponent((req.url ?? "/").split("?")[0].replace(/^\//, ""));
      const file = path.resolve(dir, rel);
      if (!file.startsWith(path.resolve(dir)) || !existsSync(file)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const body = await readFile(file);
      const ct = rel.endsWith(".json") ? "application/json" : "application/zip";
      res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-store" });
      res.end(body);
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function p1LocalHubDryRun() {
  const packDir = path.join(root, "dist", "bundle-hub", "deploy-pack");
  const catalogPath = path.join(packDir, "catalog.json");
  if (!existsSync(catalogPath)) {
    throw new Error("missing deploy-pack — run pnpm run pre-manual-test first");
  }
  const port = 19223;
  const cdnBase = `http://127.0.0.1:${port}/`;
  await runNode("scripts/publish-remote-catalog.mjs", [
    "--zip-dir",
    packDir,
    "--cdn-base",
    cdnBase,
    "--output",
    path.join(packDir, "catalog.local-test.json"),
  ]);
  const server = await startStaticServer(packDir, port);
  try {
    await runNode("scripts/hub-cdn-verify-remote.mjs", [
      "--catalog-url",
      `${cdnBase}catalog.local-test.json`,
      "--install-smoke",
    ]);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function p1PublicCatalog() {
  const url = process.env.OPENWORK_CATALOG_URL?.trim();
  if (!url) return;
  await runNode("scripts/hub-cdn-verify-remote.mjs", ["--catalog-url", url, "--install-smoke"]);
}

function buildSteps() {
  if (!process.env.SKIP_P0) {
    STEPS.push({ phase: "P0", name: "pre-manual-test", pnpmArgs: ["run", "pre-manual-test"] });
  }

  STEPS.push({
    phase: "P1-local",
    name: "hub-local-catalog-verify+install",
    fn: p1LocalHubDryRun,
  });

  if (process.env.OPENWORK_CATALOG_URL?.trim()) {
    STEPS.push({ phase: "P1-public", name: "hub-verify-remote", fn: p1PublicCatalog });
  }

  STEPS.push(
    { phase: "P2", name: "bundle-desktop-cli-smoke", script: "apps/orchestrator/test/bundle-desktop-cli-smoke.mjs" },
    { phase: "P2", name: "sprint1-analyze-failure-chain", script: "apps/orchestrator/test/sprint1-analyze-failure-chain.mjs" },
    {
      phase: "P2",
      name: "analyze-failure-session",
      pnpmArgs: ["--filter", "@openwork-plus/app", "test:analyze-failure-session"],
      optional: true,
      requiresOpencode: true,
    },
    {
      phase: "P2",
      name: "scenario-a-session-loop",
      pnpmArgs: ["--filter", "@openwork-plus/app", "test:scenario-a-session-loop"],
      optional: true,
      requiresOpencode: true,
    },
    { phase: "P3", name: "knowledge-mgmt-hub-smoke", script: "apps/orchestrator/test/knowledge-mgmt-hub-smoke.mjs" },
    { phase: "P4", name: "rpa-host-smoke", script: "packages/rpa-host/test/rpa-host-smoke.mjs" },
    { phase: "P4", name: "gui-ndjson-smoke", script: "packages/rpa-host/test/gui-ndjson-smoke.mjs" },
    { phase: "P4", name: "p4-scheduler-dry-run", script: "packages/task-scheduler/test/p4-manual-dry-run.mjs" },
  );

  if (!process.env.SKIP_PLAYWRIGHT) {
    STEPS.push(
      { phase: "P5", name: "playwright-bundles-e2e", pnpmArgs: ["test:bundles:e2e"] },
      { phase: "P5", name: "playwright-knowledge-e2e", pnpmArgs: ["test:knowledge:e2e"] },
    );
  }
}

async function runStep(step) {
  if (step.requiresOpencode && (process.env.SKIP_OPENCODE || !hasOpencode())) {
    console.log(`SKIP: ${step.name} (opencode CLI not available)`);
    return "skipped";
  }
  if (step.fn) {
    await step.fn();
    return "passed";
  }
  if (step.script) {
    await runNode(step.script, step.args ?? []);
    return "passed";
  }
  if (step.pnpmArgs) {
    await runPnpm(step.pnpmArgs);
    return "passed";
  }
  return "passed";
}

async function main() {
  buildSteps();
  console.log(`[pre-manual-test:p1-p5] root=${root}`);
  console.log(`[pre-manual-test:p1-p5] OPENWORK_CATALOG_URL=${process.env.OPENWORK_CATALOG_URL ?? "(unset — skip public P1)"}`);

  if (!process.env.SKIP_OPENCODE) {
    const bin = await ensureOpencodeBin({ root, allowDownload: true });
    if (bin) {
      process.env.OPENCODE_BIN = bin;
      process.env.OPENWORK_OPENCODE_BIN = bin;
      console.log(`[pre-manual-test:p1-p5] OPENCODE_BIN=${bin}`);
    } else {
      console.log("[pre-manual-test:p1-p5] opencode not resolved — session E2E will SKIP");
    }
  }

  console.log(`[pre-manual-test:p1-p5] ${STEPS.length} steps\n`);

  /** @type {string[]} */
  const skipped = [];
  /** @type {string[]} */
  const passed = [];
  const started = Date.now();

  for (const step of STEPS) {
    console.log(`\n=== [${step.phase}] ${step.name} ===`);
    try {
      const result = await runStep(step);
      if (result === "skipped") {
        skipped.push(step.name);
      } else {
        passed.push(`${step.phase}:${step.name}`);
        console.log(`=== PASS: ${step.name} ===`);
      }
    } catch (err) {
      if (step.optional) {
        console.log(`SKIP (optional failed): ${step.name} — ${err instanceof Error ? err.message : err}`);
        skipped.push(step.name);
      } else {
        throw err;
      }
    }
  }

  const sec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n[pre-manual-test:p1-p5] DONE (${sec}s)`);
  console.log(`  passed: ${passed.length}`);
  if (skipped.length) console.log(`  skipped: ${skipped.join(", ")}`);
  console.log("\n人工仍须完成（机器无法替代）：");
  console.log("  P1 — 上传 deploy-pack 到真实 CDN（若尚未设置 OPENWORK_CATALOG_URL）");
  console.log("  P2/P3 — OpenWork 桌面：Settings › 行业包、看板 /docs、会话斜杠命令");
  console.log("  P4 — #/plugins/rpa 截图与权限引导 UI");
  console.log("\n详见 docs/20-manual-test-deploy-checklist.md §「机器 vs 人工」");
}

main().catch((err) => {
  console.error(`\n[pre-manual-test:p1-p5] FAIL: ${err.message}`);
  process.exitCode = 1;
});
