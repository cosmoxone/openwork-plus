import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import { nextRunAt, normalizeCron } from "./cron.mjs";
import { schedulerDbPath } from "./paths.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaSql = fs.readFileSync(path.join(here, "..", "schema.sql"), "utf8");

/** @param {import('sql.js').Database} db @param {string} dbFile */
function persist(db, dbFile) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const data = db.export();
  fs.writeFileSync(dbFile, Buffer.from(data));
}

/** @param {import('sql.js').Database} db @param {import('sql.js').Statement} stmt @param {unknown[]} params */
function getRow(db, stmt, params = []) {
  stmt.bind(params);
  if (!stmt.step()) {
    stmt.reset();
    return null;
  }
  const row = stmt.getAsObject();
  stmt.reset();
  return row;
}

/** @param {import('sql.js').Database} db @param {import('sql.js').Statement} stmt @param {unknown[]} params */
function allRows(db, stmt, params = []) {
  stmt.bind(params);
  /** @type {Record<string, unknown>[]} */
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.reset();
  return rows;
}

/** @param {Record<string, unknown>} row */
function mapTask(row) {
  if (!row || !row.id) return null;
  return {
    id: String(row.id),
    title: String(row.title),
    prompt: String(row.prompt ?? ""),
    cwd: row.cwd ? String(row.cwd) : null,
    cronExpr: String(row.cron_expr),
    enabled: Number(row.enabled) === 1,
    nextRunAt: Number(row.next_run_at),
    lastRunAt: row.last_run_at != null ? Number(row.last_run_at) : null,
    lastRunStatus: row.last_run_status ? String(row.last_run_status) : null,
    lastError: row.last_error ? String(row.last_error) : null,
    actionKind: String(row.action_kind ?? "log"),
    actionPayload: row.action_payload ? JSON.parse(String(row.action_payload)) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class TaskSchedulerStore {
  /** @param {{ dataDir?: string, dbPath?: string }} [opts] */
  constructor(opts = {}) {
    this.dbFile = opts.dbPath ?? schedulerDbPath(opts.dataDir);
    /** @type {import('sql.js').Database | null} */
    this.db = null;
    /** @type {Promise<void> | null} */
    this.ready = null;
  }

  async init() {
    if (this.db) return;
    if (!this.ready) {
      this.ready = (async () => {
        const SQL = await initSqlJs({
          locateFile: (file) =>
            path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "sql.js", "dist", file),
        });
        if (fs.existsSync(this.dbFile)) {
          this.db = new SQL.Database(fs.readFileSync(this.dbFile));
        } else {
          this.db = new SQL.Database();
        }
        this.db.run(schemaSql);
        persist(this.db, this.dbFile);
      })();
    }
    await this.ready;
  }

  /** @private */
  save() {
    if (!this.db) throw new Error("store not initialized");
    persist(this.db, this.dbFile);
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
    this.ready = null;
  }

  /**
   * @param {{
   *   title: string,
   *   cronExpr: string,
   *   prompt?: string,
   *   cwd?: string,
   *   enabled?: boolean,
   *   actionKind?: string,
   *   actionPayload?: Record<string, unknown>,
   *   nextRunAt?: number,
   * }} input
   */
  async add(input) {
    await this.init();
    const db = /** @type {import('sql.js').Database} */ (this.db);
    const now = Date.now();
    const id = randomUUID();
    const cronExpr = normalizeCron(input.cronExpr);
    const next = input.nextRunAt ?? nextRunAt(cronExpr, now);
    const enabled = input.enabled === false ? 0 : 1;
    db.run(
      `INSERT INTO scheduled_tasks (
        id, title, prompt, cwd, cron_expr, enabled, next_run_at,
        action_kind, action_payload, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.title,
        input.prompt ?? "",
        input.cwd ?? null,
        cronExpr,
        enabled,
        next,
        input.actionKind ?? "log",
        input.actionPayload ? JSON.stringify(input.actionPayload) : null,
        now,
        now,
      ],
    );
    this.save();
    return this.get(id);
  }

  /** @param {string} id */
  async get(id) {
    await this.init();
    const db = /** @type {import('sql.js').Database} */ (this.db);
    const stmt = db.prepare("SELECT * FROM scheduled_tasks WHERE id = ?");
    return mapTask(getRow(db, stmt, [id]));
  }

  /** @returns {Promise<import('./store.mjs').ScheduledTask[]>} */
  async list() {
    await this.init();
    const db = /** @type {import('sql.js').Database} */ (this.db);
    const stmt = db.prepare("SELECT * FROM scheduled_tasks ORDER BY title COLLATE NOCASE");
    return allRows(db, stmt).map((r) => mapTask(r)).filter(Boolean);
  }

  /** @param {string} id */
  async remove(id) {
    await this.init();
    const existing = await this.get(id);
    if (!existing) return false;
    const db = /** @type {import('sql.js').Database} */ (this.db);
    db.run("DELETE FROM scheduled_tasks WHERE id = ?", [id]);
    this.save();
    return true;
  }

  /** @param {number} [nowMs] */
  async dueTasks(nowMs = Date.now()) {
    await this.init();
    const db = /** @type {import('sql.js').Database} */ (this.db);
    const stmt = db.prepare(
      `SELECT * FROM scheduled_tasks
       WHERE enabled = 1 AND next_run_at <= ?
       ORDER BY next_run_at ASC`,
    );
    return allRows(db, stmt, [nowMs]).map((r) => mapTask(r)).filter(Boolean);
  }

  /**
   * @param {string} taskId
   * @param {{ status: string, output?: string, error?: string, firedAt?: number }} result
   */
  async recordRun(taskId, result) {
    await this.init();
    const task = await this.get(taskId);
    if (!task) throw new Error(`task not found: ${taskId}`);
    const firedAt = result.firedAt ?? Date.now();
    const runId = randomUUID();
    const db = /** @type {import('sql.js').Database} */ (this.db);
    db.run(
      `INSERT INTO schedule_runs (id, task_id, fired_at, status, trigger, output)
       VALUES (?, ?, ?, ?, 'schedule', ?)`,
      [runId, taskId, firedAt, result.status, result.output ?? result.error ?? null],
    );
    const next = nextRunAt(task.cronExpr, firedAt + 1000);
    db.run(
      `UPDATE scheduled_tasks SET
        last_run_at = ?,
        last_run_status = ?,
        last_error = ?,
        next_run_at = ?,
        updated_at = ?
       WHERE id = ?`,
      [firedAt, result.status, result.error ?? null, next, Date.now(), taskId],
    );
    this.save();
    return { runId, nextRunAt: next };
  }

  /** @param {string} taskId @param {number} [limit] */
  async listRuns(taskId, limit = 20) {
    await this.init();
    const db = /** @type {import('sql.js').Database} */ (this.db);
    const stmt = db.prepare(
      `SELECT * FROM schedule_runs WHERE task_id = ?
       ORDER BY fired_at DESC LIMIT ?`,
    );
    return allRows(db, stmt, [taskId, limit]).map((row) => ({
      id: String(row.id),
      taskId: String(row.task_id),
      firedAt: Number(row.fired_at),
      status: String(row.status),
      trigger: String(row.trigger),
      output: row.output ? String(row.output) : null,
    }));
  }
}
