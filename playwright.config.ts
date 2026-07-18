// Playwright config for Electron e2e tests.
//
// Scope: OpenWork Plus desktop shell. Each spec launches the packaged
// Electron binary from apps/desktop via _electron.launch(), so tests run
// against the REAL main process (real IPC, real orchestrator sidecar
// resolution) — not a jsdom mock.
//
// Test files live next to this config under e2e/. Convention: *.e2e.ts.
//
// Run:    pnpm test:e2e
// Debug:  pnpm test:e2e -- --headed --debug

import { defineConfig } from "@playwright/test";

const isWindows = process.platform === "win32";

export default defineConfig({
  testDir: "./e2e",
  // Match *.e2e.ts / *.spec.ts. Default Playwright glob ignores .e2e.ts,
  // which is the convention we use to distinguish Electron e2e from
  // unit tests (which run via bun:test under apps/*/src).
  testMatch: /.*\.(e2e|spec)\.(ts|js|mjs)$/,
  // Each spec file gets its own Electron instance; tests within a file
  // share a single launch to keep startup cost amortized.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }], ["junit", { outputFile: "e2e-results.xml" }]]
    : [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Custom hook — see parseTestOptions in spec files. Lets individual
    // specs opt out of the default sidecar startup if they need isolation.
    sidecarOverride: process.env.OPENWORK_SIDECAR_DIR ?? "",
  },
  projects: [
    {
      name: "electron",
      use: {
        // Channel is unused for Electron; we launch our own binary.
        // Real launch happens in beforeAll of each spec via _electron.launch.
      },
    },
  ],
  // We intentionally do NOT set webServer. The desktop binary launches its
  // own Vite dev server via electron-dev.mjs when OPENWORK_DEV_MODE=1.
  // For production-like tests we use the built dist/ — see e2e/fixtures.
  metadata: {
    platform: isWindows ? "windows" : process.platform,
    openworkDevMode: process.env.OPENWORK_DEV_MODE ?? "0",
  },
});
