-- test-db 生产 schema（Sprint 1 默认 JSON 后端；后续可切换 SQLite）
CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  framework TEXT NOT NULL,
  path TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  cases_json TEXT,
  coverage_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_test_runs_started ON test_runs(started_at);
