#!/usr/bin/env node
/**
 * Batch 3: rename user-facing desktop app strings to "OpenWork Plus"
 * while preserving protocol names (OpenWork server, Cloud, worker, host).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = path.join(root, "apps/app/src/i18n/locales");

const PROTECTED = [
  "OpenWork Plus",
  "OpenWork Server URL",
  "OpenWork server URL",
  "OpenWork server workspace",
  "OpenWork server connection",
  "OpenWork server sharing",
  "OpenWork server config",
  "OpenWork server details",
  "OpenWork server unavailable",
  "OpenWork server needs",
  "OpenWork server not ready",
  "OpenWork server not",
  "OpenWork server is",
  "OpenWork server as",
  "OpenWork server and",
  "OpenWork servers",
  "OpenWork server",
  "OpenWork Server",
  "OpenWork Cloud",
  "OpenWork workers",
  "OpenWork worker",
  "OpenWork host",
  "OpenWork URL",
].sort((a, b) => b.length - a.length);

function patchContent(content) {
  let result = content;
  const placeholders = new Map();

  PROTECTED.forEach((phrase, index) => {
    const token = `__OW_PROTECT_${index}__`;
    placeholders.set(token, phrase);
    result = result.split(phrase).join(token);
  });

  result = result.replaceAll("OpenWork", "OpenWork Plus");

  for (const [token, phrase] of placeholders) {
    result = result.split(token).join(phrase);
  }

  if (!result.includes('"app.product_name"')) {
    result = result.replace(
      /export default \{\n/,
      'export default {\n  "app.product_name": "OpenWork Plus",\n',
    );
  }

  return result;
}

const files = (await fs.readdir(localesDir)).filter(
  (name) => name.endsWith(".ts") && name !== "index.ts",
);

for (const file of files) {
  const filePath = path.join(localesDir, file);
  const before = await fs.readFile(filePath, "utf8");
  const after = patchContent(before);
  if (after !== before) {
    await fs.writeFile(filePath, after, "utf8");
    console.log(`patched ${file}`);
  }
}
