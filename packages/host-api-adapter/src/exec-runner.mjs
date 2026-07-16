/**
 * exec/run：经 execpolicy + 可选审批后执行子进程。
 */
import { spawn } from "node:child_process";
import { ErrorCode, makeError, makeResult } from "../../appserver-contract/src/runtime.mjs";
import { evaluateExec, loadRulesFromDisk } from "./execpolicy.mjs";
import { requestExecApproval, hasClientApprovalCapability } from "./approval.mjs";

/** @type {ExecRule[] | null} */
let cachedRules = null;

async function getRules() {
  if (!cachedRules) cachedRules = await loadRulesFromDisk();
  return cachedRules;
}

/**
 * @param {unknown} params
 * @param {import('@openworkplus/appserver-contract').JsonRpcId} id
 */
export async function handleExecRun(params, id) {
  const p = params ?? {};
  /** @type {string[]} */
  const command = Array.isArray(p.command) ? p.command.map(String) : [];
  const cwd = String(p.cwd ?? process.cwd());

  if (command.length === 0) {
    return makeError(id, ErrorCode.InvalidParams, "command required");
  }

  const rules = await getRules();
  const { decision, ruleId } = evaluateExec(command, rules);

  if (decision === "deny") {
    return makeError(id, ErrorCode.PermissionDenied, "exec denied by policy", { ruleId, command });
  }

  if (decision === "needs-approval") {
    if (!hasClientApprovalCapability()) {
      return makeError(id, ErrorCode.ApprovalRequired, "exec requires approval", { command, ruleId });
    }
    try {
      const approval = await requestExecApproval({
        command,
        cwd,
        policyMatch: decision,
        reason: ruleId,
      });
      if (approval.decision !== "approve") {
        return makeError(id, ErrorCode.PermissionDenied, "exec rejected by user");
      }
    } catch {
      return makeError(id, ErrorCode.ApprovalRequired, "exec requires approval", { command, ruleId });
    }
  }

  const result = await runCommand(command, cwd);
  return makeResult(id, result);
}

function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const [bin, ...args] = command;
    const child = spawn(bin, args, { cwd, shell: process.platform === "win32" });
    /** @type {string[]} */
    const stdout = [];
    /** @type {string[]} */
    const stderr = [];
    child.stdout?.on("data", (d) => stdout.push(d.toString()));
    child.stderr?.on("data", (d) => stderr.push(d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.join(""),
        stderr: stderr.join(""),
      });
    });
  });
}

export function resetExecPolicyCache() {
  cachedRules = null;
}
