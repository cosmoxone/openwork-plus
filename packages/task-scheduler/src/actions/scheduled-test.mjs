import fs from "node:fs";
import path from "node:path";
import { TestDb } from "../../../test-db-mcp/src/store.mjs";
import { execSandboxCommand } from "../sandbox-exec.mjs";
import { sandboxExecPath } from "../wsl-path.mjs";

/** @param {string} s */
function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * @param {string} targetPath 沙箱内路径
 * @param {Record<string, unknown>} payload
 */
function buildPlaceholderCommand(targetPath, payload) {
  const body = JSON.stringify({
    framework: payload.framework ?? "scheduler-placeholder",
    path: payload.path ?? ".",
    passed: payload.passed ?? 1,
    failed: payload.failed ?? 0,
    skipped: payload.skipped ?? 0,
    cases: payload.cases ?? [{ name: "scheduled-smoke", status: "passed" }],
  });
  const dir = path.posix.dirname(targetPath.replace(/\\/g, "/"));
  return `mkdir -p ${shellQuote(dir)} && printf '%s\\n' ${shellQuote(body)} > ${shellQuote(targetPath)}`;
}

/** @param {string} text */
function parseJsonPayload(text) {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  if (start < 0) {
    throw new Error(`stdout 中无 JSON 对象: ${trimmed.slice(0, 120)}`);
  }
  return JSON.parse(trimmed.slice(start));
}

/**
 * P3-3：WSL/本地 bash 执行测试命令 → 读共享 JSON → ingest test_db。
 * @param {import('../store.mjs').ScheduledTask} task
 * @param {string} dataDir
 */
export async function executeScheduledTest(task, dataDir) {
  const payload = task.actionPayload ?? {};
  const dbPath = payload.dbPath ? String(payload.dbPath) : path.join(dataDir, "test-results.json");
  const hostOutputPath = path.resolve(
    payload.outputJson ? String(payload.outputJson) : path.join(dataDir, "schedule-last-run.json"),
  );
  const sandbox_id = payload.sandbox_id
    ? String(payload.sandbox_id)
    : process.platform === "win32"
      ? "wsl-default"
      : "local-bash";

  fs.mkdirSync(path.dirname(hostOutputPath), { recursive: true });
  if (fs.existsSync(hostOutputPath)) {
    fs.unlinkSync(hostOutputPath);
  }

  const execPath = sandboxExecPath(hostOutputPath, dataDir);
  const command = payload.command
    ? String(payload.command)
    : buildPlaceholderCommand(execPath, payload);

  const execResult = await execSandboxCommand(command, {
    cwd: payload.cwd ? String(payload.cwd) : undefined,
    distro: payload.distro ? String(payload.distro) : undefined,
    timeoutMs: payload.timeoutMs ? Number(payload.timeoutMs) : undefined,
  });

  if (!execResult.ok) {
    return {
      status: "error",
      output: execResult.stdout || execResult.stderr,
      error: execResult.stderr || `sandbox exit ${execResult.status}`,
    };
  }

  /** @type {Record<string, unknown>} */
  let runPayload;
  if (fs.existsSync(hostOutputPath)) {
    runPayload = JSON.parse(fs.readFileSync(hostOutputPath, "utf8"));
  } else if (execResult.stdout.trim()) {
    runPayload = parseJsonPayload(execResult.stdout);
  } else {
    throw new Error(`no test output at ${hostOutputPath}`);
  }

  const startedAt = new Date().toISOString();
  const db = new TestDb(dbPath);
  const row = await db.recordRun({
    ...runPayload,
    trigger: "schedule",
    taskId: task.id,
    title: task.title,
    sandbox_id,
    startedAt: runPayload.startedAt ?? startedAt,
    finishedAt: runPayload.finishedAt ?? new Date().toISOString(),
  });

  const failed = Number(row.failed ?? 0);
  return {
    status: failed > 0 ? "error" : "ok",
    output: JSON.stringify({
      runId: row.id,
      dbPath,
      sandbox_id,
      distro: execResult.distro,
      passed: row.passed,
      failed: row.failed,
    }),
    error: failed > 0 ? `${failed} test(s) failed` : undefined,
  };
}
