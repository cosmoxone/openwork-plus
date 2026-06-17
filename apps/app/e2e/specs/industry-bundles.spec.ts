import { expect, test } from "@playwright/test";

const HUB_CATALOG = "http://127.0.0.1:9123/catalog.json";

async function openAdvanced(page: import("@playwright/test").Page) {
  await page.getByTestId("industry-bundle-advanced-toggle").click();
}

test.describe("Industry Bundles (minimal E2E)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("industry-bundles-e2e-harness")).toBeVisible();
  });

  test("lists builtin bundles computer-use and test-automation", async ({ page }) => {
    await expect(page.getByTestId("industry-bundle-card-computer-use")).toBeVisible();
    await expect(page.getByTestId("industry-bundle-card-test-automation")).toBeVisible();
    await expect(page.getByTestId("industry-bundle-install-computer-use")).toBeVisible();
  });

  test("install from builtin then update from localhost Hub", async ({ page }) => {
    await page.getByTestId("industry-bundle-install-computer-use").click();
    await expect(page.getByTestId("industry-bundle-installed-count")).toContainText("1");
    await expect(page.getByTestId("industry-bundle-version-computer-use")).toContainText("0.1.0");

    await openAdvanced(page);
    await page.getByTestId("industry-bundle-catalog-url").fill(HUB_CATALOG);
    await page.getByTestId("industry-bundle-catalog-save").click();

    await page.getByTestId("industry-bundle-check-updates").click();
    await expect(page.getByTestId("industry-bundle-update-computer-use")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("industry-bundle-update-computer-use").click();
    await expect(page.getByTestId("industry-bundle-version-computer-use")).toContainText("0.2.0");
  });
});
