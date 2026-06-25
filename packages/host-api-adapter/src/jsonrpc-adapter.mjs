/**
 * JSON-RPC 2.0 NDJSON 行处理器。
 */
import { Methods, ErrorCode, makeError } from "../../appserver-contract/src/runtime.mjs";
import { dispatchAppServerMethod } from "./core-handlers.mjs";

/**
 * @param {import('@openworkplus/appserver-contract').JsonRpcRequest | import('@openworkplus/appserver-contract').JsonRpcNotification} msg
 * @returns {Promise<import('@openworkplus/appserver-contract').JsonRpcResponse | null>}
 */
export async function handleJsonRpcMessage(msg) {
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return makeError(msg.id ?? null, ErrorCode.InvalidRequest, "Invalid Request");
  }

  if (msg.method === Methods.initialized || msg.method === "notifications/initialized") {
    return null;
  }

  if (msg.id === undefined) {
    return null;
  }

  try {
    return await dispatchAppServerMethod(msg.method, msg.params, msg.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return makeError(msg.id, ErrorCode.InternalError, message);
  }
}
