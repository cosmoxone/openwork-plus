/**
 * App-Server 契约运行时导出（Node 可直接 import，无需 TS 编译）。
 * 类型定义见 index.ts；修改常量时请同步两处。
 */

export const CONTRACT_VERSION = 1;

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  Unauthorized: -32001,
  PermissionDenied: -32002,
  ApprovalRequired: -32003,
  CapabilityUnavailable: -32004,
  RuntimeError: -32010,
};

export const Methods = {
  initialize: "initialize",
  initialized: "notifications/initialized",
  health: { check: "health/check" },
  capabilities: { probe: "capabilities/probe" },
  system: { status: "system/status" },
  container: {
    list: "container/list",
    start: "container/start",
    stop: "container/stop",
    logs: "container/logs",
    stats: "container/stats",
  },
  session: {
    start: "session/start",
    resume: "session/resume",
    fork: "session/fork",
    list: "session/list",
  },
  turn: { start: "turn/start", interrupt: "turn/interrupt", steer: "turn/steer" },
  fs: {
    readFile: "fs/readFile",
    writeFile: "fs/writeFile",
    readDirectory: "fs/readDirectory",
    watch: "fs/watch",
  },
  exec: { run: "exec/run" },
  mcp: { list: "mcp/list", reload: "mcp/reload", oauth: "mcp/oauth" },
  metering: { usage: "metering/usage", balance: "metering/balance" },
  approval: { execCommand: "approval/execCommand", applyPatch: "approval/applyPatch" },
  event: { notify: "event/notify" },
};

export function makeError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}

export function makeResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

export function makeNotification(method, params) {
  return { jsonrpc: "2.0", method, params };
}
