#!/usr/bin/env node
/**
 * Rename npm workspace packages for openwork-plus.
 * Sidecar/runtime binary names (openworkplus-server, openworkplus-orchestrator files) stay unchanged.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "target",
  "dist",
  "ee",
  "docs",
  "vendor",
  ".pnpm-store",
  ".turbo",
]);

const NPM_NAME_MAP = {
  "@openworkplus/app": "@openworkplus/app",
  "@openworkplus/desktop": "@openworkplus/desktop",
  "@openworkplus/types": "@openworkplus/types",
  "@openworkplus/ui": "@openworkplus/ui",
  "@openworkplus/ui-demo": "@openworkplus/ui-demo",
  "@openworkplus/story-book": "@openworkplus/story-book",
  "@openworkplus/share": "@openworkplus/share",
  "@openworkplus/server-sdk": "@openworkplus/server-sdk",
  "@openworkplus/task-scheduler": "@openworkplus/task-scheduler",
  "@openworkplus/knowledge-wiki": "@openworkplus/knowledge-wiki",
  "@openworkplus/sqlite-vec-mcp": "@openworkplus/sqlite-vec-mcp",
  "@openworkplus/rpa-host": "@openworkplus/rpa-host",
  "@openworkplus/sandbox-bootstrap": "@openworkplus/sandbox-bootstrap",
  "@openworkplus/host-api-adapter": "@openworkplus/host-api-adapter",
  "@openworkplus/appserver-stub": "@openworkplus/appserver-stub",
  "@openworkplus/appserver-contract": "@openworkplus/appserver-contract",
  "@openworkplus/test-db-mcp": "@openworkplus/test-db-mcp",
  "@openworkplus/gui-operate-mcp": "@openworkplus/gui-operate-mcp",
  "@openworkplus/metering-store": "@openworkplus/metering-store",
  "openworkplus-orchestrator": "openworkplus-orchestrator",
  "openworkplus-server": "openworkplus-server",
  "openworkplus-server-v2": "openworkplus-server-v2",
  "openworkplus-opencode-router": "openwork-plus-openworkplus-opencode-router",
};

const PLATFORM_ORCH = [
  "openworkplus-orchestrator-darwin-arm64",
  "openworkplus-orchestrator-darwin-x64",
  "openworkplus-orchestrator-linux-arm64",
  "openworkplus-orchestrator-linux-x64",
  "openworkplus-orchestrator-windows-x64",
];

for (const id of PLATFORM_ORCH) {
  NPM_NAME_MAP[id] = id.replace("openworkplus-orchestrator", "openworkplus-orchestrator");
}

function remapPackageName(name) {
  return NPM_NAME_MAP[name] ?? name;
}

async function patchPackageJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const pkg = JSON.parse(raw);
  let changed = false;

  if (typeof pkg.name === "string") {
    const next = remapPackageName(pkg.name);
    if (next !== pkg.name) {
      pkg.name = next;
      changed = true;
    }
  }

  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const block = pkg[section];
    if (!block || typeof block !== "object") continue;
    for (const [dep, version] of Object.entries(block)) {
      const next = remapPackageName(dep);
      if (next !== dep) {
        block[next] = version;
        delete block[dep];
        changed = true;
      }
    }
  }

  if (!changed) return false;
  await fs.writeFile(filePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return true;
}

async function findPackageJsonFiles(dir, files = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await findPackageJsonFiles(full, files);
    } else if (entry.name === "package.json") {
      files.push(full);
    }
  }
  return files;
}

async function patchTextFiles() {
  const TEXT_EXT = new Set([".json", ".ts", ".tsx", ".mjs", ".js", ".yml", ".yaml", ".md", ".sh", ".rs", ".toml"]);
  const PROTECTED = [
    "sidecars/openworkplus-server",
    "sidecars/openworkplus-orchestrator",
    "sidecars/openworkplus-opencode-router",
    "dist/bin/openworkplus-server",
    "bin/openworkplus-server.mjs",
    "openworkplus-server.mjs",
    "openworkplus-server-bin",
    "'openworkplus-server'",
    '"openworkplus-server"',
    "'openworkplus-orchestrator'",
    '"openworkplus-orchestrator"',
    "'opencode-router'",
    '"openworkplus-opencode-router"',
    "openworkplus-orchestrator-sidecars.json",
    "openworkplus-orchestrator-dev",
    "openworkplus-orchestrator-opencode-",
    "openwork-desktop-",
    "openwork://",
    "openwork-dev://",
    "openwork-plus://",
    "openwork-plus-dev://",
  ].sort((a, b) => b.length - a.length);

  const replacements = [
    ...Object.entries(NPM_NAME_MAP).sort((a, b) => b[0].length - a[0].length),
    ["@openworkplus/", "@openworkplus/"],
    ["openworkplus-orchestrator-v", "openworkplus-orchestrator-v"],
  ];

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.name === "package.json") continue;
      if (!TEXT_EXT.has(path.extname(entry.name))) continue;
      if (full.endsWith(`${path.sep}pnpm-lock.yaml`)) continue;

      let content = await fs.readFile(full, "utf8");
      const placeholders = new Map();
      PROTECTED.forEach((phrase, index) => {
        const token = `__OWP_${index}__`;
        placeholders.set(token, phrase);
        content = content.split(phrase).join(token);
      });
      for (const [from, to] of replacements) {
        content = content.split(from).join(to);
      }
      for (const [token, phrase] of placeholders) {
        content = content.split(token).join(phrase);
      }
      const before = await fs.readFile(full, "utf8");
      if (content !== before) {
        await fs.writeFile(full, content, "utf8");
        console.log(path.relative(root, full));
      }
    }
  }

  await walk(root);
}

let pkgChanged = 0;
for (const file of await findPackageJsonFiles(root)) {
  if (await patchPackageJson(file)) {
    pkgChanged += 1;
    console.log(path.relative(root, file));
  }
}

console.log(`\nPatched ${pkgChanged} package.json files.`);
console.log("Patching text references…");
await patchTextFiles();
