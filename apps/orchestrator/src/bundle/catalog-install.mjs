// 从合并 catalog 解析安装源：优先 remote downloadUrl，否则 builtin zip 路径。
import { existsSync } from "node:fs";
import path from "node:path";
import {
  fetchRemoteCatalogWithFallback,
  mergeCatalogView,
  readCatalogFile,
} from "./catalog.mjs";
import { downloadBundleZip } from "./download.mjs";
import { installBundle, listBundles, resolveWorkspaceRoot } from "./installer.mjs";

/**
 * @param {{
 *   bundleId: string,
 *   workspaceRoot: string,
 *   dataDir?: string,
 *   builtinCatalogPath: string,
 *   remoteUrl?: string,
 *   replace?: boolean,
 *   preferRemote?: boolean,
 * }} opts
 */
export async function installBundleFromCatalog(opts) {
  const {
    bundleId,
    workspaceRoot,
    dataDir,
    builtinCatalogPath,
    remoteUrl,
    replace = false,
    preferRemote = false,
  } = opts;

  const ws = resolveWorkspaceRoot(workspaceRoot);
  const builtin = await readCatalogFile(builtinCatalogPath);
  let remote = { bundles: [] };
  if (remoteUrl?.trim()) {
    const fetched = await fetchRemoteCatalogWithFallback(remoteUrl.trim(), dataDir);
    remote = fetched.catalog;
  }

  const installed = await listBundles({ dataDir });
  const installedHere = installed.filter((b) => b.workspaceRoot === ws);
  const merged = mergeCatalogView({
    builtin,
    remote,
    installed: installedHere,
  });

  const entry = merged.find((b) => b.id === bundleId);
  if (!entry) {
    throw new Error(`bundle not found in catalog: ${bundleId}`);
  }

  const useRemote = Boolean(
    entry.downloadUrl &&
      (preferRemote || entry.source === "remote" || entry.updateAvailable),
  );

  /** @type {string} */
  let source;
  /** @type {"remote" | "builtin"} */
  let sourceKind;

  if (useRemote) {
    source = await downloadBundleZip({
      downloadUrl: entry.downloadUrl,
      bundleId: entry.id,
      version: entry.version,
      expectedSha256: entry.sha256 ?? null,
      dataDir,
    });
    sourceKind = "remote";
  } else {
    const rel = entry.path;
    if (!rel) {
      throw new Error(`catalog missing path/downloadUrl for ${bundleId}`);
    }
    source = path.join(path.dirname(path.resolve(builtinCatalogPath)), rel);
    if (!existsSync(source)) {
      throw new Error(`builtin zip missing: ${source}`);
    }
    sourceKind = "builtin";
  }

  const result = await installBundle({
    bundleDir: source,
    workspaceRoot: ws,
    dataDir,
    replace,
  });

  return {
    ...result,
    sourceKind,
    catalogVersion: entry.version,
  };
}
