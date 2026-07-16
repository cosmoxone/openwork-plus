import os from "node:os";
import path from "node:path";

/** @param {string} [override] */
export function resolveDataDir(override) {
  if (override) return path.resolve(override);
  if (process.env.OPENWORK_DATA_DIR) return path.resolve(process.env.OPENWORK_DATA_DIR);
  const home = os.homedir();
  return process.platform === "win32"
    ? path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "openwork")
    : path.join(home, ".openwork");
}

/** @param {string} [dataDir] */
export function schedulerDbPath(dataDir) {
  return path.join(resolveDataDir(dataDir), "scheduler.db");
}
