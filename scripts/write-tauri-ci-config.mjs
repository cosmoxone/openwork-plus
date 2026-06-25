#!/usr/bin/env node
/**
 * Write a Tauri config overlay for CI/local Windows builds.
 *
 * Usage:
 *   node scripts/write-tauri-ci-config.mjs
 *   node scripts/write-tauri-ci-config.mjs --signed
 *   node scripts/write-tauri-ci-config.mjs --locale en-US
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const signed = args.includes("--signed");
const readArg = (name) => {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return null;
};

const locale = readArg("--locale") || "zh-CN";
const outPath =
  readArg("--out") ||
  path.join(root, "apps", "desktop", "src-tauri", "tauri.ci.generated.json");

const config = {
  bundle: {
    createUpdaterArtifacts: signed,
    windows: {
      wix: {
        language: locale,
      },
    },
  },
};

writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(
  `[write-tauri-ci-config] wrote ${path.relative(root, outPath)} locale=${locale} signed=${signed}`,
);
