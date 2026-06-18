// @openwork/test-db-mcp 共享的 JSON 测试结果存储（与 test-runner --record 同格式）。
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

export function defaultDbPath(override) {
  if (override) return path.resolve(override);
  if (process.env.OPENWORK_TEST_DB) return path.resolve(process.env.OPENWORK_TEST_DB);
  const home = os.homedir();
  return process.platform === "win32"
    ? path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "openwork", "test-results.json")
    : path.join(home, ".openwork", "test-results.json");
}

export class TestDb {
  /** @param {string} file */
  constructor(file) {
    this.file = file;
    /** @type {{runs:any[]}} */
    this.data = { runs: [] };
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    if (existsSync(this.file)) {
      try {
        this.data = JSON.parse(await readFile(this.file, "utf8"));
      } catch {
        this.data = { runs: [] };
      }
    }
    if (!this.data.runs) this.data.runs = [];
    this.loaded = true;
  }

  async flush() {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), "utf8");
    await rename(tmp, this.file);
  }

  /** @param {any} run */
  async recordRun(run) {
    await this.load();
    const row = {
      id: run.id ?? `run-${Date.now()}`,
      framework: run.framework ?? "unknown",
      path: run.path ?? ".",
      startedAt: run.startedAt ?? new Date().toISOString(),
      finishedAt: run.finishedAt ?? new Date().toISOString(),
      passed: run.passed ?? 0,
      failed: run.failed ?? 0,
      skipped: run.skipped ?? 0,
      cases: run.cases ?? [],
      coverage: run.coverage ?? null,
    };
    if (run.trigger) row.trigger = run.trigger;
    if (run.taskId) row.taskId = run.taskId;
    if (run.sandbox_id) row.sandbox_id = run.sandbox_id;
    if (run.title) row.title = run.title;
    this.data.runs.push(row);
    await this.flush();
    return row;
  }

  /** @param {{sinceHours?:number, limit?:number}} [opts] */
  async listFailures(opts = {}) {
    await this.load();
    const sinceMs = (opts.sinceHours ?? 24) * 3600 * 1000;
    const cutoff = Date.now() - sinceMs;
    const limit = opts.limit ?? 50;
    /** @type {any[]} */
    const out = [];
    for (let i = this.data.runs.length - 1; i >= 0 && out.length < limit; i--) {
      const r = this.data.runs[i];
      const t = Date.parse(r.startedAt);
      if (Number.isNaN(t) || t < cutoff) continue;
      if (r.failed > 0) {
        out.push({
          ...r,
          cases: (r.cases ?? []).filter((c) => c.status === "failed"),
        });
      }
    }
    return out;
  }

  /** @param {number} [days] */
  async getTrend(days = 7) {
    await this.load();
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    /** @type {Record<string,{passed:number,failed:number,runs:number}>} */
    const buckets = {};
    for (const r of this.data.runs) {
      const t = Date.parse(r.startedAt);
      if (Number.isNaN(t) || t < cutoff) continue;
      const day = r.startedAt.slice(0, 10);
      if (!buckets[day]) buckets[day] = { passed: 0, failed: 0, runs: 0 };
      buckets[day].passed += r.passed ?? 0;
      buckets[day].failed += r.failed ?? 0;
      buckets[day].runs += 1;
    }
    return Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day, ...v }));
  }

  async listRuns(limit = 20) {
    await this.load();
    return this.data.runs.slice(-limit).reverse();
  }
}
