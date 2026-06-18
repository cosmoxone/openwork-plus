import { TestDb, defaultDbPath } from "../../test-db-mcp/src/store.mjs";

/**
 * P3-3 最小 test_summary：趋势 + 最近失败 + 运行计数。
 * @param {string} [dbPath]
 * @param {{ trendDays?: number, failureHours?: number }} [opts]
 */
export async function getTestSummary(dbPath, opts = {}) {
  const db = new TestDb(dbPath ?? defaultDbPath());
  const trendDays = opts.trendDays ?? 7;
  const failureHours = opts.failureHours ?? 24;
  const [trend, recentFailures, recentRuns] = await Promise.all([
    db.getTrend(trendDays),
    db.listFailures({ sinceHours: failureHours, limit: 10 }),
    db.listRuns(20),
  ]);
  const scheduledRuns = recentRuns.filter((r) => r.trigger === "schedule");
  return {
    db: db.file,
    trendDays,
    trend,
    recentFailureCount: recentFailures.length,
    recentFailures: recentFailures.map((r) => ({
      id: r.id,
      framework: r.framework,
      failed: r.failed,
      startedAt: r.startedAt,
      trigger: r.trigger,
      sandbox_id: r.sandbox_id,
    })),
    totalRuns: recentRuns.length,
    scheduledRunCount: scheduledRuns.length,
    lastScheduledRun: scheduledRuns[0] ?? null,
  };
}
