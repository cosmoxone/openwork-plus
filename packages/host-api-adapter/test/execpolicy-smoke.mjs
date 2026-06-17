// P0-ARC-3 execpolicy 冒烟
import assert from "node:assert/strict";
import { evaluateExec } from "../src/execpolicy.mjs";

const rules = [
  { id: "allow-node", action: "allow", prefix: "node" },
  { id: "deny-bash-c", action: "deny", pattern: "bash -c *" },
  { id: "approve-rm", action: "needs-approval", pattern: "rm -rf *" },
];

assert.equal(evaluateExec(["node", "-e", "console.log(1)"], rules).decision, "allow");
assert.equal(evaluateExec(["bash", "-c", "echo x"], rules).decision, "deny");
assert.equal(evaluateExec(["rm", "-rf", "/tmp/x"], rules).decision, "needs-approval");

console.log("PASS: execpolicy smoke");
