import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Page } from "@playwright/test";

export type WorkspaceFixture = {
  workspaceId: string;
  workspaceDir: string;
};

declare global {
  interface Window {
    __OPENWORK_ELECTRON__?: {
      invokeDesktop?: (
        command: string,
        ...args: unknown[]
      ) => Promise<{
        workspaces?: Array<{ id?: string; path?: string }>;
        activeId?: string | null;
      }>;
    };
  }
}

async function waitForDesktopBridge(page: Page) {
  await page.waitForFunction(
    () => Boolean(window.__OPENWORK_ELECTRON__?.invokeDesktop),
    undefined,
    { timeout: 60_000 },
  );
}

/** Create a local workspace via real desktop IPC (A3-02). */
export async function ensureLocalWorkspaceFixture(
  page: Page,
  fixtureRoot: string,
  name = "E2E Bundles",
): Promise<WorkspaceFixture> {
  await waitForDesktopBridge(page);

  const workspaceDir = mkdtempSync(path.join(fixtureRoot, "workspace-"));

  const fixture = await page.evaluate(
    async ({ dir, workspaceName }) => {
      const invoke = window.__OPENWORK_ELECTRON__?.invokeDesktop;
      if (!invoke) {
        throw new Error("invokeDesktop unavailable");
      }

      await invoke("workspaceCreate", { folderPath: dir, name: workspaceName, preset: "starter" });
      const state = await invoke("workspaceBootstrap");
      const workspace = (state.workspaces ?? []).find((entry) => entry.path === dir);
      if (!workspace?.id) {
        throw new Error("workspaceCreate did not register the workspace");
      }

      await invoke("workspaceSetSelected", workspace.id);
      await invoke("workspaceSetRuntimeActive", workspace.id);

      try {
        localStorage.setItem("openwork.react.activeWorkspace", workspace.id);
      } catch {
        // ignore
      }

      return { workspaceId: workspace.id, workspaceDir: dir };
    },
    { dir: workspaceDir, workspaceName: name },
  );

  return fixture;
}
