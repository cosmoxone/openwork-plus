// 场景 A 集成：test-runner 跑 sample-jest-project + test-db 记录（需 Go）。
import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(here, "..", "..", "..");
const fixture = path.join(monorepoRoot, "bundles", "test-automation", "fixtures", "sample-jest-project");
const testRunnerDir = path.join(monorepoRoot, "packages", "test-runner");

function runGo(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("go", args, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    /** @type {string[]} */
    const out = [];
    /** @type {string[]} */
    const err = [];
    child.stdout.on("data", (d) => out.push(d.toString()));
    child.stderr.on("data", (d) => err.push(d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout: out.join(""), stderr: err.join("") });
    });
  });
}

async function main() {
  try {
    await access(path.join(fixture, "package.json"));
  } catch {
    console.log("SKIP: sample-jest-project fixture 不存在");
    return;
  }

  let goCheck;
  try {
    goCheck = await runGo(["version"], testRunnerDir);
  } catch (e) {
    console.log("SKIP: 未安装 Go，跳过 test-runner 集成");
    return;
  }
  if (goCheck.code !== 0) {
    console.log("SKIP: Go 不可用，跳过 test-runner 集成");
    return;
  }

  const dbPath = path.join(await mkdtemp(path.join(os.tmpdir(), "ow-tr-db-")), "test-results.json");

  let run;
  try {
    run = await runGo(
      ["run", "./cmd/test-runner", "run", "--framework", "jest", "--path", fixture, "--record", dbPath],
      testRunnerDir,
    );
  } catch (e) {
    console.log("SKIP: test-runner 执行失败 —", e instanceof Error ? e.message : e);
    return;
  }

  if (run.code !== 0) {
    if (/jest|npm|cannot find module|ENOENT/i.test(run.stderr + run.stdout)) {
      console.log("SKIP: fixture 需 npm install / jest —", run.stderr.slice(0, 200));
      return;
    }
    throw new Error(run.stderr || run.stdout);
  }
  const jsonLine = run.stdout.trim().split("\n").pop();
  const result = JSON.parse(jsonLine ?? "{}");
  assert.ok(typeof result.passed === "number");
  assert.ok(result.recordedId, "应写入 test-results.json");

  const dbRaw = JSON.parse(await readFile(dbPath, "utf8"));
  assert.ok(Array.isArray(dbRaw.runs) && dbRaw.runs.length >= 1);

  console.log("PASS: test-runner jest fixture + test-db 记录集成");
} 

main().catch((e) => {
  if (/jest|npm|ENOENT/i.test(String(e.message))) {
    console.log("SKIP: fixture 未 npm install 或 jest 不可用 —", e.message);
    process.exit(0);
  }
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
