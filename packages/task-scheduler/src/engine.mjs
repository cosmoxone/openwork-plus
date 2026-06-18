import fs from "node:fs";
import path from "node:path";

/**
 * @param {import('./store.mjs').ScheduledTask} task
 * @param {string} dataDir
 */
async function executeTaskAction(task, dataDir) {
  if (task.actionKind === "test_db_record") {
    const dbPath =
      (task.actionPayload?.dbPath && String(task.actionPayload.dbPath)) ||
      path.join(dataDir, ".openwork", "test-results.json");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    /** @type {{ runs: Array<Record<string, unknown>> }} */
    let data = { runs: [] };
    if (fs.existsSync(dbPath)) {
      try {
        data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
      } catch {
        data = { runs: [] };
      }
    }
    if (!Array.isArray(data.runs)) data.runs = [];
    const runId = `sched-${Date.now()}`;
    data.runs.push({
      id: runId,
      trigger: "schedule",
      taskId: task.id,
      title: task.title,
      recordedAt: new Date().toISOString(),
      ...(task.actionPayload?.record && typeof task.actionPayload.record === "object"
        ? task.actionPayload.record
        : { passed: 0, failed: 0, framework: "scheduler-smoke" }),
    });
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
    return { status: "ok", output: `test_db_record ${dbPath} run=${runId}` };
  }

  if (task.actionKind === "shell" && task.actionPayload?.command) {
    const { execInWSL } = await import("../../sandbox-bootstrap/src/wsl-exec.mjs");
    const result = await execInWSL(String(task.actionPayload.command), {
      cwd: task.actionPayload.cwd ? String(task.actionPayload.cwd) : undefined,
    });
    return {
      status: result.ok ? "ok" : "error",
      output: result.stdout || result.stderr,
      error: result.ok ? undefined : result.stderr || `exit ${result.status}`,
    };
  }

  const msg = `fire task=${task.id} title=${task.title} prompt=${task.prompt.slice(0, 80)}`;
  return { status: "ok", output: msg };
}

/**
 * @param {import('./store.mjs').TaskSchedulerStore} store
 * @param {{ dataDir?: string, nowMs?: number, log?: (msg: string) => void }} [opts]
 */
export async function tickScheduler(store, opts = {}) {
  const log = opts.log ?? ((msg) => process.stderr.write(`${msg}\n`));
  const dataDir = opts.dataDir ?? process.env.OPENWORK_DATA_DIR ?? "";
  const due = await store.dueTasks(opts.nowMs ?? Date.now());
  /** @type {Array<{ taskId: string, status: string, runId?: string }>} */
  const fired = [];

  for (const task of due) {
    log(`[scheduler] trigger task=${task.id} cron=${task.cronExpr}`);
    try {
      const result = await executeTaskAction(task, dataDir);
      log(`[scheduler] fire task=${task.id} status=${result.status}`);
      const recorded = await store.recordRun(task.id, result);
      fired.push({ taskId: task.id, status: result.status, runId: recorded.runId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`[scheduler] fire task=${task.id} status=error error=${message}`);
      const recorded = await store.recordRun(task.id, { status: "error", error: message });
      fired.push({ taskId: task.id, status: "error", runId: recorded.runId });
    }
  }

  return { due: due.length, fired };
}
