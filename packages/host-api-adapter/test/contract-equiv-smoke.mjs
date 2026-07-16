/**
 * P0-ARC-2：同一操作经 HTTP 与 JSON-RPC 结果语义一致。
 */
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { CONTRACT_VERSION, Methods } from "../../appserver-contract/src/runtime.mjs";
import { dispatchAppServerMethod } from "../src/core-handlers.mjs";
import { handleHttpRequest, startHttpServer } from "../src/http-adapter.mjs";

const dataDir = path.join(os.tmpdir(), `ow-host-adapter-${Date.now()}`);
process.env.OPENWORK_DATA_DIR = dataDir;

async function main() {
  const { server } = await startHttpServer({ port: 13219, host: "127.0.0.1" });
  try {
    const usageBody = {
      sessionId: "equiv-test",
      model: "stub",
      inputTokens: 3,
      outputTokens: 2,
      costUsd: 0.01,
    };

    const rpcUsage = await dispatchAppServerMethod(Methods.metering.usage, usageBody, 1);
    assert.equal(rpcUsage.result?.recorded, true);

    const httpUsage = await handleHttpRequest(
      /** @type {any} */ ({ method: "POST", url: "/api/metering/usage" }),
      JSON.stringify(usageBody),
    );
    assert.equal(httpUsage.status, 200);
    const httpParsed = JSON.parse(httpUsage.body);
    assert.equal(httpParsed.result?.recorded, true);

    const rpcHealth = await dispatchAppServerMethod(Methods.health.check, {}, 2);
    const httpHealth = await handleHttpRequest(/** @type {any} */ ({ method: "GET", url: "/api/health" }), "");
    const httpHealthParsed = JSON.parse(httpHealth.body);
    assert.equal(rpcHealth.result?.ok, true);
    assert.equal(httpHealthParsed.result?.ok, true);
    assert.equal(httpHealthParsed.result?.contractVersion, CONTRACT_VERSION);

    console.log("PASS: HTTP ↔ JSON-RPC contract equivalence smoke");
  } finally {
    server.close();
  }
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exitCode = 1;
});
