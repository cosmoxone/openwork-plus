/**
 * 解析 OpenCode 可执行文件：PATH → 桌面/orchestrator sidecar → 可选 GitHub 下载（无需 bun）。
 */
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @param {string} [root] */
export function defaultMonorepoRoot(root) {
  if (root?.trim()) return path.resolve(root.trim());
  if (process.env.OPENWORK_MONOREPO_ROOT?.trim()) {
    return path.resolve(process.env.OPENWORK_MONOREPO_ROOT.trim());
  }
  return path.resolve(here, "..");
}

/** @returns {string | null} */
function readConstantsOpencodeVersion(root) {
  try {
    const raw = readFileSync(path.join(root, "constants.json"), "utf8");
    const parsed = JSON.parse(raw);
    const v = typeof parsed.opencodeVersion === "string" ? parsed.opencodeVersion.trim() : "";
    if (!v) return null;
    return v.startsWith("v") ? v.slice(1) : v;
  } catch {
    return null;
  }
}

/** @returns {string | null} */
export function resolveSidecarTarget() {
  if (process.platform === "darwin") {
    if (process.arch === "arm64") return "darwin-arm64";
    if (process.arch === "x64") return "darwin-x64";
    return null;
  }
  if (process.platform === "linux") {
    if (process.arch === "arm64") return "linux-arm64";
    if (process.arch === "x64") return "linux-x64";
    return null;
  }
  if (process.platform === "win32") {
    if (process.arch === "arm64") return "windows-arm64";
    if (process.arch === "x64") return "windows-x64";
    return null;
  }
  return null;
}

/** @param {string} binPath */
function isRunnable(binPath) {
  if (!binPath || !existsSync(binPath)) return false;
  try {
    if (process.platform === "win32") return binPath.toLowerCase().endsWith(".exe");
    return true;
  } catch {
    return false;
  }
}

/** @param {string} file */
function pathOnPath(file) {
  const cmd = process.platform === "win32" ? "where" : "which";
  const r = spawnSync(cmd, [file], { stdio: "ignore", shell: true });
  if (r.status !== 0) return null;
  const out = (r.stdout?.toString("utf8") ?? "").trim().split(/\r?\n/)[0];
  return out && isRunnable(out) ? out : null;
}

/**
 * @param {string} root
 * @returns {string[]}
 */
export function opencodeCandidatePaths(root) {
  const exe = process.platform === "win32" ? "opencode.exe" : "opencode";
  const target = resolveSidecarTarget();
  const version = readConstantsOpencodeVersion(root);
  const dataDir =
    process.env.OPENWORK_DATA_DIR?.trim() ||
    (process.platform === "win32"
      ? path.join(process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"), "openwork", "openworkplus-orchestrator")
      : path.join(homedir(), ".openwork", "openworkplus-orchestrator"));
  const sidecarRoots = [
    process.env.OPENWORK_SIDECAR_DIR?.trim(),
    path.join(dataDir, "sidecars"),
    path.join(root, "apps", "desktop", "src-tauri", "sidecars"),
    path.join(root, "apps", "orchestrator", "dist"),
  ].filter(Boolean);

  /** @type {string[]} */
  const out = [];

  for (const dir of sidecarRoots) {
    const base = path.resolve(String(dir));
    out.push(path.join(base, exe));
    if (target) {
      out.push(path.join(base, `${exe.replace(/\.exe$/i, "")}-${target}${process.platform === "win32" ? ".exe" : ""}`));
      if (version) {
        out.push(path.join(base, "opencode", version, target, exe));
      }
    }
  }

  const pathHit = pathOnPath(process.platform === "win32" ? "opencode.exe" : "opencode");
  if (pathHit) out.unshift(pathHit);

  const envBin = process.env.OPENCODE_BIN?.trim() || process.env.OPENWORK_OPENCODE_BIN?.trim();
  if (envBin) out.unshift(path.resolve(envBin));

  return [...new Set(out)];
}

/**
 * @param {string} [root]
 * @returns {string | null}
 */
export function findOpencodeBinSync(root) {
  const monorepo = defaultMonorepoRoot(root);
  for (const candidate of opencodeCandidatePaths(monorepo)) {
    if (isRunnable(candidate)) return candidate;
  }
  return null;
}

const OPENCODE_ASSET_BY_TARGET = {
  "darwin-arm64": "opencode-darwin-arm64.zip",
  "darwin-x64": "opencode-darwin-x64-baseline.zip",
  "linux-x64": "opencode-linux-x64-baseline.tar.gz",
  "linux-arm64": "opencode-linux-arm64.tar.gz",
  "windows-x64": "opencode-windows-x64-baseline.zip",
  "windows-arm64": "opencode-windows-arm64.zip",
};

/** @param {string} dir */
function findOpencodeBinaryInTree(dir) {
  const exe = process.platform === "win32" ? "opencode.exe" : "opencode";
  /** @param {string} current */
  function walk(current) {
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        const nested = walk(full);
        if (nested) return nested;
      } else if (entry.isFile() && (entry.name === exe || entry.name === "opencode")) {
        return full;
      }
    }
    return null;
  }
  return walk(dir);
}

/**
 * 仅下载 OpenCode sidecar 到 desktop sidecars（不构建 openworkplus-server / bun）。
 * @param {string} root
 */
export function downloadOpencodeSidecar(root) {
  const monorepo = defaultMonorepoRoot(root);
  const version = readConstantsOpencodeVersion(monorepo);
  const target = resolveSidecarTarget();
  if (!version || !target) {
    throw new Error("cannot resolve opencode version or platform target");
  }
  const asset = process.env.OPENCODE_ASSET?.trim() || OPENCODE_ASSET_BY_TARGET[target];
  if (!asset) throw new Error(`no opencode asset for target ${target}`);

  const sidecarDir = path.join(monorepo, "apps", "desktop", "src-tauri", "sidecars");
  mkdirSync(sidecarDir, { recursive: true });
  const exe = process.platform === "win32" ? "opencode.exe" : "opencode";
  const destPath = path.join(sidecarDir, exe);
  const url = `https://github.com/anomalyco/opencode/releases/download/v${version}/${asset}`;

  console.log(`[resolve-opencode] downloading ${url}`);
  const stamp = Date.now();
  const archivePath = path.join(tmpdir(), `opencode-${stamp}-${asset}`);
  const extractDir = path.join(tmpdir(), `opencode-${stamp}-extract`);
  mkdirSync(extractDir, { recursive: true });

  if (process.platform === "win32") {
    const psQuote = (v) => `'${String(v).replace(/'/g, "''")}'`;
    const psScript = [
      "$ErrorActionPreference = 'Stop'",
      `Invoke-WebRequest -Uri ${psQuote(url)} -OutFile ${psQuote(archivePath)}`,
      `Expand-Archive -Path ${psQuote(archivePath)} -DestinationPath ${psQuote(extractDir)} -Force`,
    ].join("; ");
    const r = spawnSync("powershell", ["-NoProfile", "-Command", psScript], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("opencode download/extract failed (powershell)");
  } else {
    const dl = spawnSync("curl", ["-fsSL", "-o", archivePath, url], { stdio: "inherit" });
    if (dl.status !== 0) throw new Error("opencode download failed (curl)");
    if (asset.endsWith(".zip")) {
      const uz = spawnSync("unzip", ["-q", archivePath, "-d", extractDir], { stdio: "inherit" });
      if (uz.status !== 0) throw new Error("opencode unzip failed");
    } else {
      const tar = spawnSync("tar", ["-xzf", archivePath, "-C", extractDir], { stdio: "inherit" });
      if (tar.status !== 0) throw new Error("opencode tar extract failed");
    }
  }

  const extracted = findOpencodeBinaryInTree(extractDir);
  if (!extracted) throw new Error("opencode binary not found after extract");

  if (existsSync(destPath)) {
    try {
      unlinkSync(destPath);
    } catch {
      // ignore
    }
  }
  copyFileSync(extracted, destPath);
  try {
    chmodSync(destPath, 0o755);
  } catch {
    // ignore
  }
  console.log(`[resolve-opencode] installed ${destPath} (${version})`);
  return destPath;
}

/**
 * @param {{ root?: string, allowDownload?: boolean }} [opts]
 * @returns {Promise<string | null>}
 */
export async function ensureOpencodeBin(opts = {}) {
  const root = defaultMonorepoRoot(opts.root);
  let bin = findOpencodeBinSync(root);
  if (bin) return bin;

  if (opts.allowDownload === false) return null;

  console.log("[resolve-opencode] sidecar not found — downloading opencode only...");
  bin = downloadOpencodeSidecar(root);
  return bin ?? findOpencodeBinSync(root);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const allowDownload = process.argv.includes("--download");
  ensureOpencodeBin({ allowDownload })
    .then((bin) => {
      if (!bin) {
        console.error("opencode binary not found");
        process.exitCode = 1;
        return;
      }
      console.log(bin);
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    });
}
