const CATALOG_URL_KEY = "openwork.bundleCatalogUrl";

/** 可选 Hub catalog URL（localStorage，供本地 dev / 私有 Hub）。 */
export function getIndustryBundleCatalogUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = window.localStorage.getItem(CATALOG_URL_KEY)?.trim();
  return value || undefined;
}

export function setIndustryBundleCatalogUrl(url: string): void {
  if (typeof window === "undefined") return;
  const trimmed = url.trim();
  if (!trimmed) {
    window.localStorage.removeItem(CATALOG_URL_KEY);
    return;
  }
  window.localStorage.setItem(CATALOG_URL_KEY, trimmed);
}

export const DEFAULT_PROD_CATALOG_URL = "https://hub.openwork.plus/catalog.json";
export const DEFAULT_DEV_CATALOG_URL = "http://127.0.0.1:9123/catalog.json";
