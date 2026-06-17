#!/usr/bin/env node
import { bootstrap, readBootstrapState, resolveDataDir } from "../src/index.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const force = args.includes("--force");
const statusOnly = args.includes("--status");

const dataDir = resolveDataDir(
  args.find((a, i) => args[i - 1] === "--data-dir") ?? process.env.OPENWORK_DATA_DIR,
);

if (statusOnly) {
  const state = readBootstrapState(dataDir);
  if (json) console.log(JSON.stringify(state ?? { mode: "unknown" }, null, 2));
  else console.log(state ? `mode=${state.mode}` : "not bootstrapped");
  process.exit(0);
}

const result = await bootstrap({
  dataDir,
  force,
  onProgress: (p) => {
    if (!json) console.error(`[${p.phase}] ${p.message}${p.detail ? ` — ${p.detail}` : ""}`);
  },
});

if (json) console.log(JSON.stringify(result, null, 2));
else console.log(`sandbox-bootstrap: mode=${result.mode}`);
process.exit(result.error ? 0 : 0);
