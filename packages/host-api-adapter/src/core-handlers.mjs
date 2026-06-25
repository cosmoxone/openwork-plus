/**
 * 共享业务处理器：HTTP 与 JSON-RPC 共用同一实现。
 */
import {
  CONTRACT_VERSION,
  Methods,
  ErrorCode,
  makeResult,
  makeError,
} from "../../appserver-contract/src/runtime.mjs";
import { MeteringStore } from "../../metering-store/src/store.mjs";
import { handleExecRun } from "./exec-runner.mjs";
import {
  sessionStart,
  sessionList,
  turnStart,
  turnInterrupt,
  turnSteer,
} from "./turn-session.mjs";

const SERVER_NAME = "openwork-host-api";
const SERVER_VERSION = "0.2.0";

export const IMPLEMENTED_METHODS = [
  Methods.initialize,
  Methods.health.check,
  Methods.system.status,
  Methods.metering.usage,
  Methods.metering.balance,
  Methods.capabilities.probe,
  Methods.exec.run,
  Methods.session.start,
  Methods.session.list,
  Methods.turn.start,
  Methods.turn.interrupt,
  Methods.turn.steer,
];

/** @type {import('@openworkplus/metering-store').MeteringStore | null} */
let metering = null;

function getMetering() {
  if (!metering) metering = new MeteringStore();
  return metering;
}

/**
 * @param {string} method
 * @param {unknown} params
 * @param {import('@openworkplus/appserver-contract').JsonRpcId} id
 */
export async function dispatchAppServerMethod(method, params, id) {
  if (method === Methods.initialize) {
    const p = params ?? {};
    if (p.contractVersion !== CONTRACT_VERSION) {
      return makeError(id, ErrorCode.InvalidParams, `unsupported contractVersion: ${p.contractVersion}`);
    }
    return makeResult(id, {
      contractVersion: CONTRACT_VERSION,
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      methods: IMPLEMENTED_METHODS,
      capabilities: { container: false, sandbox: "none", metering: true, execpolicy: true, approval: true },
    });
  }

  if (method === Methods.health.check) {
    return makeResult(id, {
      ok: true,
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      contractVersion: CONTRACT_VERSION,
    });
  }

  if (method === Methods.system.status) {
    return makeResult(id, {
      cpuPercent: 0,
      memUsed: 0,
      memTotal: 0,
      disk: [],
      stub: true,
    });
  }

  if (method === Methods.capabilities.probe) {
    return makeResult(id, { methods: IMPLEMENTED_METHODS, stub: true });
  }

  if (method === Methods.metering.usage) {
    const store = getMetering();
    const ev = params ?? {};
    await store.recordUsage({
      sessionId: String(ev.sessionId ?? "stub"),
      model: String(ev.model ?? "stub"),
      inputTokens: Number(ev.inputTokens ?? 0),
      outputTokens: Number(ev.outputTokens ?? 0),
      cacheTokens: ev.cacheTokens != null ? Number(ev.cacheTokens) : undefined,
      costUsd: ev.costUsd != null ? Number(ev.costUsd) : undefined,
    });
    return makeResult(id, { recorded: true });
  }

  if (method === Methods.metering.balance) {
    const store = getMetering();
    const balanceUsd = await store.balance();
    return makeResult(id, { balanceUsd });
  }

  if (method === Methods.exec.run) {
    return handleExecRun(params, id);
  }

  if (method === Methods.session.start) {
    try {
      return makeResult(id, sessionStart(params ?? {}));
    } catch (e) {
      return makeError(id, ErrorCode.RuntimeError, e instanceof Error ? e.message : String(e));
    }
  }

  if (method === Methods.session.list) {
    return makeResult(id, { sessions: sessionList() });
  }

  if (method === Methods.turn.start) {
    const p = params ?? {};
    try {
      return makeResult(id, turnStart(String(p.sessionId), p.prompt));
    } catch (e) {
      return makeError(id, ErrorCode.RuntimeError, e instanceof Error ? e.message : String(e));
    }
  }

  if (method === Methods.turn.interrupt) {
    const p = params ?? {};
    try {
      return makeResult(id, turnInterrupt(String(p.sessionId)));
    } catch (e) {
      return makeError(id, ErrorCode.RuntimeError, e instanceof Error ? e.message : String(e));
    }
  }

  if (method === Methods.turn.steer) {
    const p = params ?? {};
    try {
      return makeResult(id, turnSteer(String(p.sessionId), p.text));
    } catch (e) {
      return makeError(id, ErrorCode.RuntimeError, e instanceof Error ? e.message : String(e));
    }
  }

  return makeError(id, ErrorCode.MethodNotFound, `Method not found: ${method}`);
}

export { CONTRACT_VERSION, SERVER_NAME, SERVER_VERSION };
