// Bundle settings page e2e (A3).
//
// Goals:
//   - Stable navigation via /settings/bundles (no fragile Settings click chain)
//   - data-testid selectors for core controls
//   - Skip OpenWork Models startup modal via localStorage init script
//   - Do NOT assert native Electron file/save dialogs
//
// Run: pnpm test:e2e:electron -- e2e/bundles-settings.e2e.ts

import { test, expect, _electron, type ElectronApplication, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");
const rendererBaseUrl = "http://127.0.0.1:4173";

let electronApp: ElectronApplication;
let page: Page;

function resolveElectronExe(): string {
  const desktopRequire = createRequire(path.join(repoRoot, "apps", "desktop", "package.json"));
  const electronModule = desktopRequire("electron");
  if (typeof electronModule === "string") return electronModule;
  return path.join(repoRoot, "node_modules", "electron", "dist", "electron.exe");
}

async function gotoBundlesSettings() {
  await page.goto(`${rendererBaseUrl}/settings/bundles`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("bundles-settings-view")).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(async () => {
  process.env.OPENWORK_DEV_MODE = "1";
  process.env.OPENWORK_ELECTRON_REMOTE_DEBUG_PORT = "9223";
  process.env.OPENWORK_IPC_TRACE = "bundle";

  const electronPath = resolveElectronExe();
  electronApp = await _electron.launch({
    executablePath: electronPath,
    args: [path.join(repoRoot, "apps", "desktop"), "--no-sandbox"],
    cwd: path.join(repoRoot, "apps", "desktop"),
    env: {
      ...process.env,
      OPENWORK_DEV_MODE: "1",
      OPENWORK_ELECTRON_START_URL: rendererBaseUrl,
      NODE_ENV: "development",
    } as NodeJS.ProcessEnv,
    timeout: 60_000,
    colorScheme: "dark",
  });

  page = await electronApp.firstWindow();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("openwork.openworkModelsPromo.hidden", "1");
      localStorage.setItem("openwork.openworkModelsPromo.startupShown", String(Date.now()));
    } catch {
      // ignore
    }
  });
  await page.waitForLoadState("domcontentloaded", { timeout: 60_000 });
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

test.describe("Bundles settings page", () => {
  test("deep-link route renders Bundles view", async () => {
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
    await page.goto(`${rendererBaseUrl}/settings/general`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("settings-nav-bundles")).toBeVisible({ timeout: 30_000 });
  });

  test("install from zip button is enabled (no native dialog)", async () => {
    await gotoBundlesSettings();
    const installButton = page.getByTestId("bundles-install-from-zip");
    await expect(installButton).toBeVisible();
    await expect(installButton).toBeEnabled();
  });
});
