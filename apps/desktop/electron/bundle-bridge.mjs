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
 *  2. Sidecar dirs (dev resources + packaged resources + exe sibling)
 *  3. PATH lookup (system-installed orchestrator, e.g. `pnpm -g i openworkplus-orchestrator`)
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

  // --json must be last so the orchestrator's flag parser picks it up
  // regardless of which subcommand positional order the caller chose.
  const fullArgs = ["bundle", ...args, "--json"];

  return new Promise((resolve, reject) => {
    const child = spawn(bin, fullArgs, {
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
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
