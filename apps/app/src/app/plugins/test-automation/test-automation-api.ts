import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../utils";

export type TestRunRow = {
  id: string;
  framework: string;
  passed: number;
  failed: number;
  skipped: number;
  startedAt?: string;
  finishedAt?: string;
};

export type TestTrendPoint = {
  day: string;
  passed: number;
  failed: number;
  runs: number;
};

export type TestAutomationDashboard = {
  ok: boolean;
  dbPath: string;
  runs: TestRunRow[];
  trend: TestTrendPoint[];
};

export async function fetchTestAutomationDashboard(
  workspacePath: string,
): Promise<TestAutomationDashboard | null> {
  if (!workspacePath.trim() || !isTauriRuntime()) return null;
  return invoke<TestAutomationDashboard>("test_automation_read_dashboard", { workspacePath });
}
