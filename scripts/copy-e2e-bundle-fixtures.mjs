#!/usr/bin/env node
/** 复制 Playwright E2E 用的 builtin catalog fixture。 */
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const src = path.join(root, "apps", "desktop", "src-tauri", "resources", "bundles", "catalog.builtin.json");
const destDir = path.join(root, "apps", "app", "public", "e2e");
const dest = path.join(destDir, "catalog.builtin.json");

await mkdir(destDir, { recursive: true });
await copyFile(src, dest);
console.log(`copied ${dest}`);
