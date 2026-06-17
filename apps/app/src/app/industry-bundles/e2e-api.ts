/** Playwright E2E：浏览器内 Industry Bundle API（对接本地 Hub，不依赖 Tauri）。 */
import { getIndustryBundleCatalogUrl, setIndustryBundleCatalogUrl } from "./catalog-url";
import type {
  IndustryBundleCatalogEntry,
  IndustryBundleInstallResult,
  IndustryBundleUiManifest,
} from "./types";

export function isIndustryBundleE2E(): boolean {
  return import.meta.env.VITE_INDUSTRY_BUNDLE_E2E === "1";
}

const INSTALLED_KEY = "openwork.e2e.industryBundlesInstalled";

type InstalledRecord = {
  id: string;
  version: string;
  installedAt: string;
};

function readInstalled(): InstalledRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INSTALLED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeInstalled(records: InstalledRecord[]) {
  window.localStorage.setItem(INSTALLED_KEY, JSON.stringify(records));
}

function compareSemver(a: string, b: string) {
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

function pickLatestById(entries: Array<{ id: string; version: string; [k: string]: unknown }>) {
  const map = new Map<string, (typeof entries)[number]>();
  for (const e of entries) {
    if (!e?.id) continue;
    const prev = map.get(e.id);
    if (!prev || compareSemver(e.version, prev.version) > 0) map.set(e.id, e);
  }
  return [...map.values()];
}

function mergeCatalogView(input: {
  builtin: { bundles?: any[] };
  remote: { bundles?: any[] };
  installed: InstalledRecord[];
}): IndustryBundleCatalogEntry[] {
  const all = pickLatestById([
    ...(input.builtin?.bundles ?? []).map((b) => ({ ...b, source: "builtin" })),
    ...(input.remote?.bundles ?? []).map((b) => ({ ...b, source: "remote" })),
  ]);
  const installedById = new Map(input.installed.map((b) => [b.id, b]));
  return all.map((entry) => {
    const inst = installedById.get(entry.id);
    const installed = Boolean(inst);
    const updateAvailable =
      installed && inst?.version ? compareSemver(entry.version, inst.version) > 0 : false;
    return {
      id: entry.id,
      name: entry.name ?? entry.id,
      version: entry.version,
      description: entry.description ?? "",
      source: entry.source,
      path: entry.path ?? null,
      downloadUrl: entry.downloadUrl ?? null,
      sha256: entry.sha256 ?? null,
      installed,
      installedVersion: inst?.version ?? null,
      installedAt: inst?.installedAt ?? null,
      updateAvailable,
      status: installed ? (updateAvailable ? "update_available" : "installed") : "available",
      featured: entry.featured,
    };
  });
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  return res.json();
}

async function sha256Hex(buffer: ArrayBuffer) {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function e2eListIndustryBundleCatalog(
  remoteUrl?: string,
): Promise<IndustryBundleCatalogEntry[]> {
  const builtin = await fetchJson("/e2e/catalog.builtin.json");
  let remote = { bundles: [] as any[] };
  const url = remoteUrl?.trim() || getIndustryBundleCatalogUrl();
  if (url) {
    try {
      remote = await fetchJson(url);
    } catch {
      remote = { bundles: [] };
    }
  }
  return mergeCatalogView({ builtin, remote, installed: readInstalled() });
}

export async function e2eInstallIndustryBundleFromCatalog(
  bundleId: string,
  replace = false,
  remoteUrl?: string,
): Promise<IndustryBundleInstallResult> {
  const entries = await e2eListIndustryBundleCatalog(remoteUrl);
  const entry = entries.find((b) => b.id === bundleId);
  if (!entry) throw new Error(`bundle not in catalog: ${bundleId}`);

  const installed = readInstalled();
  if (installed.some((b) => b.id === bundleId) && !replace) {
    throw new Error(`bundle already installed: ${bundleId}`);
  }

  const useRemote = Boolean(
    entry.downloadUrl && (entry.source === "remote" || entry.updateAvailable || replace),
  );

  if (useRemote && entry.downloadUrl) {
    const res = await fetch(entry.downloadUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    const buf = await res.arrayBuffer();
    if (entry.sha256) {
      const hash = await sha256Hex(buf);
      if (hash !== entry.sha256.toLowerCase()) {
        throw new Error(`sha256 mismatch: expected ${entry.sha256}, got ${hash}`);
      }
    }
  }

  const next = installed.filter((b) => b.id !== bundleId);
  next.push({
    id: bundleId,
    version: entry.version,
    installedAt: new Date().toISOString(),
  });
  writeInstalled(next);

  return {
    id: bundleId,
    version: entry.version,
    sourceKind: useRemote ? "remote" : "builtin",
  };
}

export async function e2eUninstallIndustryBundle(bundleId: string): Promise<void> {
  writeInstalled(readInstalled().filter((b) => b.id !== bundleId));
}

export async function e2eReadIndustryBundleUiManifest(): Promise<IndustryBundleUiManifest> {
  return { bundles: readInstalled().map((b) => ({ id: b.id, version: b.version })) };
}

export function e2eResetIndustryBundles() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(INSTALLED_KEY);
    window.localStorage.removeItem("openwork.bundleCatalogUrl");
  }
}

export { setIndustryBundleCatalogUrl, getIndustryBundleCatalogUrl };
