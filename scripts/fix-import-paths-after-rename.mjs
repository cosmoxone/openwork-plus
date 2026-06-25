#!/usr/bin/env node
/** Revert accidental path renames from rename-npm-packages (local files keep openworkplus-server.ts names). */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", "docs", "ee", "vendor"]);

const FIXES = [
  ["../../app/lib/openworkplus-server", "../../app/lib/openworkplus-server"],
  ["../lib/openworkplus-server", "../lib/openworkplus-server"],
  ["./openworkplus-server", "./openworkplus-server"],
  ["../connections/openworkplus-server-store", "../connections/openworkplus-server-store"],
  ["../../connections/openworkplus-server-store", "../../connections/openworkplus-server-store"],
  ["./openworkplus-server-store", "./openworkplus-server-store"],
  ["openworkplus-server-unavailable", "openworkplus-server-unavailable"],
  ["openworkplus-server-provider", "openworkplus-server-provider"],
];

async function walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
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

await walk(root);
