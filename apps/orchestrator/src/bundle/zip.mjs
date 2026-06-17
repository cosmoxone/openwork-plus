// Industry Bundle zip 打包/解压（无第三方依赖，调用系统 zip / PowerShell）。
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

/** @param {string} sourceDir @param {string} outputZip */
export async function packZip(sourceDir, outputZip) {
  const root = path.resolve(sourceDir);
  if (!existsSync(path.join(root, "bundle.json"))) {
    throw new Error(`pack 源目录缺少 bundle.json: ${root}`);
  }
  await mkdir(path.dirname(path.resolve(outputZip)), { recursive: true });
  const out = path.resolve(outputZip);
  if (existsSync(out)) await rm(out, { force: true });

  if (process.platform === "win32") {
    const ps = [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${root.replace(/'/g, "''")}\\*' -DestinationPath '${out.replace(/'/g, "''")}' -Force`,
    ];
    await execFileAsync("powershell", ps, { timeout: 120_000 });
    return out;
  }

  await execFileAsync("zip", ["-r", out, "."], { cwd: root, timeout: 120_000 });
  return out;
}

/** @param {string} zipPath @param {string} destDir */
export async function unzipToDir(zipPath, destDir) {
  const zip = path.resolve(zipPath);
  if (!existsSync(zip)) throw new Error(`zip 不存在: ${zip}`);
  await mkdir(destDir, { recursive: true });

  if (process.platform === "win32") {
    await execFileAsync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${zip.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
      ],
      { timeout: 120_000 },
    );
    return destDir;
  }

  await execFileAsync("unzip", ["-o", zip, "-d", destDir], { timeout: 120_000 });
  return destDir;
}

/**
 * 解压 zip 并定位含 bundle.json 的根目录。
 * @param {string} zipPath
 * @returns {Promise<{ dir: string, cleanup: () => Promise<void> }>}
 */
export async function extractBundleZip(zipPath) {
  const { mkdtemp } = await import("node:fs/promises");
  const os = await import("node:os");
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ow-bundle-zip-"));
  await unzipToDir(zipPath, tempRoot);

  if (existsSync(path.join(tempRoot, "bundle.json"))) {
    return {
      dir: tempRoot,
      cleanup: async () => rm(tempRoot, { recursive: true, force: true }),
    };
  }

  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(tempRoot, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = path.join(tempRoot, e.name);
    if (existsSync(path.join(candidate, "bundle.json"))) {
      return {
        dir: candidate,
        cleanup: async () => rm(tempRoot, { recursive: true, force: true }),
      };
    }
  }

  await rm(tempRoot, { recursive: true, force: true });
  throw new Error("zip 内未找到 bundle.json");
}
