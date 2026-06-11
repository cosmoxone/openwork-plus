-- 统一计量层 SQLite schema（生产后端，WAL 模式）。
-- 与 JSON 后端字段一致；切换后端不改业务代码。
-- 参考 Codex 桌面版用 SQLite(WAL) 承载会话/日志/用量的范式。

PRAGMA journal_mode = WAL;

-- 用量事件：每次产生 Token/资源消耗的轮次落一条（来自 App-Server 契约 event/notify usage）。
CREATE TABLE IF NOT EXISTS usage_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT    NOT NULL,
  model         TEXT    NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL    NOT NULL DEFAULT 0,
  device_id     TEXT,
  ts            TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_events(ts);
CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_events(model);
CREATE INDEX IF NOT EXISTS idx_usage_device ON usage_events(device_id);

-- 钱包流水：充值(topup, 正)与消耗(usage, 负)统一记账，余额 = SUM(amount_usd)。
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN ('topup','usage','adjust')),
  amount_usd  REAL    NOT NULL,
  device_id   TEXT,
  ref         TEXT,
  ts          TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_device ON wallet_ledger(device_id);
