import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readBootstrapState } from "../../sandbox-bootstrap/src/index.mjs";
import { callMcpTool, defaultGuiOperateServerPath } from "./mcp-client.mjs";

/** @param {string} [override] */
export function resolveDataDir(override) {
  if (override) return path.resolve(override);
  if (process.env.OPENWORK_DATA_DIR) return path.resolve(process.env.OPENWORK_DATA_DIR);
  const home = os.homedir();
  return process.platform === "win32"
    ? path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "openwork")
    : path.join(home, ".openwork");
}

const AUTOMATION_FILE = "rpa-automation.json";

/** @param {string} dataDir */
function automationPath(dataDir) {
  return path.join(dataDir, AUTOMATION_FILE);
}

/** @param {string} dataDir */
export function getAutomationState(dataDir) {
  const file = automationPath(dataDir);
  if (!fs.existsSync(file)) {
    return { enabled: false, updatedAt: null };
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { enabled: false, updatedAt: null };
  }
}

/** @param {string} dataDir @param {boolean} enabled */
export function setAutomationEnabled(dataDir, enabled) {
  fs.mkdirSync(dataDir, { recursive: true });
  const state = { enabled, updatedAt: new Date().toISOString() };
  fs.writeFileSync(automationPath(dataDir), JSON.stringify(state, null, 2));
  return state;
}

/** @param {string} dataDir */
export function getRpaStatus(dataDir) {
  const dir = resolveDataDir(dataDir);
  const bootstrap = readBootstrapState(dir);
  const automation = getAutomationState(dir);
  const guiDir = path.join(dir, "gui_operate");
  const screenshotsDir = path.join(guiDir, "screenshots");
  let screenshotCount = 0;
  if (fs.existsSync(screenshotsDir)) {
    screenshotCount = fs.readdirSync(screenshotsDir).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f)).length;
  }
  return {
    dataDir: dir,
    sandboxMode: bootstrap?.mode ?? "unknown",
    sandboxBootstrapped: Boolean(bootstrap?.completedAt),
    automationEnabled: automation.enabled,
    automationUpdatedAt: automation.updatedAt,
    screenshotCount,
    platform: process.platform,
  };
}

/** @param {string} dataDir @param {number} [limit] */
export function listScreenshots(dataDir, limit = 20) {
  const dir = path.join(resolveDataDir(dataDir), "gui_operate", "screenshots");
  if (!fs.existsSync(dir)) return [];
  const entries = fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return {
        name,
        path: full,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, limit);
  return entries;
}

/** @param {string} dataDir @param {number} [limit] */
export function listOperationHistory(dataDir, limit = 50) {
  const appsDir = path.join(resolveDataDir(dataDir), "gui_apps");
  if (!fs.existsSync(appsDir)) return [];

  /** @type {Array<{ appName: string, index: number, x: number, y: number, operation: string, timestamp: number, count: number }>} */
  const rows = [];

  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const historyFile = path.join(appsDir, entry.name, "click_history.json");
    if (!fs.existsSync(historyFile)) continue;
    try {
      const history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
      const appName = history.appName ?? entry.name;
      for (const click of history.clicks ?? []) {
        rows.push({
          appName,
          index: click.index,
          x: click.x_normalized ?? click.x,
          y: click.y_normalized ?? click.y,
          operation: click.operation ?? "click",
          timestamp: click.timestamp,
          count: click.count ?? 1,
        });
      }
    } catch {
      /* skip corrupt history */
    }
  }

  rows.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return rows.slice(0, limit);
}

/** @param {string} dataDir @param {number} [limit] */
export function listMcpLogs(dataDir, limit = 10) {
  const logsDir = path.join(resolveDataDir(dataDir), "logs");
  if (!fs.existsSync(logsDir)) return [];
  return fs
    .readdirSync(logsDir)
    .filter((f) => f.startsWith("mcp-server-") && f.endsWith(".log"))
    .map((name) => {
      const full = path.join(logsDir, name);
      const stat = fs.statSync(full);
      return { name, path: full, size: stat.size, modifiedAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, limit);
}

/**
 * @param {{ dataDir?: string, displayIndex?: number, serverPath?: string, monorepoRoot?: string }} [opts]
 */
export async function captureScreenshot(opts = {}) {
  const dataDir = resolveDataDir(opts.dataDir);
  const serverPath = opts.serverPath ?? defaultGuiOperateServerPath(opts.monorepoRoot);
  if (!fs.existsSync(serverPath)) {
    throw new Error(`gui-operate server not found: ${serverPath}`);
  }

  const shotsDir = path.join(dataDir, "gui_operate", "screenshots");
  fs.mkdirSync(shotsDir, { recursive: true });
  const outputPath = path.join(shotsDir, `rpa-capture-${Date.now()}.png`);

  const result = await callMcpTool(
    serverPath,
    "screenshot",
    {
      output_path: outputPath,
      display_index: opts.displayIndex ?? 0,
    },
    { dataDir, timeoutMs: 45_000 },
  );

  const content = /** @type {{ content?: Array<{ type: string, text?: string }> }} */ (result);
  const textBlock = content?.content?.find((c) => c.type === "text");
  return {
    path: outputPath,
    displayIndex: opts.displayIndex ?? 0,
    summary: textBlock?.text ?? "screenshot captured",
  };
}
