import { expect, test } from "@playwright/test";

test.describe("RPA permission guide", () => {
  test("shows permission guide on RPA plugin page", async ({ page }) => {
    await page.goto("/rpa-permissions.html");
    await expect(page.getByTestId("rpa-permissions-e2e-harness")).toBeVisible();
    const guide = page.getByTestId("rpa-permission-guide");
    await expect(guide).toBeVisible();
    await expect(guide.getByRole("heading", { name: "系统权限引导" })).toBeVisible();
    await expect(guide.getByText(/screenshot/i)).toBeVisible();
  });
});
