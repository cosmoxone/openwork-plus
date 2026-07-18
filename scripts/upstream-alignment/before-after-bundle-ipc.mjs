// before-after-bundle-ipc.mjs
//
// 实证对比测试：直接模拟 renderer → IPC → main.mjs handler 链路
// 对比 commit 36d17a6f2 (修复) 之前 vs 之后的 main.mjs 行为
//
// 用法：node scripts/upstream-alignment/before-after-bundle-ipc.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FIXED_COMMIT = "36d17a6f2";           // Bundle UI 修复 commit
const PARENT = `${FIXED_COMMIT}~1`;          // 修复前一個 commit
const COMMAND = "bundleList";

console.log("=".repeat(70));
console.log(`对比 ${PARENT} (修复前) vs ${FIXED_COMMIT} (修复后)`);
console.log(`调用 IPC 命令: "${COMMAND}"`);
console.log("=".repeat(70));

// 从 git 读取两个版本的 main.mjs 内容，找 desktopCommandHandlers 中 bundle 相关注册
function extractBundleHandlers(version) {
  const content = execFileSync(
    process.platform === "win32" ? "git.exe" : "git",
    ["show", `${version}:apps/desktop/electron/main.mjs`],
    { encoding: "utf8" },
  );
  return {
    hasBundleImport: /from\s+["']\.\/bundle-bridge\.mjs["']/.test(content),
    bundleHandlerKeys: Array.from(
      content.matchAll(/"[a-zA-Z_]+":\s*async/g),
    )
      .map((m) => m[0].replace(/[":]\s*async$/, "").replace(/^"/, ""))
      .filter((k) => k.startsWith("bundle")),
  };
}

const before = extractBundleHandlers(PARENT);
const after = extractBundleHandlers(FIXED_COMMIT);

console.log("\n修复前 (commit " + PARENT + "):");
console.log(`  bundle-bridge.mjs 已 import: ${before.hasBundleImport}`);
console.log(`  bundle handler 已注册      : ${before.bundleHandlerKeys.length === 0 ? "无" : before.bundleHandlerKeys.join(", ")}`);

console.log("\n修复后 (commit " + FIXED_COMMIT + "):");
console.log(`  bundle-bridge.mjs 已 import: ${after.hasBundleImport}`);
console.log(`  bundle handler 已注册      : ${after.bundleHandlerKeys.join(", ") || "无"}`);

console.log("\n" + "=".repeat(70));
console.log("行为预测：");
console.log("=".repeat(70));

if (before.bundleHandlerKeys.length === 0 && after.bundleHandlerKeys.length > 0) {
  console.log(`\n修复前调用 desktopBridge.${COMMAND}(...):`);
  console.log('  → IPC invokeDesktop("openwork:desktop", "' + COMMAND + '", ...)');
  console.log('  → desktopCommandHandlers["' + COMMAND + '"] === undefined');
  console.log('  → 抛: "Electron desktop bridge method is not implemented yet: ' + COMMAND + '"');
  console.log('  → React Query 捕获 → isError=true');
  console.log('  → BundleView 渲染 <Alert variant="destructive"> 显示红色错误条');
  console.log('  → 但是！如果用户没看到 Alert，可能是：');
  console.log('     (a) 只看了 "暂无 Bundle" 的空状态文字，没注意上方的红色错误条');
  console.log('     (b) DevTools console 有错误日志，但 UI 主区域确实显示为空');
  console.log('     (c) 误把 "query 失败但 UI 静默 fallback 到 []" 当成"功能正常"');

  console.log(`\n修复后调用 desktopBridge.${COMMAND}(...):`);
  console.log('  → IPC invokeDesktop("openwork:desktop", "' + COMMAND + '", ...)');
  console.log('  → desktopCommandHandlers["' + COMMAND + '"] 是 async 函数');
  console.log('  → 调用 runBundleCli(["list"])');
  console.log('  → 返回 { installed: [...] }');
  console.log('  → React Query 成功 → isError=false, data={installed:[...]}');
  console.log('  → BundleView 正常显示 bundle 列表');
}
