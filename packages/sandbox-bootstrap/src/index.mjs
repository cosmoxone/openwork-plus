import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { checkWSLStatus, installNodeInWSL } from "./wsl-init.mjs";
import { checkLimaStatus, ensureLimaInstance } from "./lima-init.mjs";
import { logSandbox } from "./logger.mjs";

/** @typedef {'checking'|'creating'|'starting'|'installing_node'|'installing_python'|'ready'|'skipped'|'error'} SandboxPhase */

/**
 * @typedef {Object} SandboxProgress
 * @property {SandboxPhase} phase
 * @property {string} message
 * @property {string} [detail]
 * @property {number} [progress]
 * @property {string} [error]
 */

/**
 * @typedef {Object} BootstrapResult
 * @property {'wsl'|'lima'|'native'} mode
 * @property {object} [wslStatus]
 * @property {object} [limaStatus]
 * @property {string} [error]
 */

const STATE_FILE = "sandbox-bootstrap.json";

/** @param {string} [override] */
export function resolveDataDir(override) {
  if (override) return path.resolve(override);
  if (process.env.OPENWORK_DATA_DIR) return path.resolve(process.env.OPENWORK_DATA_DIR);
  const home = os.homedir();
  return process.platform === "win32"
    ? path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "openwork")
    : path.join(home, ".openwork");
}

/** @param {string} dataDir */
function statePath(dataDir) {
  return path.join(dataDir, STATE_FILE);
}

/** @param {string} dataDir */
export function readBootstrapState(dataDir) {
  const file = statePath(dataDir);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** @param {string} dataDir @param {BootstrapResult & { completedAt?: string }} state */
export function writeBootstrapState(dataDir, state) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    statePath(dataDir),
    JSON.stringify({ ...state, completedAt: new Date().toISOString() }, null, 2),
  );
}

/**
 * @param {{ dataDir?: string, force?: boolean, onProgress?: (p: SandboxProgress) => void }} [opts]
 * @returns {Promise<BootstrapResult>}
 */
export async function bootstrap(opts = {}) {
  const dataDir = resolveDataDir(opts.dataDir);
  const onProgress = opts.onProgress ?? (() => {});

  if (!opts.force) {
    const cached = readBootstrapState(dataDir);
    if (cached?.mode && cached.completedAt) {
      logSandbox(`skip bootstrap (cached mode=${cached.mode})`, { dataDir });
      return cached;
    }
  }

  const platform = process.platform;
  logSandbox(`starting bootstrap on ${platform}`, { dataDir });

  try {
    /** @type {BootstrapResult} */
    let result;

    if (platform === "win32") {
      onProgress({ phase: "checking", message: "Checking WSL2...", progress: 10 });
      const wslStatus = await checkWSLStatus();
      if (!wslStatus.available) {
        onProgress({
          phase: "skipped",
          message: "WSL2 not available — using native GUI mode",
          detail: "gui-operate-mcp runs natively on Windows",
          progress: 100,
        });
        result = { mode: "native", wslStatus };
      } else {
        if (!wslStatus.nodeAvailable) {
          onProgress({
            phase: "installing_node",
            message: "Node.js not found in WSL (optional for GUI automation)",
            detail: "Install Node in WSL manually if needed for sandboxed CLI",
            progress: 70,
          });
        }
        onProgress({ phase: "ready", message: "WSL2 environment detected", progress: 100 });
        result = { mode: "wsl", wslStatus };
      }
    } else if (platform === "darwin") {
      onProgress({ phase: "checking", message: "Checking Lima...", progress: 10 });
      const limaStatus = await checkLimaStatus();
      if (!limaStatus.available) {
        onProgress({
          phase: "skipped",
          message: "Lima not installed — using native GUI mode",
          progress: 100,
        });
        result = { mode: "native", limaStatus };
      } else {
        const ensured = await ensureLimaInstance((p) =>
          onProgress({
            phase: /** @type {SandboxPhase} */ (p.phase),
            message: p.message,
            progress: p.progress,
          }),
        );
        if (!ensured.ok) {
          onProgress({
            phase: "skipped",
            message: "Lima unavailable — native mode",
            detail: ensured.reason,
            progress: 100,
          });
          result = { mode: "native", limaStatus, error: ensured.reason };
        } else {
          onProgress({ phase: "ready", message: "Lima sandbox ready", progress: 100 });
          result = { mode: "lima", limaStatus: { ...limaStatus, running: true } };
        }
      }
    } else {
      onProgress({
        phase: "skipped",
        message: "Linux native execution",
        progress: 100,
      });
      result = { mode: "native" };
    }

    writeBootstrapState(dataDir, result);
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    onProgress({ phase: "error", message: "Bootstrap failed", error: errorMsg });
    const result = { mode: /** @type {'native'} */ ("native"), error: errorMsg };
    writeBootstrapState(dataDir, result);
    return result;
  }
}

export { checkWSLStatus, installNodeInWSL } from "./wsl-init.mjs";
export { execInWSL } from "./wsl-exec.mjs";
export { checkLimaStatus, ensureLimaInstance } from "./lima-init.mjs";
export { isPathAllowed } from "./path-guard.mjs";
export { runNativeCommand } from "./native-executor.mjs";
