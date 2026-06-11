// 统一计量层。
// 默认 JSON 文件后端（零依赖、可即用、便于测试）；生产可切换 SQLite(better-sqlite3)。
// 后端通过统一接口隔离，业务代码不感知存储实现。

import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

/**
 * @typedef {Object} UsageEvent
 * @property {string} sessionId
 * @property {string} model
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} [cacheTokens]
 * @property {number} [costUsd]
 * @property {string} [deviceId]
 * @property {string} [ts]
 */

function defaultDataDir() {
  if (process.env.OPENWORK_DATA_DIR) return path.resolve(process.env.OPENWORK_DATA_DIR);
  const home = os.homedir();
  return process.platform === "win32"
    ? path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "openwork")
    : path.join(home, ".openwork");
}

/** JSON 文件后端：单文件存 usage_events + wallet_ledger。 */
class JsonBackend {
  /** @param {string} file */
  constructor(file) {
    this.file = file;
    /** @type {{usage:any[], ledger:any[]}} */
    this.data = { usage: [], ledger: [] };
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    if (existsSync(this.file)) {
      try {
        this.data = JSON.parse(await readFile(this.file, "utf8"));
      } catch {
        this.data = { usage: [], ledger: [] };
      }
    }
    if (!this.data.usage) this.data.usage = [];
    if (!this.data.ledger) this.data.ledger = [];
    this.loaded = true;
  }

  async flush() {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), "utf8");
    await rename(tmp, this.file);
  }
}

export class MeteringStore {
  /** @param {{dataDir?:string, file?:string}} [opts] */
  constructor(opts = {}) {
    const dataDir = opts.dataDir ? path.resolve(opts.dataDir) : defaultDataDir();
    const file = opts.file ?? path.join(dataDir, "metering.json");
    this.backend = new JsonBackend(file);
  }

  /**
   * 记录一次用量，并按 cost 记入钱包流水（usage 为负）。
   * @param {UsageEvent} ev
   */
  async recordUsage(ev) {
    await this.backend.load();
    const ts = ev.ts ?? new Date().toISOString();
    const row = {
      sessionId: ev.sessionId,
      model: ev.model,
      inputTokens: ev.inputTokens ?? 0,
      outputTokens: ev.outputTokens ?? 0,
      cacheTokens: ev.cacheTokens ?? 0,
      costUsd: ev.costUsd ?? 0,
      deviceId: ev.deviceId ?? null,
      ts,
    };
    this.backend.data.usage.push(row);
    if (row.costUsd > 0) {
      this.backend.data.ledger.push({
        kind: "usage",
        amountUsd: -row.costUsd,
        deviceId: row.deviceId,
        ref: row.sessionId,
        ts,
      });
    }
    await this.backend.flush();
    return row;
  }

  /** 充值。@param {{amountUsd:number, deviceId?:string, ref?:string}} t */
  async topUp(t) {
    await this.backend.load();
    const entry = {
      kind: "topup",
      amountUsd: t.amountUsd,
      deviceId: t.deviceId ?? null,
      ref: t.ref ?? null,
      ts: new Date().toISOString(),
    };
    this.backend.data.ledger.push(entry);
    await this.backend.flush();
    return entry;
  }

  /** 余额 = 钱包流水累加（可按 deviceId 过滤）。 */
  async balance(deviceId) {
    await this.backend.load();
    return this.backend.data.ledger
      .filter((e) => (deviceId ? e.deviceId === deviceId : true))
      .reduce((sum, e) => sum + e.amountUsd, 0);
  }

  /** @param {{sinceTs?:string, limit?:number}} [q] */
  async listUsage(q = {}) {
    await this.backend.load();
    let rows = this.backend.data.usage;
    if (q.sinceTs) rows = rows.filter((r) => r.ts >= q.sinceTs);
    rows = rows.slice().sort((a, b) => (a.ts < b.ts ? 1 : -1));
    return q.limit ? rows.slice(0, q.limit) : rows;
  }

  /**
   * 聚合用量。
   * @param {{groupBy:"model"|"day", sinceTs?:string}} q
   */
  async aggregate(q) {
    await this.backend.load();
    let rows = this.backend.data.usage;
    if (q.sinceTs) rows = rows.filter((r) => r.ts >= q.sinceTs);
    /** @type {Record<string,{inputTokens:number,outputTokens:number,costUsd:number,count:number}>} */
    const out = {};
    for (const r of rows) {
      const key = q.groupBy === "day" ? r.ts.slice(0, 10) : r.model;
      const bucket = (out[key] ??= { inputTokens: 0, outputTokens: 0, costUsd: 0, count: 0 });
      bucket.inputTokens += r.inputTokens;
      bucket.outputTokens += r.outputTokens;
      bucket.costUsd += r.costUsd;
      bucket.count += 1;
    }
    return out;
  }
}
