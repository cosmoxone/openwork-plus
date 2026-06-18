#!/usr/bin/env node
/**
 * 手工测试 / 部署前自动化门禁（比 test:convergence 更短，聚焦可发布路径）。
 * 用法：pnpm run pre-manual-test
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

/** @type {Array<{ name: string, script: string, args?: string[] }>} */
const STEPS = [
  { name: "bundle-smoke", script: "apps/orchestrator/test/bundle-smoke.mjs" },
  { name: "bundle-pack-smoke", script: "apps/orchestrator/test/bundle-pack-smoke.mjs" },
  { name: "bundle-catalog-smoke", script: "apps/orchestrator/test/bundle-catalog-smoke.mjs" },
  { name: "sprint1-smoke", script: "apps/orchestrator/test/sprint1-smoke.mjs" },
  { name: "sprint2-smoke", script: "apps/orchestrator/test/sprint2-smoke.mjs" },
  { name: "sprint3-scenario-e-smoke", script: "apps/orchestrator/test/sprint3-scenario-e-smoke.mjs" },
  { name: "sandbox-bootstrap-smoke", script: "packages/sandbox-bootstrap/test/bootstrap-smoke.mjs" },
  { name: "wsl-exec-smoke", script: "packages/sandbox-bootstrap/test/wsl-exec-smoke.mjs" },
  { name: "task-scheduler-smoke", script: "packages/task-scheduler/test/smoke.mjs" },
  { name: "task-scheduler-p3-3", script: "packages/task-scheduler/test/p3-3-smoke.mjs" },
  { name: "knowledge-wiki-smoke", script: "packages/knowledge-wiki/test/smoke.mjs" },
  { name: "knowledge-mgmt-offline", script: "apps/orchestrator/test/knowledge-mgmt-offline-smoke.mjs" },
  { name: "bundle-hub-preflight", script: "scripts/hub-first-release-preflight.mjs" },
  { name: "bundle-hub-deploy-pack", script: "scripts/hub-cdn-deploy-pack.mjs" },
];

function runStep(step) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(root, step.script);
    const child = spawn(process.execPath, [scriptPath, ...(step.args ?? [])], {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, OPENWORK_MONOREPO_ROOT: root },
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${step.name} failed (exit ${code})`));
    });
    child.on("error", reject);
  });
}

async function main() {
  console.log(`[pre-manual-test] root=${root}`);
  console.log(`[pre-manual-test] ${STEPS.length} steps\n`);
  const started = Date.now();
  for (const step of STEPS) {
    console.log(`\n=== ${step.name} ===`);
    await runStep(step);
    console.log(`=== PASS: ${step.name} ===`);
  }
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n[pre-manual-test] ALL PASS (${sec}s)`);
  console.log("\n下一步（手工）：见 docs/20-manual-test-deploy-checklist.md");
}

main().catch((err) => {
  console.error(`\n[pre-manual-test] FAIL: ${err.message}`);
  process.exitCode = 1;
});
