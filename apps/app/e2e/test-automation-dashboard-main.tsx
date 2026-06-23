import { render } from "solid-js/web";

import TestAutomationPage from "../src/app/plugins/test-automation/page";
import { ConnectionsProvider } from "../src/app/connections/provider";
import { initLocale } from "../src/i18n";
import { bootstrapTheme } from "../src/app/theme";
import "../src/app/index.css";

bootstrapTheme();
initLocale();

const mockConnectionsStore = {
  selectedWorkspaceRoot: () => "C:\\openwork-e2e-workspace",
  refreshMcpServers: async () => {},
} as never;

function TestAutomationDashboardE2EHarness() {
  return (
    <ConnectionsProvider store={mockConnectionsStore}>
      <div data-testid="test-automation-e2e-harness" class="min-h-screen bg-dls-bg">
        <TestAutomationPage />
      </div>
    </ConnectionsProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("root not found");
render(() => <TestAutomationDashboardE2EHarness />, root);
