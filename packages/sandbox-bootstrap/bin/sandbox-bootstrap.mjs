#!/usr/bin/env node
import { bootstrap, execInWSL, readBootstrapState, resolveDataDir } from "../src/index.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const force = args.includes("--force");
const statusOnly = args.includes("--status");
const cmd = args[0];

const dataDir = resolveDataDir(
  args.find((a, i) => args[i - 1] === "--data-dir") ?? process.env.OPENWORK_DATA_DIR,
);

if (cmd === "exec") {
  const sep = args.indexOf("--");
  const command = sep >= 0 ? args.slice(sep + 1).join(" ") : args.slice(1).join(" ");
  if (!command.trim()) {
    console.error("用法: sandbox-bootstrap exec [--data-dir <dir>] -- <shell-command>");
    process.exit(1);
  }
  try {
    const result = await execInWSL(command, { timeoutMs: 120_000 });
    if (!json) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    process.exit(result.status);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (statusOnly || !cmd || cmd === "bootstrap") {
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
}

console.error("用法: sandbox-bootstrap [bootstrap] [--status] [--force] [--json] [--data-dir <dir>]");
console.error("      sandbox-bootstrap exec [--json] [--data-dir <dir>] -- <shell-command>");
process.exit(1);
