import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../utils";

export type RpaStatus = {
  dataDir: string;
  sandboxMode: string;
  sandboxBootstrapped: boolean;
  automationEnabled: boolean;
  automationUpdatedAt: string | null;
  screenshotCount: number;
  platform: string;
};

export type ScreenshotEntry = {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
};

export type OperationEntry = {
  appName: string;
  index: number;
  x: number;
  y: number;
  operation: string;
  timestamp: number;
  count: number;
};

export type CaptureResult = {
  path: string;
  displayIndex: number;
  summary: string;
};

const RPA_HTTP_BASE = "http://127.0.0.1:13210";

async function httpGet<T>(path: string): Promise<T> {
  const res = await fetch(`${RPA_HTTP_BASE}${path}`);
  if (!res.ok) throw new Error(await res.text());
  const body = await res.json();
  return body.result as T;
}

async function httpPost<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${RPA_HTTP_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  if (!res.ok) throw new Error(await res.text());
  const body = await res.json();
  return body.result as T;
}

export async function fetchRpaStatus(): Promise<RpaStatus> {
  if (isTauriRuntime()) {
    return invoke<RpaStatus>("rpa_status");
  }
  return httpGet<RpaStatus>("/api/rpa/status");
}

export async function fetchScreenshots(): Promise<ScreenshotEntry[]> {
  if (isTauriRuntime()) {
    return invoke<ScreenshotEntry[]>("rpa_list_screenshots");
  }
  return httpGet<ScreenshotEntry[]>("/api/rpa/screenshots");
}

export type GuiOperationLogEntry = {
  ts: string;
  tool: string;
  appName?: string;
  operation?: string;
  x?: number;
  y?: number;
  xNormalized?: number;
  yNormalized?: number;
  displayIndex?: number;
  meta?: Record<string, unknown>;
};

export async function fetchGuiOperationLogs(): Promise<GuiOperationLogEntry[]> {
  if (isTauriRuntime()) {
    return invoke<GuiOperationLogEntry[]>("rpa_list_gui_operation_logs");
  }
  return httpGet<GuiOperationLogEntry[]>("/api/rpa/ndjson");
}

export async function fetchOperationHistory(): Promise<OperationEntry[]> {
  if (isTauriRuntime()) {
    return invoke<OperationEntry[]>("rpa_list_operations");
  }
  return httpGet<OperationEntry[]>("/api/rpa/history");
}

export async function captureScreenshot(displayIndex = 0): Promise<CaptureResult> {
  if (isTauriRuntime()) {
    return invoke<CaptureResult>("rpa_capture_screenshot", { displayIndex });
  }
  return httpPost<CaptureResult>("/api/rpa/capture", { displayIndex });
}

export async function setAutomationEnabled(enabled: boolean): Promise<{ enabled: boolean; updatedAt: string }> {
  if (isTauriRuntime()) {
    return invoke("rpa_set_automation_enabled", { enabled });
  }
  return httpPost("/api/rpa/automation", { enabled });
}

export function screenshotSrc(filePath: string): string {
  if (isTauriRuntime()) {
    return convertFileSrc(filePath);
  }
  return `file://${filePath}`;
}
