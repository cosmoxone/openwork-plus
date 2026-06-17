/**
 * 审批反向调用（P0-ARC-4）：server → client 回调。
 */
import { Methods } from "../../appserver-contract/src/runtime.mjs";

/** @typedef {(params: import('@openwork/appserver-contract').ExecCommandApprovalParams) => Promise<import('@openwork/appserver-contract').ApprovalDecision>} ApprovalHandler */

/** @type {ApprovalHandler | null} */
let clientHandler = null;

/** @type {((msg: object) => void) | null} */
let outboundWriter = null;

export function setOutboundWriter(fn) {
  outboundWriter = fn;
}

export function setClientApprovalHandler(handler) {
  clientHandler = handler;
}

export function hasClientApprovalCapability() {
  return clientHandler != null;
}

/**
 * @param {import('@openwork/appserver-contract').ExecCommandApprovalParams} params
 * @returns {Promise<import('@openwork/appserver-contract').ApprovalDecision>}
 */
export async function requestExecApproval(params) {
  if (clientHandler) {
    return clientHandler(params);
  }
  if (outboundWriter) {
    outboundWriter({
      jsonrpc: "2.0",
      method: Methods.approval.execCommand,
      params,
    });
  }
  throw new Error("ApprovalRequired");
}
