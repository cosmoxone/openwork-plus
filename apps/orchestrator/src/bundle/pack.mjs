// `ow bundle pack` — 将 bundle 目录打包为 .zip。
import path from "node:path";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { loadBundle } from "./schema.mjs";
import { packZip } from "./zip.mjs";

/** 打包前注入 vendor 依赖（离线 zip 安装可运行 preinstall）。 */
async function stageVendorDeps(bundleRoot, manifest) {
  if (manifest.id !== "computer-use") return;
  const srcDir = path.resolve(bundleRoot, "..", "..", "packages", "sandbox-bootstrap", "src");
  if (!existsSync(srcDir)) return;
  const dest = path.join(bundleRoot, "vendor", "sandbox-bootstrap");
  await rm(dest, { recursive: true, force: true });
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(srcDir, dest, { recursive: true });
}

/**
 * @param {{ bundleDir: string, output?: string }} opts
 */
export async function packBundle(opts) {
  const { manifest, root } = await loadBundle(opts.bundleDir);
  await stageVendorDeps(root, manifest);
  const defaultName = `${manifest.id}-${manifest.version}.zip`;
  const output = path.resolve(opts.output ?? path.join(root, defaultName));
  try {
    await packZip(root, output);
    return { id: manifest.id, version: manifest.version, output, manifest };
  } finally {
    if (manifest.id === "computer-use") {
      await rm(path.join(root, "vendor"), { recursive: true, force: true });
    }
  }
}

/** 计算 zip 的 sha256（hex）。 */
export async function sha256File(filePath) {
  const { createHash } = await import("node:crypto");
  const { readFile: rf } = await import("node:fs/promises");
  const buf = await rf(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * 生成 catalog 条目。
 * @param {string} zipPath
 * @param {{ downloadUrl?: string, manifestUrl?: string }} [meta]
 */
export async function catalogEntryFromZip(zipPath, meta = {}) {
  const { extractBundleZip } = await import("./zip.mjs");
  const { dir, cleanup } = await extractBundleZip(zipPath);
  try {
    const { manifest } = await loadBundle(dir);
    const hash = await sha256File(zipPath);
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description ?? "",
      sha256: hash,
      path: path.basename(zipPath),
      downloadUrl: meta.downloadUrl ?? null,
      manifestUrl: meta.manifestUrl ?? null,
      requires: manifest.requires ?? {},
    };
  } finally {
    await cleanup();
  }
}
