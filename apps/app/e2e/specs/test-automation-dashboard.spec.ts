import { expect, test } from "@playwright/test";

test.describe("test-automation dashboard", () => {
  test("shows dashboard heading and trend section", async ({ page }) => {
    await page.goto("/test-automation-dashboard.html");
    await expect(page.getByTestId("test-automation-e2e-harness")).toBeVisible();
    await expect(page.getByRole("heading", { name: "测试自动化控制台", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "7 日通过 / 失败趋势", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "最近运行", level: 2 })).toBeVisible();
    await expect(
      page.getByText("桌面端打开工作区后可加载 test-db 历史与趋势图。"),
    ).toBeVisible();
  });
});
