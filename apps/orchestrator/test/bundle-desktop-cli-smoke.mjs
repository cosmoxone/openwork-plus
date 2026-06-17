// desktop-cli catalog 命令冒烟（builtin + merge）。
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "src", "bundle", "desktop-cli.mjs");
const builtin = path.join(
  here,
  "..",
  "..",
  "desktop",
  "src-tauri",
  "resources",
  "bundles",
  "catalog.builtin.json",
);

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || stdout || `exit ${code}`));
      else resolve(JSON.parse(stdout.trim()));
    });
  });
}

async function main() {
  const out = await run(["catalog", "--builtin", builtin]);
  assert.equal(out.ok, true);
  assert.ok(Array.isArray(out.bundles));
  assert.ok(out.bundles.some((b) => b.id === "computer-use"));
  assert.ok(out.bundles.some((b) => b.id === "test-automation"));
  console.log("PASS: desktop-cli catalog smoke");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
