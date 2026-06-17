// 从 Hub downloadUrl 下载 bundle zip，可选 sha256 校验，并缓存到 dataDir。
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveDataDir } from "./installer.mjs";

/** @param {string} filePath */
export async function sha256File(filePath) {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

/** @param {string} [dataDir] */
export function bundleDownloadCacheDir(dataDir) {
  return path.join(resolveDataDir(dataDir), "bundle-downloads");
}

/**
 * @param {{
 *   downloadUrl: string,
 *   bundleId: string,
 *   version: string,
 *   expectedSha256?: string | null,
 *   dataDir?: string,
 *   force?: boolean,
 * }} opts
 * @returns {Promise<string>} 本地 zip 路径
 */
export async function downloadBundleZip(opts) {
  const { downloadUrl, bundleId, version, expectedSha256, dataDir, force = false } = opts;
  if (!downloadUrl?.trim()) {
    throw new Error("downloadUrl required");
  }

  const cacheDir = bundleDownloadCacheDir(dataDir);
  await mkdir(cacheDir, { recursive: true });
  const dest = path.join(cacheDir, `${bundleId}-${version}.zip`);
  const expected = expectedSha256?.trim().toLowerCase();

  if (!force && existsSync(dest)) {
    if (!expected) return dest;
    const hash = await sha256File(dest);
    if (hash === expected) return dest;
    await rm(dest, { force: true });
  }

  const res = await fetch(downloadUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    throw new Error(`bundle download failed: ${res.status} ${downloadUrl}`);
  }

  const tmp = `${dest}.${Date.now()}.part`;
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(tmp, buf);

  if (expected) {
    const hash = createHash("sha256").update(buf).digest("hex");
    if (hash !== expected) {
      await rm(tmp, { force: true });
      throw new Error(`sha256 mismatch for ${bundleId}@${version}: expected ${expected}, got ${hash}`);
    }
  }

  await rm(dest, { force: true });
  const { rename } = await import("node:fs/promises");
  await rename(tmp, dest);
  return dest;
}
