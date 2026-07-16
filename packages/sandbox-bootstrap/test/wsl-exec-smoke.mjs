import assert from "node:assert/strict";
import { execInWSL } from "../src/wsl-exec.mjs";
import { checkWSLStatus } from "../src/wsl-init.mjs";

if (process.platform !== "win32") {
  console.log("SKIP: wsl-exec smoke (non-Windows)");
  process.exit(0);
}

const status = await checkWSLStatus();
if (!status.available) {
  console.log("SKIP: WSL2 not available");
  process.exit(0);
}

const result = await execInWSL("echo ok");
assert.equal(result.status, 0);
assert.equal(result.stdout.trim(), "ok");
assert.ok(result.distro);

const fail = await execInWSL("exit 7");
assert.equal(fail.status, 7);
assert.equal(fail.ok, false);

console.log(`PASS: wsl-exec smoke (distro=${result.distro})`);
