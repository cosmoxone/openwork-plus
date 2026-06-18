#!/usr/bin/env node
import { TaskSchedulerStore, tickScheduler, resolveDataDir } from "../src/index.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const cmd = args[0];

function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const dataDir = resolveDataDir(arg("--data-dir") ?? process.env.OPENWORK_DATA_DIR);
const store = new TaskSchedulerStore({ dataDir });

/** @param {unknown} payload */
function out(payload) {
  if (json) console.log(JSON.stringify(payload, null, 2));
  else if (typeof payload === "string") console.log(payload);
  else console.log(JSON.stringify(payload, null, 2));
}

try {
  if (cmd === "add") {
    const title = arg("--title");
    const cron = arg("--cron");
    if (!title || !cron) {
      console.error("用法: openwork-schedule add --title <t> --cron <expr> [--prompt p] [--cwd dir] [--action log|test_db_record|shell]");
      process.exit(1);
    }
    const actionKind = arg("--action") ?? "log";
    /** @type {Record<string, unknown>|undefined} */
    let actionPayload;
    if (actionKind === "test_db_record") {
      actionPayload = { dbPath: arg("--db") };
    } else if (actionKind === "shell") {
      actionPayload = { command: arg("--command") ?? "echo ok" };
    }
    out(
      await store.add({
        title,
        cronExpr: cron,
        prompt: arg("--prompt") ?? "",
        cwd: arg("--cwd"),
        actionKind,
        actionPayload,
        nextRunAt: arg("--next-run-at") ? Number(arg("--next-run-at")) : undefined,
      }),
    );
  } else if (cmd === "list") {
    out(await store.list());
  } else if (cmd === "remove") {
    const id = arg("--id");
    if (!id) {
      console.error("用法: openwork-schedule remove --id <uuid>");
      process.exit(1);
    }
    if (!(await store.remove(id))) {
      console.error(`task not found: ${id}`);
      process.exit(1);
    }
    out({ removed: id });
  } else if (cmd === "tick") {
    out(await tickScheduler(store, { dataDir }));
  } else if (cmd === "runs") {
    const id = arg("--id");
    if (!id) {
      console.error("用法: openwork-schedule runs --id <uuid>");
      process.exit(1);
    }
    out(await store.listRuns(id));
  } else {
    console.error(`用法:
  openwork-schedule add --title <t> --cron <expr> [--prompt p] [--action log|test_db_record|shell]
  openwork-schedule list [--json]
  openwork-schedule remove --id <uuid>
  openwork-schedule tick [--json]
  openwork-schedule runs --id <uuid> [--json]
  [--data-dir <dir>]`);
    process.exit(1);
  }
} finally {
  store.close();
}
