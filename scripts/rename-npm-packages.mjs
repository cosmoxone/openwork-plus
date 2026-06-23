#!/usr/bin/env node
/**
 * Rename npm workspace packages for openwork-plus.
 * Sidecar/runtime binary names (openwork-plus-server, openwork-plus-orchestrator files) stay unchanged.
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
  "@openwork-plus/app": "@openwork-plus/app",
  "@openwork-plus/desktop": "@openwork-plus/desktop",
  "@openwork-plus/types": "@openwork-plus/types",
  "@openwork-plus/ui": "@openwork-plus/ui",
  "@openwork-plus/ui-demo": "@openwork-plus/ui-demo",
  "@openwork-plus/story-book": "@openwork-plus/story-book",
  "@openwork-plus/share": "@openwork-plus/share",
  "@openwork-plus/server-sdk": "@openwork-plus/server-sdk",
  "@openwork-plus/task-scheduler": "@openwork-plus/task-scheduler",
  "@openwork-plus/knowledge-wiki": "@openwork-plus/knowledge-wiki",
  "@openwork-plus/sqlite-vec-mcp": "@openwork-plus/sqlite-vec-mcp",
  "@openwork-plus/rpa-host": "@openwork-plus/rpa-host",
  "@openwork-plus/sandbox-bootstrap": "@openwork-plus/sandbox-bootstrap",
  "@openwork-plus/host-api-adapter": "@openwork-plus/host-api-adapter",
  "@openwork-plus/appserver-stub": "@openwork-plus/appserver-stub",
  "@openwork-plus/appserver-contract": "@openwork-plus/appserver-contract",
  "@openwork-plus/test-db-mcp": "@openwork-plus/test-db-mcp",
  "@openwork-plus/gui-operate-mcp": "@openwork-plus/gui-operate-mcp",
  "@openwork-plus/metering-store": "@openwork-plus/metering-store",
  "openwork-orchestrator": "openwork-plus-orchestrator",
  "openwork-server": "openwork-plus-server",
  "openwork-plus-server-v2": "openwork-plus-server-v2",
  "opencode-router": "openwork-plus-openwork-plus-opencode-router",
};

const PLATFORM_ORCH = [
  "openwork-plus-orchestrator-darwin-arm64",
  "openwork-plus-orchestrator-darwin-x64",
  "openwork-plus-orchestrator-linux-arm64",
  "openwork-plus-orchestrator-linux-x64",
  "openwork-plus-orchestrator-windows-x64",
];

for (const id of PLATFORM_ORCH) {
  NPM_NAME_MAP[id] = id.replace("openwork-orchestrator", "openwork-plus-orchestrator");
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
    "sidecars/openwork-server",
    "sidecars/openwork-orchestrator",
    "sidecars/opencode-router",
    "dist/bin/openwork-server",
    "bin/openwork-server.mjs",
    "openwork-server.mjs",
    "openwork-server-bin",
    "'openwork-server'",
    '"openwork-server"',
    "'openwork-orchestrator'",
    '"openwork-orchestrator"',
    "'opencode-router'",
    '"opencode-router"',
    "openwork-orchestrator-sidecars.json",
    "openwork-orchestrator-dev",
    "openwork-orchestrator-opencode-",
    "openwork-desktop-",
    "openwork://",
    "openwork-dev://",
    "openwork-plus://",
    "openwork-plus-dev://",
  ].sort((a, b) => b.length - a.length);

  const replacements = [
    ...Object.entries(NPM_NAME_MAP).sort((a, b) => b[0].length - a[0].length),
    ["@openwork-plus/", "@openwork-plus/"],
    ["openwork-plus-orchestrator-v", "openwork-plus-orchestrator-v"],
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
