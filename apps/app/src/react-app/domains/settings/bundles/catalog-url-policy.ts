export type CatalogUrlValidation =
  | { ok: true; normalizedUrl: string }
  | { ok: false; reason: "invalid" | "protocol" | "ip_address" | "path" };

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function isIpAddress(hostname: string): boolean {
  return IPV4_PATTERN.test(hostname) || hostname.includes(":");
}

/**
 * Validate a remote Bundle catalog endpoint before persisting it.
 *
 * Production endpoints must use HTTPS. Development may use
 * http://localhost, but raw IP addresses remain blocked. A fixed endpoint
 * suffix narrows accidental/malicious URLs to catalog-shaped resources.
 */
export function validateCatalogUrl(
  value: string,
  options: { allowInsecure?: boolean } = {},
): CatalogUrlValidation {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const hostname = url.hostname.toLowerCase();
  if (isIpAddress(hostname)) {
    return { ok: false, reason: "ip_address" };
  }

  const localDevelopment =
    url.protocol === "http:" &&
    hostname === "localhost" &&
    options.allowInsecure === true;
  if (url.protocol !== "https:" && !localDevelopment) {
    return { ok: false, reason: "protocol" };
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "").toLowerCase();
  if (!normalizedPath.endsWith("/catalog.json") && !normalizedPath.endsWith("/catalog")) {
    return { ok: false, reason: "path" };
  }

  url.hash = "";
  return { ok: true, normalizedUrl: url.toString() };
}
