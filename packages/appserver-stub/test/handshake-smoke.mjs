// P0-ARC-1 冒烟：initialize → initialized → health/check → metering/usage → MethodNotFound
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { CONTRACT_VERSION, Methods, ErrorCode } from "../../appserver-contract/src/runtime.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, "..", "src", "stdio-server.mjs");
const dataDir = path.join(os.tmpdir(), `ow-appserver-stub-${Date.now()}`);

const env = { ...process.env, OPENWORK_DATA_DIR: dataDir };
const child = spawn(process.execPath, [serverPath], { env, stdio: ["pipe", "pipe", "ignore"] });

/** @type {Array<{send:object, expectId?:number, check?:(msg:any)=>void}>} */
const steps = [
  {
    send: {
      jsonrpc: "2.0",
      id: 1,
      method: Methods.initialize,
      params: {
        contractVersion: CONTRACT_VERSION,
        clientInfo: { name: "smoke", version: "0" },
        capabilities: { approval: false, events: false },
      },
    },
    expectId: 1,
    check: (msg) => {
      assert.equal(msg.result?.contractVersion, CONTRACT_VERSION);
      assert.ok(Array.isArray(msg.result?.methods));
      assert.ok(msg.result.methods.includes(Methods.health.check));
    },
  },
  {
    send: { jsonrpc: "2.0", method: Methods.initialized },
  },
  {
    send: { jsonrpc: "2.0", id: 2, method: Methods.health.check },
    expectId: 2,
    check: (msg) => {
      assert.equal(msg.result?.ok, true);
      assert.equal(msg.result?.contractVersion, CONTRACT_VERSION);
    },
  },
  {
    send: {
      jsonrpc: "2.0",
      id: 3,
      method: Methods.metering.usage,
      params: {
        sessionId: "smoke-session",
        model: "stub",
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0.001,
      },
    },
    expectId: 3,
    check: (msg) => assert.equal(msg.result?.recorded, true),
  },
  {
    send: { jsonrpc: "2.0", id: 4, method: "container/list" },
    expectId: 4,
    check: (msg) => assert.equal(msg.error?.code, ErrorCode.MethodNotFound),
  },
];

let step = 0;
let buf = "";

function sendStep() {
  if (step >= steps.length) {
    child.kill();
    console.log("PASS: appserver-stub P0-ARC-1 handshake smoke");
    process.exit(0);
  }
  child.stdin.write(`${JSON.stringify(steps[step].send)}\n`);
  if (steps[step].expectId === undefined) {
    step += 1;
    sendStep();
  }
}

const timer = setTimeout(() => {
  console.error(`FAIL: 超时 step=${step}`);
  child.kill();
  process.exit(1);
}, 15000);

child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    const cur = steps[step];
    if (!cur?.expectId || msg.id !== cur.expectId) continue;
    cur.check?.(msg);
    step += 1;
    sendStep();
  }
});

child.on("exit", (code) => {
  clearTimeout(timer);
  if (step < steps.length) {
    console.error(`FAIL: server 提前退出 step=${step} code=${code}`);
    process.exit(1);
  }
});

sendStep();
