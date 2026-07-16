import path from "node:path";

/** @param {string} winPath */
export function windowsPathToWsl(winPath) {
  const normalized = path.resolve(winPath).replace(/\\/g, "/");
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!match) return normalized;
  return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

/** @param {string} hostPath @param {string} [dataDir] */
export function sandboxExecPath(hostPath, dataDir) {
  if (process.platform === "win32") {
    return windowsPathToWsl(hostPath);
  }
  return path.resolve(hostPath);
}
