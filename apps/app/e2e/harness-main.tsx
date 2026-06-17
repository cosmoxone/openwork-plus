import { onMount } from "solid-js";
import { render } from "solid-js/web";

import BundlesView from "../src/app/pages/bundles";
import { ConnectionsProvider } from "../src/app/connections/provider";
import { e2eResetIndustryBundles } from "../src/app/industry-bundles/e2e-api";
import { initLocale } from "../src/i18n";
import { bootstrapTheme } from "../src/app/theme";
import "../src/app/index.css";

bootstrapTheme();
initLocale();

const mockConnectionsStore = {
  refreshMcpServers: async () => {},
} as never;

function IndustryBundlesE2EHarness() {
  onMount(() => {
    e2eResetIndustryBundles();
  });

  return (
    <ConnectionsProvider store={mockConnectionsStore}>
      <div data-testid="industry-bundles-e2e-harness" class="min-h-screen bg-dls-bg p-6">
        <BundlesView selectedWorkspaceRoot="C:\\openwork-e2e-workspace" showHeader />
      </div>
    </ConnectionsProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("root not found");
render(() => <IndustryBundlesE2EHarness />, root);
