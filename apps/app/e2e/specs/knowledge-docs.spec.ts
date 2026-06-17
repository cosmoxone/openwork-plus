import { expect, test } from "@playwright/test";

test.describe("Knowledge Docs UI (browser E2E)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/knowledge-docs.html");
    await expect(page.getByTestId("knowledge-docs-e2e-harness")).toBeVisible();
    await expect(page.getByTestId("docs-knowledge-page")).toBeVisible();
  });

  test("shows all knowledge tabs", async ({ page }) => {
    await expect(page.getByTestId("docs-tab-scan")).toBeVisible();
    await expect(page.getByTestId("docs-tab-wiki")).toBeVisible();
    await expect(page.getByTestId("docs-tab-query")).toBeVisible();
    await expect(page.getByTestId("docs-tab-health")).toBeVisible();
    await expect(page.getByTestId("docs-tab-edit")).toBeVisible();
  });

  test("scan tab surfaces desktop-only guard in browser harness", async ({ page }) => {
    await page.getByTestId("docs-tab-scan").click();
    await page.getByTestId("docs-scan-workspace").click();
    await expect(page.getByTestId("docs-knowledge-error")).toBeVisible();
  });

  test("local notes tab saves a note without Tauri", async ({ page }) => {
    await page.getByTestId("docs-tab-edit").click();
    await page.getByTestId("docs-note-new").click();
    await page.getByTestId("docs-note-title").fill("E2E Note");
    await page.getByTestId("docs-note-save").click();
    await expect(page.getByRole("button", { name: "E2E Note" })).toBeVisible();
  });

  test("health tab shows lint controls", async ({ page }) => {
    await page.getByTestId("docs-tab-health").click();
    await expect(page.getByTestId("docs-lint-run")).toBeVisible();
    await expect(page.getByTestId("docs-export-snapshot")).toBeVisible();
  });
});
