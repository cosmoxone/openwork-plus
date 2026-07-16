import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** @returns {string} */
export function resolveLogDir(dataDir) {
  if (dataDir) return path.join(dataDir, "logs");
  const platform = process.platform;
  if (process.env.OPENWORK_DATA_DIR) {
    return path.join(process.env.OPENWORK_DATA_DIR, "logs");
  }
  const home = os.homedir();
  const base =
    platform === "win32"
      ? path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "openwork")
      : platform === "darwin"
        ? path.join(home, "Library", "Application Support", "openwork")
        : path.join(home, ".openwork");
  return path.join(base, "logs");
}

/**
 * @param {string} message
 * @param {{ label?: string, dataDir?: string }} [opts]
 */
export function logSandbox(message, opts = {}) {
  const line = `[sandbox-bootstrap]${opts.label ? ` [${opts.label}]` : ""} ${message}`;
  console.error(line);
  try {
    const dir = resolveLogDir(opts.dataDir);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "sandbox-bootstrap.log");
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* ignore file log errors */
  }
}
