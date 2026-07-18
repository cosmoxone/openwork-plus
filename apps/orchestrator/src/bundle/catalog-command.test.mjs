import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runBundleCommand } from "./index.mjs";

test("catalog JSON preserves builtin entries and reports stale remote failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "openwork-catalog-command-"));
  const builtinPath = path.join(root, "catalog.builtin.json");
  await writeFile(
    builtinPath,
    JSON.stringify({
      schemaVersion: "1.0.0",
      source: "builtin",
      bundles: [{ id: "demo", name: "Demo", version: "1.0.0" }],
    }),
  );

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(" "));
  try {
    await runBundleCommand(
      ["bundle", "catalog"],
      new Map([
        ["json", true],
        ["builtin", builtinPath],
        ["remote-url", "http://127.0.0.1:1/catalog.json"],
        ["data-dir", path.join(root, "data")],
      ]),
    );
  } finally {
    console.log = originalLog;
    await rm(root, { recursive: true, force: true });
  }

  const result = JSON.parse(logs.join("\n"));
  assert.equal(result.stale, true);
  assert.match(result.error, /fetch|connect|refused/i);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].id, "demo");
});
