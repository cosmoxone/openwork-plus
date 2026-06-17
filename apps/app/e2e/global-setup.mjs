import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(new URL(".", import.meta.url)));
const repoRoot = path.resolve(appDir, "../..");
const fixture = path.join(appDir, "public/e2e/catalog.builtin.json");
const hubPort = process.env.BUNDLE_HUB_DEV_PORT ?? "9123";

function runSync(script) {
  const res = spawnSync(process.execPath, [path.join(repoRoot, script)], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (res.status !== 0) throw new Error(`setup failed: ${script}`);
}

async function hubReady() {
  try {
    const res = await fetch(`http://127.0.0.1:${hubPort}/catalog.json`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  if (!existsSync(fixture)) {
    runSync("scripts/build-builtin-bundles.mjs");
    runSync("scripts/copy-e2e-bundle-fixtures.mjs");
  }
  runSync("scripts/prepare-bundle-hub-dev.mjs");

  if (!(await hubReady())) {
    const child = spawn(process.execPath, [path.join(repoRoot, "scripts/bundle-hub-dev-server.mjs")], {
      cwd: repoRoot,
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    for (let i = 0; i < 30; i++) {
      if (await hubReady()) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Bundle Hub dev server did not become ready");
  }
}
