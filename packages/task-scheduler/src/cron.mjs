import { CronExpressionParser } from "cron-parser";

/**
 * @param {string} cronExpr
 * @param {number} [fromMs]
 * @returns {number} next run epoch ms
 */
export function nextRunAt(cronExpr, fromMs = Date.now()) {
  const expr = normalizeCron(cronExpr);
  const interval = CronExpressionParser.parse(expr, {
    currentDate: new Date(fromMs),
  });
  return interval.next().getTime();
}

/** @param {string} cronExpr */
export function normalizeCron(cronExpr) {
  const trimmed = String(cronExpr ?? "").trim();
  if (trimmed === "@every_minute") return "* * * * *";
  if (trimmed === "@hourly") return "0 * * * *";
  if (trimmed === "@daily") return "0 9 * * *";
  return trimmed;
}
