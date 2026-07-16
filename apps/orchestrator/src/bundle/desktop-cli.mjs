#!/usr/bin/env node
/**
 * Industry Bundle 桌面 CLI（JSON 入/出，供 Tauri 调用）。
 *
 * 用法:
 *   node desktop-cli.mjs catalog --builtin <path> [--remote-url <url>] [--data-dir <dir>] [--workspace <dir>]
 *   node desktop-cli.mjs install --source <dir|zip> --workspace <dir> [--data-dir <dir>] [--replace]
 *   node desktop-cli.mjs install-catalog --id <bundleId> --builtin <path> --workspace <dir> [--remote-url <url>] [--replace]
 *   node desktop-cli.mjs uninstall --id <id> [--data-dir <dir>]
 *   node desktop-cli.mjs installed [--data-dir <dir>] [--workspace <dir>]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installBundle, listBundles, uninstallBundle, resolveDataDir, resolveWorkspaceRoot } from "./installer.mjs";
import { extractBundleZip } from "./zip.mjs";
import { mergeCatalogView, readCatalogFile, fetchRemoteCatalogWithFallback } from "./catalog.mjs";
import { installBundleFromCatalog } from "./catalog-install.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positionals.push(a);
    }
  }
  return { cmd: positionals[0], flags, positionals };
}

function out(payload) {
  console.log(JSON.stringify(payload));
}

function fail(message, code = 1) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(code);
}

async function resolveSource(source) {
  const resolved = path.resolve(source);
  if (resolved.toLowerCase().endsWith(".zip")) {
    return extractBundleZip(resolved);
  }
  return { dir: resolved, cleanup: async () => {} };
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  const dataDir = typeof flags["data-dir"] === "string" ? flags["data-dir"] : undefined;
  const workspace = typeof flags.workspace === "string" ? flags.workspace : undefined;

  try {
    if (cmd === "catalog") {
      const builtinPath = typeof flags.builtin === "string" ? flags.builtin : "";
      const builtin = builtinPath ? await readCatalogFile(builtinPath) : { bundles: [] };
      let remote = { bundles: [] };
      let catalogStale = false;
      const remoteUrl = typeof flags["remote-url"] === "string" ? flags["remote-url"] : "";
      if (remoteUrl) {
        const fetched = await fetchRemoteCatalogWithFallback(remoteUrl, dataDir);
        remote = fetched.catalog;
        catalogStale = fetched.stale;
      }
      const installed = await listBundles({ dataDir });
      const workspaceRoot = resolveWorkspaceRoot(workspace);
      const installedHere = installed.filter(
        (b) => !workspaceRoot || b.workspaceRoot === workspaceRoot,
      );
      const bundles = mergeCatalogView({
        builtin,
        remote,
        installed: installedHere,
      });
      out({ ok: true, bundles, builtinCount: builtin.bundles?.length ?? 0, catalogStale });
      return;
    }

    if (cmd === "installed") {
      const all = await listBundles({ dataDir });
      const workspaceRoot = workspace ? resolveWorkspaceRoot(workspace) : null;
      const bundles = workspaceRoot
        ? all.filter((b) => b.workspaceRoot === workspaceRoot)
        : all;
      out({ ok: true, bundles });
      return;
    }

    if (cmd === "install") {
      const source = typeof flags.source === "string" ? flags.source : "";
      if (!source) fail("--source required");
      if (!workspace) fail("--workspace required");
      const { dir, cleanup } = await resolveSource(source);
      try {
        const result = await installBundle({
          bundleDir: dir,
          workspaceRoot: workspace,
          dataDir,
          replace: flags.replace === true,
        });
        out({ ok: true, result });
      } finally {
        await cleanup();
      }
      return;
    }

    if (cmd === "install-catalog") {
      const id = typeof flags.id === "string" ? flags.id : "";
      const builtinPath = typeof flags.builtin === "string" ? flags.builtin : "";
      if (!id) fail("--id required");
      if (!builtinPath) fail("--builtin required");
      if (!workspace) fail("--workspace required");
      const remoteUrl = typeof flags["remote-url"] === "string" ? flags["remote-url"] : "";
      const result = await installBundleFromCatalog({
        bundleId: id,
        workspaceRoot: workspace,
        dataDir,
        builtinCatalogPath: builtinPath,
        remoteUrl: remoteUrl || undefined,
        replace: flags.replace === true,
        preferRemote: flags["prefer-remote"] === true,
      });
      out({ ok: true, result });
      return;
    }

    if (cmd === "uninstall") {
      const id = typeof flags.id === "string" ? flags.id : "";
      if (!id) fail("--id required");
      const result = await uninstallBundle({ id, dataDir });
      out({ ok: true, result });
      return;
    }

    fail(`unknown command: ${cmd ?? "(none)"}`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

main();
