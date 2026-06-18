import { render } from "solid-js/web";

import RpaPage from "../src/app/plugins/rpa/page";
import { initLocale } from "../src/i18n";
import { bootstrapTheme } from "../src/app/theme";
import "../src/app/index.css";

bootstrapTheme();
initLocale();

function RpaPermissionsE2EHarness() {
  return (
    <div data-testid="rpa-permissions-e2e-harness" class="min-h-screen bg-dls-bg">
      <RpaPage />
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("root not found");
render(() => <RpaPermissionsE2EHarness />, root);
