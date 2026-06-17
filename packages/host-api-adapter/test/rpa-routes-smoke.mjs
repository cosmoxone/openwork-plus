import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startHttpServer } from "../src/http-adapter.mjs";
import { setAutomationEnabled } from "../../rpa-host/src/index.mjs";

const dataDir = await mkdtemp(path.join(os.tmpdir(), "ow-rpa-http-"));
try {
  setAutomationEnabled(dataDir, true);
  const { server, port } = await startHttpServer({ port: 0, host: "127.0.0.1" });
  const addr = server.address();
  const listenPort = typeof addr === "object" && addr ? addr.port : port;
  const base = `http://127.0.0.1:${listenPort}`;

  const status = await fetch(`${base}/api/rpa/status?dataDir=${encodeURIComponent(dataDir)}`);
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.equal(body.result.automationEnabled, true);

  const shots = await fetch(`${base}/api/rpa/screenshots?dataDir=${encodeURIComponent(dataDir)}`);
  assert.equal(shots.status, 200);

  server.close();
  console.log("PASS: RPA HTTP routes");
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
