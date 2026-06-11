// `ow bundle` 命令入口：install / list / uninstall。
// 由 cli.ts 通过动态 import 调用，保持与主 CLI 的低耦合。

import { installBundle, listBundles, uninstallBundle } from "./installer.mjs";

/**
 * @param {string[]} positionals  形如 ["bundle","install","./path"]
 * @param {Map<string,string|boolean>} flags
 */
export async function runBundleCommand(positionals, flags) {
  const sub = positionals[1];
  const arg = positionals[2];
  const str = (k) => {
    const v = flags.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const workspaceRoot = str("workspace");
  const dataDir = str("data-dir");
  const json = flags.get("json") === true;

  if (sub === "install") {
    if (!arg) throw new Error("用法: ow bundle install <path> [--workspace <dir>] [--data-dir <dir>]");
    const result = await installBundle({ bundleDir: arg, workspaceRoot, dataDir });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`installed ${result.id}@${result.version}`);
      if (result.createdPaths.length) console.log(`  files: ${result.createdPaths.length}`);
      if (result.addedMcp.length) console.log(`  mcp: ${result.addedMcp.join(", ")}`);
      if (result.preinstall) console.log(`  preinstall(待执行): ${result.preinstall}`);
    }
    return;
  }

  if (sub === "list") {
    const bundles = await listBundles({ dataDir });
    if (json) {
      console.log(JSON.stringify(bundles, null, 2));
    } else if (bundles.length === 0) {
      console.log("(no bundles installed)");
    } else {
      for (const b of bundles) console.log(`${b.id}@${b.version}  ${b.name ?? ""}`);
    }
    return;
  }

  if (sub === "uninstall" || sub === "remove") {
    if (!arg) throw new Error("用法: ow bundle uninstall <id> [--data-dir <dir>]");
    const result = await uninstallBundle({ id: arg, dataDir });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`uninstalled ${result.id}`);
    }
    return;
  }

  throw new Error("用法: ow bundle <install|list|uninstall> ...");
}
