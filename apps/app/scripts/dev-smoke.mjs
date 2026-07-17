// dev-smoke.mjs — Vite 全量编译冒烟。
// 目标：拦截"相对路径写错 / 文件不存在"这类 bug。
// 这类 bug 的特点：typecheck 不报、dev server 启动不报（Vite 按需编译），
// 只有浏览器请求该模块时才报。但用户启动后会立即在 error overlay 看到。
//
// 解决方案：跑一次 `vite build`（生产构建）。build 会遍历所有入口可达模块，
// 任何一个 import 失败都会立即报错退出。比 dev server 更可靠。
//
// 代价：~10-15 秒一次构建。比 dev server 启动稍慢，但能 100% 拦截此类问题。
// 详见 docs/39-renderer-change-verification.md。
import { spawn } from "node:child_process";

const TIMEOUT_MS = 90_000;
const FAIL_PATTERNS = [
  "Failed to resolve import",
  "Could not resolve",
  "Pre-transform error",
  "error during build",
  "ENOENT: no such file or directory",
  "Build failed with errors",
  "transform failed",
];

const child = spawn(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "vite", "build", "--logLevel", "warn"],
  {
    cwd: import.meta.dirname.replace(/[\\/]scripts$/, ""),
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  },
);

let failed = false;
let done = false;
const start = Date.now();

function fail(reason) {
  if (failed || done) return;
  failed = true;
  console.error("\n[dev-smoke] FAIL — " + reason);
  child.kill("SIGTERM");
  setTimeout(() => process.exit(1), 800);
}

function pass() {
  if (failed || done) return;
  done = true;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log("\n[dev-smoke] OK — vite build passed in " + elapsed + "s");
  setTimeout(() => process.exit(0), 200);
}

const buffer = { stdout: "", stderr: "" };

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  buffer.stdout += text;
  process.stdout.write(text);
  if (FAIL_PATTERNS.some((p) => text.includes(p))) {
    fail("stdout: " + text.split("\n")[0].slice(0, 150));
  }
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  buffer.stderr += text;
  process.stderr.write(text);
  if (FAIL_PATTERNS.some((p) => text.includes(p))) {
    fail("stderr: " + text.split("\n")[0].slice(0, 150));
  }
});

child.on("exit", (code) => {
  if (failed) return;
  if (code === 0) {
    pass();
  } else {
    fail("vite build exited with code " + code);
  }
});

setTimeout(() => {
  if (!failed && !done) fail("vite build did not finish in " + TIMEOUT_MS + "ms");
}, TIMEOUT_MS);
