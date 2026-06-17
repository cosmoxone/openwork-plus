import path from "node:path";

const FORBIDDEN_LINUX = [
  /^\/mnt\//,
  /^\/etc\//,
  /^\/proc\//,
  /^\/sys\//,
  /^\/dev\//,
];

const FORBIDDEN_DARWIN = [
  /^\/System\//,
  /^\/Library\//,
  /^\/private\//,
  /^\/Applications\//,
];

const FORBIDDEN_WIN = [
  /^[A-Za-z]:\\Windows\\/i,
  /^[A-Za-z]:\\Program Files/i,
  /^[A-Za-z]:\\Program Files \(x86\)/i,
];

/** @param {string} targetPath @param {string} [workspaceRoot] */
export function isPathAllowed(targetPath, workspaceRoot) {
  const normalized = path.normalize(targetPath);
  const patterns =
    process.platform === "win32"
      ? FORBIDDEN_WIN
      : process.platform === "darwin"
        ? FORBIDDEN_DARWIN
        : FORBIDDEN_LINUX;

  for (const re of patterns) {
    if (re.test(normalized)) {
      return { allowed: false, reason: `forbidden path pattern: ${re}` };
    }
  }

  if (workspaceRoot) {
    const root = path.resolve(workspaceRoot);
    const resolved = path.resolve(normalized);
    const cmp = process.platform === "win32";
    const a = cmp ? resolved.toLowerCase() : resolved;
    const b = cmp ? root.toLowerCase() : root;
    if (!a.startsWith(b)) {
      return { allowed: false, reason: "path outside workspace" };
    }
  }

  return { allowed: true };
}
