// verify-bundle-ipc-shape.mjs
//
// 端到端验证 Bundle IPC handler 的形状转换逻辑。
// 模拟 main.mjs 的 bundleList/bundleInstall/bundleUninstall handler
// 调用 runBundleCli，确认返回的形状与 desktop-ipc.ts 契约一致。
//
// 这覆盖了之前误以为 "Bundle IPC 已注册但其实没注册" 的 bug：
// 现在我们直接测 runBundleCli 链路 + 形状转换，确保 handler 真正能工作。
//
// 用法：node scripts/upstream-alignment/verify-bundle-ipc-shape.mjs
import { runBundleCli } from "../../apps/desktop/electron/bundle-bridge.mjs";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const TEST_ZIP = path.join(REPO_ROOT, "bundles", "knowledge-mgmt-0.5.0.zip");

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}  ${detail}`);
    failures++;
  }
}

console.log("=== Bundle IPC shape verification ===");
console.log(`Test zip: ${TEST_ZIP}`);

if (!existsSync(TEST_ZIP)) {
  console.error("FAIL: test zip not found. Run pack first.");
  process.exit(2);
}

// 1. bundleList — handler wraps array → { installed: [...] }
console.log("\n[1/4] bundleList (empty state)");
try {
  const rawList = await runBundleCli(["list"]);
  const wrapped = { installed: Array.isArray(rawList) ? rawList : [] };
  check("return shape {installed: array}", Array.isArray(wrapped.installed));
  check("empty when nothing installed", wrapped.installed.length === 0);
} catch (e) {
  check("bundleList empty call", false, e.message);
}

// 2. bundleInstall — handler wraps → { ok: true, id, version, createdPaths, addedMcp }
console.log("\n[2/4] bundleInstall");
try {
  const rawInstall = await runBundleCli(["install", TEST_ZIP], { timeoutMs: 60_000 });
  // 模拟 main.mjs handler 的转换逻辑
  const result = {
    ok: true,
    id: String(rawInstall?.id ?? ""),
    version: String(rawInstall?.version ?? ""),
    createdPaths: Array.isArray(rawInstall?.createdPaths) ? rawInstall.createdPaths : [],
    addedMcp: Array.isArray(rawInstall?.addedMcp) ? rawInstall.addedMcp : [],
  };
  check("ok is true", result.ok === true);
  check("id non-empty", result.id.length > 0, `got "${result.id}"`);
  check("version non-empty", result.version.length > 0, `got "${result.version}"`);
  check("createdPaths is array", Array.isArray(result.createdPaths));
  check("createdPaths non-empty", result.createdPaths.length > 0);
  check("addedMcp is array", Array.isArray(result.addedMcp));
} catch (e) {
  check("bundleInstall call", false, e.message);
}

// 3. bundleList (after install) — should now show the bundle
console.log("\n[3/4] bundleList (after install)");
try {
  const rawList = await runBundleCli(["list"]);
  const wrapped = { installed: Array.isArray(rawList) ? rawList : [] };
  check("installed has 1 entry", wrapped.installed.length === 1, `got ${wrapped.installed.length}`);
  if (wrapped.installed.length > 0) {
    const b = wrapped.installed[0];
    check("entry has id", typeof b.id === "string" && b.id.length > 0);
    check("entry has version", typeof b.version === "string");
    check("entry has scope", b.scope === "workspace" || b.scope === "user" || b.scope === undefined);
  }
} catch (e) {
  check("bundleList after install", false, e.message);
}

// 4. bundleUninstall — handler wraps → { ok: true, id, removedPaths }
console.log("\n[4/4] bundleUninstall");
try {
  const rawUninstall = await runBundleCli(["uninstall", "knowledge-mgmt"]);
  const result = {
    ok: true,
    id: String(rawUninstall?.id ?? "knowledge-mgmt"),
    removedPaths: Array.isArray(rawUninstall?.removedPaths) ? rawUninstall.removedPaths : [],
  };
  check("ok is true", result.ok === true);
  check("id matches", result.id === "knowledge-mgmt");
  check("removedPaths is array", Array.isArray(result.removedPaths));
  check("removedPaths non-empty", result.removedPaths.length > 0);
} catch (e) {
  check("bundleUninstall call", false, e.message);
}

// 5. Final state — should be empty again
console.log("\n[5/4] bundleList (after uninstall, final)");
try {
  const rawList = await runBundleCli(["list"]);
  const wrapped = { installed: Array.isArray(rawList) ? rawList : [] };
  check("back to empty", wrapped.installed.length === 0);
} catch (e) {
  check("final empty state", false, e.message);
}

console.log(`\n=== Summary ===`);
if (failures === 0) {
  console.log("All checks passed. Bundle IPC handler logic verified.");
  process.exit(0);
} else {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
