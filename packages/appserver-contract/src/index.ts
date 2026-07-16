/**
 * 统一 App-Server 契约（JSON-RPC 2.0）的 TypeScript 类型定义。
 *
 * 权威规范见文档：
 *   hermclaw-docs/docs/06-analysis-design/interfaces/tri-app-server-jsonrpc-contract.md
 *
 * 该包是三仓（OpenWork App-Server / ClawX box-agent / 远程 worker）共用的契约 SSOT。
 * 仅含类型与常量，无运行时依赖。
 */

export const CONTRACT_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 信封
// ---------------------------------------------------------------------------

export type JsonRpcId = number | string;

export interface JsonRpcRequest<P = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: P;
}

export interface JsonRpcSuccess<R = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: R;
}

export interface JsonRpcErrorBody {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: JsonRpcErrorBody;
}

export interface JsonRpcNotification<P = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: P;
}

export type JsonRpcResponse<R = unknown> = JsonRpcSuccess<R> | JsonRpcError;
export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcResponse
  | JsonRpcNotification;

// ---------------------------------------------------------------------------
// 错误码（标准 + 本契约自定义）
// ---------------------------------------------------------------------------

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  // 契约自定义
  Unauthorized: -32001,
  PermissionDenied: -32002,
  ApprovalRequired: -32003,
  CapabilityUnavailable: -32004,
  RuntimeError: -32010,
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ---------------------------------------------------------------------------
// 方法名常量（按域分组）
// ---------------------------------------------------------------------------

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
  // server -> client
  approval: { execCommand: "approval/execCommand", applyPatch: "approval/applyPatch" },
  event: { notify: "event/notify" },
} as const;

// ---------------------------------------------------------------------------
// 握手
// ---------------------------------------------------------------------------

export interface InitializeParams {
  contractVersion: number;
  clientInfo: { name: string; version: string };
  capabilities?: { approval?: boolean; events?: boolean };
}

export interface InitializeResult {
  contractVersion: number;
  serverInfo: { name: string; version: string };
  methods: string[];
  capabilities: ServerCapabilities;
}

export interface ServerCapabilities {
  container?: boolean;
  sandbox?: "none" | "restricted-token" | "wsl" | "lima";
  metering?: boolean;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// 业务 payload（box-agent 实现的域）
// ---------------------------------------------------------------------------

export interface SystemStatus {
  cpuPercent: number;
  memUsed: number;
  memTotal: number;
  disk: Array<{ mount: string; used: number; total: number }>;
  net?: { bytesSent: number; bytesRecv: number };
  temperatures?: Array<{ sensor: string; celsius: number }>;
}

export interface ContainerSummary {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
}

// ---------------------------------------------------------------------------
// 审批回调（server -> client）
// ---------------------------------------------------------------------------

export interface ExecCommandApprovalParams {
  command: string[];
  cwd: string;
  reason?: string;
  policyMatch: "allow" | "needs-approval" | "deny";
}

export interface ApprovalDecision {
  decision: "approve" | "reject";
  remember?: "once" | "session" | "always";
}

// ---------------------------------------------------------------------------
// 计量事件（衔接商业线 Credit）
// ---------------------------------------------------------------------------

export const USAGE_EVENT_TYPE = "com.openwork.events.usage" as const;

export interface UsageEventPayload {
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheTokens?: number;
  costUsd?: number;
  deviceId?: string;
  ts: string;
}

// ---------------------------------------------------------------------------
// 辅助构造器
// ---------------------------------------------------------------------------

export function makeError(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

export function makeResult<R>(id: JsonRpcId, result: R): JsonRpcSuccess<R> {
  return { jsonrpc: "2.0", id, result };
}

export function makeNotification<P>(method: string, params: P): JsonRpcNotification<P> {
  return { jsonrpc: "2.0", method, params };
}
