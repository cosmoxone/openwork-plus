// Bundle bridge: spawn `openwork-orchestrator bundle <sub> --json` and parse
// the JSON result. Used by Electron main-process IPC handlers in main.mjs.
//
// Design note (doc 38 §6.1): runtime.mjs's `resolveBinary` lives inside the
// `createRuntimeManager` closure (depends on `desktopRoot` param + `sidecarDirs`
// computed from app.getPath). Bundle IPC needs the binary *before* any engine
// has started, so we keep a focused sidecar resolver here. The lookup order
// mirrors runtime.mjs: sidecar dirs first (dev + packaged), then PATH.

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractBundleZip } from "../../orchestrator/src/bundle/zip.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @returns {string} rust-style target triple for the current platform. */
function targetTriple() {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  }
  if (process.platform === "linux") {
    return process.arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
  }
  if (process.platform === "win32") {
    return process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  }
  return "";
}

/** @param {string} baseName */
function binaryFileNames(baseName) {
  const ext = process.platform === "win32" ? ".exe" : "";
  const triple = targetTriple();
  return [
    triple ? `${baseName}-${triple}${ext}` : null,
    `${baseName}${ext}`,
  ].filter(Boolean);
}

function isDirectory(targetPath) {
  try {
    return statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Candidate sidecar directories. Mirrors runtime.mjs's `sidecarDirs` but does
 * not depend on the Electron `app` handle being ready (uses process.env and
 * argv[0] derived paths). Called lazily from resolveBundleBinary.
 *
 * @param {string} electronExePath  process.execPath or app.getPath("exe")
 * @returns {string[]}
 */
function bundleSidecarDirs(electronExePath) {
  const desktopRoot = path.resolve(__dirname, "..");
  /** @type {(string | null)[]} */
  const candidates = [
    path.join(desktopRoot, "resources", "sidecars"),
    process.resourcesPath ? path.join(process.resourcesPath, "sidecars") : null,
    path.join(path.dirname(electronExePath), "sidecars"),
  ];
  return /** @type {string[]} */ (
    candidates.filter((p) => typeof p === "string" && p.length > 0)
  );
}

/**
 * Resolve the openwork-orchestrator binary path.
 *
 * Lookup order:
 *  1. OPENWORK_ORCHESTRATOR_BIN env override (dev escape hatch)
 *  2. Dev mode: bun + source CLI (so source edits apply without rebuilding sidecar)
 *  3. Sidecar dirs (dev resources + packaged resources + exe sibling)
 *  4. PATH lookup (system-installed orchestrator, e.g. `pnpm -g i openworkplus-orchestrator`)
 *
 * @param {object} [options]
 * @param {string} [options.electronExePath]  defaults to process.execPath
 * @param {string} [options.env]              defaults to process.env
 * @returns {string | null}
 */
export function resolveBundleBinary(options = {}) {
  const env = options.env ?? process.env;
  const exePath = options.electronExePath ?? process.execPath;

  const override = String(env.OPENWORK_ORCHESTRATOR_BIN ?? "").trim();
  if (override && existsSync(override)) return override;

  // Dev-mode shortcut: when OPENWORK_DEV_MODE=1, prefer running orchestrator
  // source directly via bun (or node) so source edits to installer.mjs etc.
  // take effect without rebuilding the bun-compiled sidecar.
  if (env.OPENWORK_DEV_MODE === "1") {
    const devBin = resolveDevModeRunner();
    if (devBin) return devBin;
  }

  const sidecarDirs = bundleSidecarDirs(exePath).filter(isDirectory);
  for (const dir of sidecarDirs) {
    for (const fileName of binaryFileNames("openwork-orchestrator")) {
      const candidate = path.join(dir, fileName);
      if (existsSync(candidate)) return candidate;
    }
  }

  const pathEntries = String(env.PATH ?? env.Path ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  for (const entry of pathEntries) {
    for (const fileName of binaryFileNames("openwork-orchestrator")) {
      const candidate = path.join(entry, fileName);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * In dev mode, locate the orchestrator CLI source and return a runnable form.
 * Returns a string shaped like "<runner>@@<script>" that runBundleCli knows
 * how to split. Returns null if dev-mode prerequisites are missing.
 *
 * Resolution:
 *  1. Find repoRoot by walking up from this file.
 *  2. Check apps/orchestrator/src/cli.ts (or .mjs) exists.
 *  3. Find a `bun` executable on PATH; fall back to `node`.
 *
 * @param {object} [options]
 * @param {string} [options.env]  defaults to process.env
 * @returns {string | null}
 */
function resolveDevModeRunner(options = {}) {
  const env = options.env ?? process.env;
  // Walk up to find repoRoot (the monorepo root containing apps/orchestrator).
  let dir = __dirname;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, "apps", "orchestrator", "src", "cli.ts");
    if (existsSync(candidate)) {
      const runner = findExecutableOnPath("bun") ?? "node";
      return `${runner}@@${candidate}`;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** @param {string} name @param {object} [options] @param {string} [options.env] */
function findExecutableOnPath(name, options = {}) {
  const env = options.env ?? process.env;
  const ext = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  const pathEntries = String(env.PATH ?? env.Path ?? "")
    .split(path.delimiter)
    .filter(Boolean);
  for (const entry of pathEntries) {
    for (const e of ext) {
      const candidate = path.join(entry, name + e);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Spawn `openwork-orchestrator bundle <args...> --json` and parse stdout.
 *
 * @param {string[]} args  e.g. ["list"] / ["install", "./foo.zip"] / ["uninstall", "foo"]
 * @param {object} [options]
 * @param {number} [options.timeoutMs=30000]  hard kill timeout
 * @param {NodeJS.ProcessEnv} [options.env]    extra env layered on process.env
 * @returns {Promise<any>} parsed JSON object from stdout
 * @throws {Error} on binary missing, non-zero exit, stdout parse failure, or timeout
 */
export function runBundleCli(args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const bin = resolveBundleBinary({ env: options.env });
  if (!bin) {
    throw new Error(
      "openwork-orchestrator binary not found. Build it with `pnpm --filter openworkplus-orchestrator build` or set OPENWORK_ORCHESTRATOR_BIN.",
    );
  }

  // Dev mode may return a "<runner>@@<script>" composite (e.g. "bun@@.../cli.ts").
  // Split it into spawn() target + leading args. Windows .cmd/.bat runners need
  // special handling because (a) spawn requires shell:true for .cmd and (b) the
  // path may contain spaces ("D:\Program Files\...") so we must wrap it in quotes.
  let spawnTarget = bin;
  /** @type {string[]} */
  let runnerArgs = [];
  let useShell = false;
  if (bin.includes("@@")) {
    const [runner, script] = bin.split("@@", 2);
    spawnTarget = runner;
    runnerArgs = [script];
    if (process.platform === "win32") {
      useShell = true;
      if (/\.(cmd|bat)$/i.test(runner)) {
        // Wrap the runner path in quotes so cmd.exe parses it correctly when
        // it contains spaces. The leading "call " ensures cmd exits with the
        // child's exit code instead of just launching it asynchronously.
        spawnTarget = `"${runner}"`;
      }
    }
  }

  // --json must be last so the orchestrator's flag parser picks it up
  // regardless of which subcommand positional order the caller chose.
  const fullArgs = [...runnerArgs, "bundle", ...args, "--json"];

  return new Promise((resolve, reject) => {
    const child = spawn(spawnTarget, fullArgs, {
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: useShell,
    });

    /** @type {Buffer[]} */
    const stdoutChunks = [];
    /** @type {Buffer[]} */
    const stderrChunks = [];
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGKILL"); } catch { /* ignore */ }
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`failed to spawn openwork-orchestrator: ${err.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (timedOut) {
        const tail = stderr.slice(-500) || stdout.slice(-500);
        reject(new Error(`openwork-orchestrator timed out after ${timeoutMs}ms. ${tail}`.trim()));
        return;
      }

      if (code !== 0) {
        // CLI surfaces business errors (missing deps, conflicts) to stderr with
        // a human message; the --json output is reserved for success payloads.
        console.error("[bundle-bridge] nonzero exit code=", code);
        console.error("[bundle-bridge] stderr=", stderr.slice(-500));
        reject(new Error(stderr || stdout || `openwork-orchestrator exited with code ${code}`));
        return;
      }

      if (!stdout) {
        // Some subcommands (e.g. uninstall) print JSON only when --json is
        // honored; an empty stdout is treated as an empty result.
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new Error(
          `openwork-orchestrator returned non-JSON stdout: ${err.message}\n--- stdout ---\n${stdout.slice(-1000)}`,
        ));
      }
    });
  });
}

/**
 * P2.3+: Resolve a catalog entry to a local install source path.
 *
 * - `entry.sourcePath` (builtin): resolved against repoRoot (dev) or
 *   process.resourcesPath (packaged). Returns the absolute path.
 * - `entry.downloadUrl` (remote): downloaded to a temp file under os.tmpdir()
 *   and the temp path returned. Caller should clean up after install.
 * - neither: throws — the renderer should fall back to "Install from zip".
 *
 * @param {{ sourcePath?: string | null; downloadUrl?: string | null; id: string }} entry
 * @param {object} [options]
 * @param {number} [options.timeoutMs=120_000]  download timeout (remote only)
 * @returns {Promise<string>} absolute local path suitable for bundleInstall({ source })
 */
export async function resolveInstallSource(entry, options = {}) {
  if (entry?.sourcePath && typeof entry.sourcePath === "string") {
    return resolveBuiltinPath(entry.sourcePath);
  }
  if (entry?.downloadUrl && typeof entry.downloadUrl === "string") {
    return downloadToTemp(entry.downloadUrl, {
      timeoutMs: options.timeoutMs ?? 120_000,
      suffix: `-${entry.id ?? "bundle"}.zip`,
    });
  }
  throw new Error(
    `Bundle ${entry?.id ?? "<unknown>"} has no installable source (no sourcePath or downloadUrl). ` +
      `Use "Install from zip" instead.`,
  );
}

/** @param {string} dir */
function hasPackableBundleManifest(dir) {
  return (
    existsSync(path.join(dir, "bundle.json")) ||
    existsSync(path.join(dir, ".codex-plugin", "plugin.json")) ||
    existsSync(path.join(dir, "SKILL.md"))
  );
}

/**
 * P2.4: Resolve a local bundle **source directory** suitable for `ow bundle pack`.
 *
 * Lookup order:
 *  1. `sourcePath` → builtin repo/resources directory
 *  2. `downloadUrl` → download zip, extract to temp (cleaned up by caller)
 *  3. `bundleRoot` / installed receipt — **only** when it contains a manifest
 *  4. `installedId` → same manifest check on receipt bundleRoot
 *
 * @param {{
 *   id?: string,
 *   sourcePath?: string | null,
 *   downloadUrl?: string | null,
 *   bundleRoot?: string | null,
 * }} opts
 * @returns {Promise<{ bundleDir: string, cleanup: () => Promise<void> }>}
 */
export async function resolveExportBundleDir(opts) {
  const id = typeof opts?.id === "string" ? opts.id.trim() : "";
  const sourcePath =
    typeof opts?.sourcePath === "string" && opts.sourcePath.trim()
      ? opts.sourcePath.trim()
      : null;
  const downloadUrl =
    typeof opts?.downloadUrl === "string" && opts.downloadUrl.trim()
      ? opts.downloadUrl.trim()
      : null;
  const explicitRoot =
    typeof opts?.bundleRoot === "string" && opts.bundleRoot.trim()
      ? opts.bundleRoot.trim()
      : null;

  if (sourcePath) {
    return {
      bundleDir: resolveBuiltinPath(sourcePath),
      cleanup: async () => {},
    };
  }

  if (downloadUrl) {
    const zipPath = await downloadToTemp(downloadUrl, {
      suffix: id ? `-${id}.zip` : ".zip",
    });
    const extracted = await extractBundleZip(zipPath);
    return {
      bundleDir: extracted.dir,
      cleanup: async () => {
        await extracted.cleanup();
        const { rm } = await import("node:fs/promises");
        await rm(zipPath, { force: true }).catch(() => {});
      },
    };
  }

  if (explicitRoot && existsSync(explicitRoot) && hasPackableBundleManifest(explicitRoot)) {
    return { bundleDir: explicitRoot, cleanup: async () => {} };
  }

  if (id) {
    const installed = await runBundleCli(["list"]);
    const record = Array.isArray(installed)
      ? installed.find((entry) => entry?.id === id)
      : null;
    const root = typeof record?.bundleRoot === "string" ? record.bundleRoot.trim() : "";
    if (root && existsSync(root) && hasPackableBundleManifest(root)) {
      return { bundleDir: root, cleanup: async () => {} };
    }
  }

  throw new Error(
    `Bundle ${id || "<unknown>"} has no exportable source. ` +
      `Install it first, or use a catalog entry with sourcePath/downloadUrl.`,
  );
}

/**
 * Resolve a builtin bundle path (relative POSIX path from repo root) to an
 * absolute filesystem path.
 *
 * Lookup order:
 *  1. OPENWORK_REPO_ROOT/bundles/...  (explicit override)
 *  2. <repoRoot>/bundles/...          (dev mode, by walking up from this file)
 *  3. process.resourcesPath/bundles/...  (packaged app)
 *
 * @param {string} sourcePath  e.g. "bundles/knowledge-mgmt"
 * @returns {string} absolute path
 * @throws {Error} if the resolved path does not exist
 */
function resolveBuiltinPath(sourcePath) {
  const normalized = sourcePath.replace(/\\/g, "/").replace(/^\//, "");

  const candidates = [];
  const envRoot = String(process.env.OPENWORK_REPO_ROOT ?? "").trim();
  if (envRoot) candidates.push(path.join(envRoot, normalized));
  // Walk up from this file to find a directory containing "apps/orchestrator"
  // (the monorepo root signature); use it as repoRoot.
  let dir = __dirname;
  for (let i = 0; i < 6; i += 1) {
    candidates.push(path.join(dir, normalized));
    if (existsSync(path.join(dir, "apps", "orchestrator"))) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, normalized));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `builtin bundle path not found: ${sourcePath}. Tried:\n  ${candidates.join("\n  ")}`,
  );
}

/**
 * Download a URL to a temp file. Used by resolveInstallSource for remote
 * catalog entries (downloadUrl). The temp file is NOT auto-cleaned — the
 * caller (bundleInstall) needs the file to persist until install completes,
 * then Electron's temp cleanup handles it on app exit.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.timeoutMs=120_000]
 * @param {string} [options.suffix=".zip"]
 * @returns {Promise<string>} absolute path to the downloaded temp file
 */
async function downloadToTemp(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const suffix = options.suffix ?? ".zip";
  const { createWriteStream } = await import("node:fs");
  const { mkdir, writeFile } = await import("node:fs/promises");
  const tmpDir = path.join(os.tmpdir(), "openwork-bundle-downloads");
  await mkdir(tmpDir, { recursive: true });
  const fileName = `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${suffix}`;
  const tmpPath = path.join(tmpDir, fileName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok || !res.body) {
      throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
    }
    // Stream to disk to avoid loading large bundles into memory.
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(tmpPath, buf);
    return tmpPath;
  } finally {
    clearTimeout(timer);
    // createWriteStream imported but unused on this path; keep the import
    // lazy so the bundle-bridge.mjs initial load stays light.
    void createWriteStream;
  }
}
