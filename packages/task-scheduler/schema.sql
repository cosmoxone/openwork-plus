-- P3-2：持久化定时任务（SQLite）
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  cwd TEXT,
  cron_expr TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER NOT NULL,
  last_run_at INTEGER,
  last_run_status TEXT,
  last_error TEXT,
  action_kind TEXT NOT NULL DEFAULT 'log',
  action_payload TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run
  ON scheduled_tasks (enabled, next_run_at);

CREATE TABLE IF NOT EXISTS schedule_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  fired_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'schedule',
  output TEXT,
  FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_runs_task
  ON schedule_runs (task_id, fired_at DESC);
