import type { Page } from "@playwright/test";

/** Skip OpenWork Models startup promo until A3-04 adds a formal E2E hook. */
export async function seedE2eLocalStorage(target: Page) {
  await target.addInitScript(() => {
    try {
      localStorage.setItem("openwork.openworkModelsPromo.hidden", "1");
      localStorage.setItem("openwork.openworkModelsPromo.startupShown", String(Date.now()));
    } catch {
      // ignore
    }
  });
}
