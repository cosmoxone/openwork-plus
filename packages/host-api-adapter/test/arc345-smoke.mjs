// P0-ARC-3/4/5 集成冒烟：exec/run、审批、turn 控制
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { ErrorCode, Methods } from "../../appserver-contract/src/runtime.mjs";
import { dispatchAppServerMethod } from "../src/core-handlers.mjs";
import {
  setClientApprovalHandler,
} from "../src/approval.mjs";
import { resetExecPolicyCache } from "../src/exec-runner.mjs";
import { resetSessionsForTest } from "../src/turn-session.mjs";

process.env.OPENWORK_DATA_DIR = path.join(os.tmpdir(), `ow-arc345-${Date.now()}`);
resetExecPolicyCache();
resetSessionsForTest();

// P0-ARC-3 allow
const allow = await dispatchAppServerMethod(
  Methods.exec.run,
  { command: ["node", "-e", "process.stdout.write('ok')"], cwd: process.cwd() },
  1,
);
assert.equal(allow.result?.exitCode, 0);
assert.match(String(allow.result?.stdout), /ok/);

// P0-ARC-3 deny
const deny = await dispatchAppServerMethod(
  Methods.exec.run,
  { command: ["bash", "-c", "echo x"], cwd: process.cwd() },
  2,
);
assert.equal(deny.error?.code, ErrorCode.PermissionDenied);

// P0-ARC-4 needs-approval without handler
const need = await dispatchAppServerMethod(
  Methods.exec.run,
  { command: ["rm", "-rf", "/tmp/not-real-path"], cwd: process.cwd() },
  3,
);
assert.equal(need.error?.code, ErrorCode.ApprovalRequired);

// P0-ARC-4 with auto-approve handler
setClientApprovalHandler(async () => ({ decision: "approve", remember: "once" }));
const approved = await dispatchAppServerMethod(
  Methods.exec.run,
  { command: ["node", "-e", "process.stdout.write('approved')"], cwd: process.cwd() },
  4,
);
assert.equal(approved.result?.exitCode, 0);

// P0-ARC-5 turn flow
const sess = await dispatchAppServerMethod(Methods.session.start, { cwd: process.cwd() }, 10);
const sessionId = sess.result?.sessionId;
assert.ok(sessionId);

const turn = await dispatchAppServerMethod(Methods.turn.start, { sessionId, prompt: "hello" }, 11);
assert.ok(turn.result?.turnId);

const steer = await dispatchAppServerMethod(Methods.turn.steer, { sessionId, text: "focus tests" }, 12);
assert.equal(steer.result?.steered, true);

const interrupt = await dispatchAppServerMethod(Methods.turn.interrupt, { sessionId }, 13);
assert.equal(interrupt.result?.interrupted, true);

console.log("PASS: P0-ARC-3/4/5 integration smoke");
