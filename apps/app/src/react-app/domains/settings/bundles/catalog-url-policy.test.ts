declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => {
  toBe: (expected: unknown) => void;
};

import { validateCatalogUrl } from "./catalog-url-policy";

describe("validateCatalogUrl", () => {
  test("accepts an HTTPS catalog endpoint", () => {
    const result = validateCatalogUrl("https://hub.example.com/catalog.json");
    expect(result.ok).toBe(true);
  });

  test("allows localhost HTTP only in development", () => {
    expect(
      validateCatalogUrl("http://localhost:4173/catalog", {
        allowInsecure: true,
      }).ok,
    ).toBe(true);
    expect(validateCatalogUrl("http://localhost:4173/catalog").ok).toBe(false);
  });

  test("rejects raw IP addresses", () => {
    expect(
      validateCatalogUrl("https://127.0.0.1/catalog.json").ok,
    ).toBe(false);
  });

  test("requires a catalog endpoint path", () => {
    expect(validateCatalogUrl("https://hub.example.com/bundles.json").ok).toBe(false);
  });
});
