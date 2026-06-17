#!/usr/bin/env node
/**
 * 校验 bundle.json version 与发布 tag / 入参一致。
 * 用法: node scripts/verify-bundle-hub-release.mjs --bundle knowledge-mgmt --version 0.5.0
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      flags[a.slice(2)] = argv[i + 1] ?? "";
      i++;
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const bundleId = flags.bundle ?? "knowledge-mgmt";
  const expected = (flags.version ?? "").trim().replace(/^v/, "");
  if (!expected) {
    console.error("usage: verify-bundle-hub-release.mjs --bundle knowledge-mgmt --version 0.5.0");
    process.exit(1);
  }

  const manifestPath = path.join(root, "bundles", bundleId, "bundle.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.id !== bundleId) {
    console.error(`bundle.json id mismatch: ${manifest.id} !== ${bundleId}`);
    process.exit(1);
  }
  if (manifest.version !== expected) {
    console.error(
      `version mismatch: bundle.json has ${manifest.version}, expected ${expected}. Bump bundles/${bundleId}/bundle.json first.`,
    );
    process.exit(1);
  }
  console.log(`OK: ${bundleId}@${manifest.version}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
