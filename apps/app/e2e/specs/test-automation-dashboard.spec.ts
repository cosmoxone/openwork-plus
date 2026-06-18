import { expect, test } from "@playwright/test";

test.describe("test-automation dashboard", () => {
  test("shows dashboard heading and trend section", async ({ page }) => {
    await page.goto("/#/plugins/test-automation");
    await expect(page.getByRole("heading", { name: "测试自动化控制台" })).toBeVisible();
    await expect(page.getByText("7 日通过 / 失败趋势")).toBeVisible();
    await expect(page.getByText("最近运行")).toBeVisible();
  });
});
