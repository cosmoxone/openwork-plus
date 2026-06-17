import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const hubPort = process.env.BUNDLE_HUB_DEV_PORT ?? "9123";
const appPort = process.env.INDUSTRY_BUNDLE_E2E_PORT ?? "5199";
const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");

export default defineConfig({
  testDir: "./e2e/specs",
  globalSetup: path.join(appDir, "e2e/global-setup.mjs"),
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: path.join(repoRoot, "tmp/industry-bundle-playwright"),
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    trace: "retain-on-failure",
    channel: "chrome",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "pnpm exec vite --config vite.e2e.config.ts",
      url: `http://127.0.0.1:${appPort}`,
      cwd: appDir,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
