#!/usr/bin/env node
/**
 * Revert accidental module path renames from rename-to-openworkplus.
 * npm package names use openworkplus-*; local TS module filenames stay openwork-server*.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", "docs", "ee", "vendor", "dist"]);

const FIXES = [
  ["../../app/lib/openworkplus-server", "../../app/lib/openwork-server"],
  ["../lib/openworkplus-server", "../lib/openwork-server"],
  ["./lib/openworkplus-server", "./lib/openwork-server"],
  ["./openworkplus-server", "./openwork-server"],
  ["../connections/openworkplus-server-store", "../connections/openwork-server-store"],
  ["../../connections/openworkplus-server-store", "../../connections/openwork-server-store"],
  ["./connections/openworkplus-server-store", "./connections/openwork-server-store"],
  ["./openworkplus-server-store", "./openwork-server-store"],
  ["./connections/openworkplus-server-provider", "./connections/openwork-server-provider"],
  ["openworkplus-server-provider", "openwork-server-provider"],
  ["apps/openworkplus-opencode-router/package.json", "apps/opencode-router/package.json"],
];

async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name) && !entry.name.endsWith("fix-import-paths-after-rename.mjs")) {
      let text = await fs.readFile(full, "utf8");
      const before = text;
      for (const [from, to] of FIXES) text = text.split(from).join(to);
      if (text !== before) {
        await fs.writeFile(full, text, "utf8");
        console.log(path.relative(root, full));
      }
    }
  }
}

await walk(path.join(root, "apps"));
await walk(path.join(root, "scripts"));
