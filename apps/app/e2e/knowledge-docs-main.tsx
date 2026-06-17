import { onMount } from "solid-js";
import { render } from "solid-js/web";

import DocsPage from "../src/app/plugins/docs/page";
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

function KnowledgeDocsE2EHarness() {
  onMount(() => {
    localStorage.removeItem("openwork-docs-v1");
  });

  return (
    <ConnectionsProvider store={mockConnectionsStore}>
      <div data-testid="knowledge-docs-e2e-harness" class="min-h-screen bg-dls-bg">
        <DocsPage />
      </div>
    </ConnectionsProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("root not found");
render(() => <KnowledgeDocsE2EHarness />, root);
