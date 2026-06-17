// Industry Bundle catalog：builtin + remote + installed 合并。
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { resolveDataDir } from "./installer.mjs";

/** @param {string} a @param {string} b */
export function compareSemver(a, b) {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * @param {Array<{ id: string, version: string, [k: string]: unknown }>} entries
 */
export function pickLatestById(entries) {
  /** @type {Map<string, any>} */
  const map = new Map();
  for (const e of entries) {
    if (!e?.id) continue;
    const prev = map.get(e.id);
    if (!prev || compareSemver(e.version, prev.version) > 0) {
      map.set(e.id, e);
    }
  }
  return [...map.values()];
}

/** @param {string} file */
export async function readCatalogFile(file) {
  if (!existsSync(file)) return { schemaVersion: "1.0.0", source: "unknown", bundles: [] };
  return JSON.parse(await readFile(file, "utf8"));
}

/**
 * 合并 catalog 与已安装状态。
 * @param {{
 *   builtin?: { bundles?: any[] },
 *   remote?: { bundles?: any[] },
 *   installed?: Array<{ id: string, version: string, name?: string, installedAt?: string }>,
 * }} input
 */
export function mergeCatalogView(input) {
  const all = pickLatestById([
    ...(input.builtin?.bundles ?? []).map((b) => ({ ...b, source: "builtin" })),
    ...(input.remote?.bundles ?? []).map((b) => ({ ...b, source: "remote" })),
  ]);

  const installedById = new Map((input.installed ?? []).map((b) => [b.id, b]));

  return all.map((entry) => {
    const inst = installedById.get(entry.id);
    const installed = Boolean(inst);
    const updateAvailable =
      installed && inst?.version ? compareSemver(entry.version, inst.version) > 0 : false;
    return {
      ...entry,
      installed,
      installedVersion: inst?.version ?? null,
      installedAt: inst?.installedAt ?? null,
      updateAvailable,
      status: installed ? (updateAvailable ? "update_available" : "installed") : "available",
    };
  });
}

/** @param {string} [dataDir] */
export function catalogCacheDir(dataDir) {
  return path.join(resolveDataDir(dataDir), "bundle-catalog");
}

/** @param {string} url @param {string} [dataDir] */
export async function fetchRemoteCatalog(url, dataDir) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const json = await res.json();
  const dir = catalogCacheDir(dataDir);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "remote.json");
  await writeFile(
    file,
    JSON.stringify({ ...json, fetchedAt: new Date().toISOString(), url }, null, 2),
  );
  return json;
}

/** @param {string} [dataDir] */
export async function readCachedRemoteCatalog(dataDir) {
  const file = path.join(catalogCacheDir(dataDir), "remote.json");
  return readCatalogFile(file);
}

/** @param {string} url @param {string} [dataDir] */
export async function fetchRemoteCatalogWithFallback(url, dataDir) {
  try {
    return { catalog: await fetchRemoteCatalog(url, dataDir), stale: false };
  } catch (error) {
    const cached = await readCachedRemoteCatalog(dataDir);
    if (cached?.bundles?.length) {
      return {
        catalog: cached,
        stale: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    throw error;
  }
}
