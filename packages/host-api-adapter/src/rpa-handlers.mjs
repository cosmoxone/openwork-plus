/**
 * 场景 E：RPA Host API 处理器（供 HTTP / JSON-RPC 共用）。
 */
import {
  captureScreenshot,
  getRpaStatus,
  listMcpLogs,
  listOperationHistory,
  listScreenshots,
  setAutomationEnabled,
} from "../../rpa-host/src/index.mjs";

/** @type {Record<string, (params: any) => Promise<unknown>>} */
export const RPA_HANDLERS = {
  "rpa/status": async (params) => getRpaStatus(params?.dataDir),
  "rpa/screenshots/list": async (params) =>
    listScreenshots(params?.dataDir, params?.limit ?? 20),
  "rpa/history/list": async (params) =>
    listOperationHistory(params?.dataDir, params?.limit ?? 50),
  "rpa/logs/list": async (params) => listMcpLogs(params?.dataDir, params?.limit ?? 10),
  "rpa/screenshot/capture": async (params) =>
    captureScreenshot({
      dataDir: params?.dataDir,
      displayIndex: params?.displayIndex,
      monorepoRoot: params?.monorepoRoot ?? process.env.OPENWORK_MONOREPO_ROOT,
    }),
  "rpa/automation/set": async (params) => {
    if (typeof params?.enabled !== "boolean") {
      throw new Error("enabled (boolean) required");
    }
    return setAutomationEnabled(params?.dataDir, params.enabled);
  },
};

/**
 * @param {string} method
 * @param {unknown} params
 */
export async function dispatchRpaMethod(method, params) {
  const handler = RPA_HANDLERS[method];
  if (!handler) return null;
  return handler(params ?? {});
}
