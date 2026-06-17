#!/usr/bin/env node
import {
  captureScreenshot,
  getRpaStatus,
  listMcpLogs,
  listOperationHistory,
  listScreenshots,
  resolveDataDir,
  setAutomationEnabled,
} from "../src/index.mjs";

const args = process.argv.slice(2);
const cmd = args[0] ?? "status";
const json = args.includes("--json");
const dataDir = resolveDataDir(
  args.find((a, i) => args[i - 1] === "--data-dir") ?? process.env.OPENWORK_DATA_DIR,
);

/** @param {unknown} payload */
function out(payload) {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else console.log(typeof payload === "string" ? payload : JSON.stringify(payload));
}

try {
  if (cmd === "status") {
    out(getRpaStatus(dataDir));
  } else if (cmd === "screenshots") {
    out(listScreenshots(dataDir));
  } else if (cmd === "history") {
    out(listOperationHistory(dataDir));
  } else if (cmd === "logs") {
    out(listMcpLogs(dataDir));
  } else if (cmd === "capture") {
    const display = Number(args.find((a, i) => args[i - 1] === "--display") ?? "0");
    out(await captureScreenshot({ dataDir, displayIndex: display }));
  } else if (cmd === "automation") {
    const enabledArg = args.find((a, i) => args[i - 1] === "--enabled");
    if (enabledArg === undefined) {
      out(getRpaStatus(dataDir));
    } else {
      out(setAutomationEnabled(dataDir, enabledArg === "true" || enabledArg === "1"));
    }
  } else {
    console.error("用法: rpa-host <status|screenshots|history|logs|capture|automation> [--json] [--data-dir <dir>]");
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
