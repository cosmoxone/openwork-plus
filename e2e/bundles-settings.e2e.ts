// Bundle settings page e2e (A3).
//
// Run: pnpm test:e2e:electron -- e2e/bundles-settings.e2e.ts

import { test, expect, _electron, type ElectronApplication, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";

import { seedE2eLocalStorage } from "./helpers/seed-local-storage";

const repoRoot = path.resolve(__dirname, "..");
const rendererOrigin = "http://127.0.0.1:4173";

function hashRoute(routePath: string): string {
  const normalized = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${rendererOrigin}/#${normalized}`;
}

let electronApp: ElectronApplication;
let page: Page;

function resolveElectronExe(): string {
  const desktopRequire = createRequire(path.join(repoRoot, "apps", "desktop", "package.json"));
  const electronModule = desktopRequire("electron");
  if (typeof electronModule === "string") return electronModule;
  return path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
}

async function gotoBundlesSettings() {
  await page.goto(hashRoute("/settings/bundles"), { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("bundles-install-from-zip")).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(async () => {
  process.env.OPENWORK_DEV_MODE = "1";

  const electronPath = resolveElectronExe();
  electronApp = await _electron.launch({
    executablePath: electronPath,
    args: [path.join(repoRoot, "apps", "desktop"), "--no-sandbox"],
    cwd: path.join(repoRoot, "apps", "desktop"),
    env: {
      ...process.env,
      OPENWORK_DEV_MODE: "1",
      OPENWORK_ELECTRON_START_URL: hashRoute("/"),
      NODE_ENV: "development",
      ELECTRON_DISABLE_SANDBOX: "1",
    } as NodeJS.ProcessEnv,
    timeout: 60_000,
    colorScheme: "dark",
  });

  page = await electronApp.firstWindow();
  await seedE2eLocalStorage(page);
  await page.waitForLoadState("domcontentloaded", { timeout: 60_000 });
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

test.describe("Bundles settings page", () => {
  test("hash route renders Bundles view", async () => {
    await gotoBundlesSettings();
    await expect(page.getByTestId("bundles-install-from-zip")).toBeVisible();
    await expect(page.getByTestId("bundles-install-from-folder")).toBeVisible();
    await expect(page.getByTestId("bundles-check-updates")).toBeVisible();
  });

  test("filter tabs are visible and clickable", async () => {
    await gotoBundlesSettings();
    await page.waitForTimeout(1500);

    for (const key of ["all", "installed", "available"] as const) {
      const tab = page.getByTestId(`bundles-filter-${key}`);
      await expect(tab).toBeVisible();
      await tab.click();
      await page.waitForTimeout(300);
    }
  });

  test("advanced panel exposes remote catalog controls", async () => {
    await gotoBundlesSettings();
    const advanced = page.getByTestId("bundles-advanced-panel");
    await expect(advanced).toBeVisible();
    await advanced.locator("summary").click();
    await expect(page.getByTestId("bundles-remote-url-input")).toBeVisible();
    await expect(page.getByTestId("bundles-remote-url-save")).toBeVisible();
    await expect(page.getByTestId("bundles-export-from-folder")).toBeVisible();
  });

  test("settings index exposes Bundles nav card", async () => {
    await page.goto(hashRoute("/settings/general"), { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("settings-nav-bundles")).toBeVisible({ timeout: 30_000 });
  });

  test("install from zip button is enabled (no native dialog)", async () => {
    await gotoBundlesSettings();
    const installButton = page.getByTestId("bundles-install-from-zip");
    await expect(installButton).toBeVisible();
    await expect(installButton).toBeEnabled();
  });
});

test.describe("Bundles workspace fixture (A3-02)", () => {
  test("builtin catalog cards render with IPC workspace", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { ensureLocalWorkspaceFixture } = await import("./helpers/workspace-fixture");
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), "openwork-e2e-workspace-root-"));
    try {
      await ensureLocalWorkspaceFixture(page, fixtureRoot);
      await gotoBundlesSettings();
      await expect(page.getByTestId("bundle-catalog-card-computer-use")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("bundle-install-computer-use")).toBeVisible();
    } finally {
      const { rmSync } = await import("node:fs");
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});

test.describe("Bundles deep links (A3-03)", () => {
  async function deliverSettingsDeepLink(rawUrl: string) {
    await page.evaluate((url) => {
      window.dispatchEvent(
        new CustomEvent("openwork:deep-link", {
          detail: { urls: [url] },
        }),
      );
    }, rawUrl);
  }

  test("openwork-plus://settings/bundles navigates to Bundles", async () => {
    await page.goto(hashRoute("/settings/general"), { waitUntil: "domcontentloaded" });
    await deliverSettingsDeepLink("openwork-plus://settings/bundles");
    await expect(page).toHaveURL(/#\/settings\/bundles(?:\?.*)?$/, { timeout: 15_000 });
    await expect(page.getByTestId("bundles-install-from-zip")).toBeVisible({ timeout: 30_000 });
  });
});
