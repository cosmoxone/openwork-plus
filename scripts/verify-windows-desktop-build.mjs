#!/usr/bin/env node
/**
 * Local gate before pushing Windows desktop CI changes.
 * Runs the same pre-Tauri steps as GitHub Actions, then optional MSI build.
 *
 * Usage:
 *   node scripts/verify-windows-desktop-build.mjs
 *   node scripts/verify-windows-desktop-build.mjs --full
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const full = process.argv.includes("--full");

function run(label, cmd, args, opts = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? 1})`);
  }
}

try {
  run("orchestrator sidecar (bun build)", "bun", [
    "./script/build.ts",
    "--outdir",
    "../../apps/desktop/src-tauri/sidecars",
    "--filename",
    "openwork-orchestrator",
    "--target",
    "bun-windows-x64",
  ], { cwd: path.join(root, "apps/orchestrator") });

  run("tauri beforeBuildCommand", "node", ["./scripts/tauri-before-build.mjs"], {
    cwd: path.join(root, "apps/desktop"),
  });

  if (full) {
    const ciConfig = path.join(root, "apps/desktop/src-tauri/tauri.ci.json");
    writeFileSync(ciConfig, JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
    run("tauri build (MSI, no updater signing)", "pnpm", [
      "--filter",
      "@openwork-plus/desktop",
      "exec",
      "tauri",
      "build",
      "--target",
      "x86_64-pc-windows-msvc",
      "--bundles",
      "msi",
      "--config",
      "src-tauri/tauri.ci.json",
    ]);
  }

  console.log("\n[verify:windows-build] OK");
} catch (error) {
  console.error(`\n[verify:windows-build] FAIL: ${error.message}`);
  process.exitCode = 1;
}
