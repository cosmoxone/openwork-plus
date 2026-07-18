declare const describe: (name: string, fn: () => void) => void;
declare const test: (name: string, fn: () => void) => void;
declare const expect: (value: unknown) => {
  toEqual: (expected: unknown) => void;
  toBe: (expected: unknown) => void;
};

import { parseSettingsNavigationDeepLink } from "./openwork-links";

describe("parseSettingsNavigationDeepLink", () => {
  test("parses openwork-plus host-style settings routes", () => {
    expect(parseSettingsNavigationDeepLink("openwork-plus://settings/bundles")).toEqual({
      path: "/settings/bundles",
    });
    expect(parseSettingsNavigationDeepLink("openwork-plus://settings/general")).toEqual({
      path: "/settings/general",
    });
  });

  test("parses path-style settings routes", () => {
    expect(parseSettingsNavigationDeepLink("openwork-plus:///settings/bundles")).toEqual({
      path: "/settings/bundles",
    });
  });

  test("parses workspace-scoped settings routes", () => {
    expect(
      parseSettingsNavigationDeepLink("openwork-plus://workspace/ws_e2e123/settings/bundles"),
    ).toEqual({
      path: "/workspace/ws_e2e123/settings/bundles",
    });
    expect(
      parseSettingsNavigationDeepLink("openwork-plus:///workspace/ws_e2e123/settings/bundles"),
    ).toEqual({
      path: "/workspace/ws_e2e123/settings/bundles",
    });
  });

  test("accepts legacy openwork schemes", () => {
    expect(parseSettingsNavigationDeepLink("openwork://settings/bundles")).toEqual({
      path: "/settings/bundles",
    });
    expect(parseSettingsNavigationDeepLink("openwork-dev://settings/bundles")).toEqual({
      path: "/settings/bundles",
    });
  });

  test("ignores unrelated deep links", () => {
    expect(parseSettingsNavigationDeepLink("openwork-plus://connect?token=abc")).toBe(null);
    expect(parseSettingsNavigationDeepLink("https://example.com/settings/bundles")).toBe(null);
  });
});
