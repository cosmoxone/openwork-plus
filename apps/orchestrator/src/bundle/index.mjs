// `ow bundle` 命令入口：install / list / uninstall / pack / catalog。
import { installBundle, listBundles, uninstallBundle } from "./installer.mjs";
import { packBundle } from "./pack.mjs";
import { extractBundleZip } from "./zip.mjs";
import { mergeCatalogView, readCatalogFile, fetchRemoteCatalog, readCachedRemoteCatalog } from "./catalog.mjs";

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
    if (!arg) throw new Error("用法: ow bundle install <path|zip> [--workspace <dir>] [--data-dir <dir>] [--replace]");
    let bundleDir = arg;
    /** @type {(() => Promise<void>) | null} */
    let cleanup = null;
    if (arg.toLowerCase().endsWith(".zip")) {
      const extracted = await extractBundleZip(arg);
      bundleDir = extracted.dir;
      cleanup = extracted.cleanup;
    }
    try {
      const result = await installBundle({
        bundleDir,
        workspaceRoot,
        dataDir,
        replace: flags.get("replace") === true,
      });
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`installed ${result.id}@${result.version}`);
        if (result.createdPaths.length) console.log(`  files: ${result.createdPaths.length}`);
        if (result.addedMcp.length) console.log(`  mcp: ${result.addedMcp.join(", ")}`);
      }
    } finally {
      if (cleanup) await cleanup();
    }
    return;
  }

  if (sub === "pack") {
    if (!arg) throw new Error("用法: ow bundle pack <bundle-dir> [--output <zip>]");
    const output = str("output");
    const result = await packBundle({ bundleDir: arg, output });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`packed ${result.id}@${result.version} -> ${result.output}`);
    }
    return;
  }

  if (sub === "catalog") {
    const builtinPath = str("builtin");
    const remoteUrl = str("remote-url");
    const builtin = builtinPath ? await readCatalogFile(builtinPath) : { bundles: [] };
    let remote = { bundles: [] };
    if (remoteUrl) {
      try {
        remote = await fetchRemoteCatalog(remoteUrl, dataDir);
      } catch {
        remote = await readCachedRemoteCatalog(dataDir);
      }
    }
    const installed = await listBundles({ dataDir });
    const view = mergeCatalogView({ builtin, remote, installed });
    if (json) {
      console.log(JSON.stringify(view, null, 2));
    } else {
      for (const b of view) {
        console.log(`${b.id}@${b.version}  ${b.status}  ${b.name ?? ""}`);
      }
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

  throw new Error("用法: ow bundle <install|list|uninstall|pack|catalog> ...");
}
