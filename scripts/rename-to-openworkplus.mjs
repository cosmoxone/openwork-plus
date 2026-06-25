#!/usr/bin/env node
/**
 * Rename workspace npm scope/packages and sidecar identifiers to openworkplus.
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
  ".secrets",
  "agent-tools",
]);

const PROTECTED = [
  "apps/opencode-router",
  "../opencode-router",
  "../../opencode-router",
  "opencode-router/",
  "packages/opencode-router",
  "openwork-plus-hub",
  "openwork-plus://",
  "openwork-plus-dev://",
  "cosmoxone/openwork-plus",
  "comoxone/openwork-plus",
  "openwork.plus",
  "OpenWork Plus",
  "OpenWorkPlus",
  "OpenWork server",
  "OpenWork Server",
  "OpenWork Cloud",
  "OpenWork worker",
  "OpenWork host",
  "OpenWork URL",
  "openwork://",
  "openwork-dev://",
  ".openwork/",
  "anomalyco/opencode",
  "different-ai/openwork",
  "lib/openwork-server",
  "openwork-server-provider",
  "openwork-server-store",
  "connections/openwork-server",
].sort((a, b) => b.length - a.length);

const REPLACEMENTS = [
  ["@openwork-plus/", "@openworkplus/"],
  ["@openwork/", "@openworkplus/"],
  ["openworkplus-opencode-router", "openworkplus-opencode-router"],
  ["openworkplus-orchestrator", "openworkplus-orchestrator"],
  ["openworkplus-server-v2", "openworkplus-server-v2"],
  ["openworkplus-server", "openworkplus-server"],
  ["openwork-orchestrator", "openworkplus-orchestrator"],
  ["openwork-server", "openworkplus-server"],
  ['sidecar("opencode-router")', 'sidecar("openworkplus-opencode-router")'],
  ['command("opencode-router")', 'command("openworkplus-opencode-router")'],
  ['sidecar("openwork-server")', 'sidecar("openworkplus-server")'],
  ['command("openwork-server")', 'command("openworkplus-server")'],
  ['sidecar("openwork-orchestrator")', 'sidecar("openworkplus-orchestrator")'],
  ['command("openwork-orchestrator")', 'command("openworkplus-orchestrator")'],
  ['"opencode-router"', '"openworkplus-opencode-router"'],
  ['"openwork-orchestrator"', '"openworkplus-orchestrator"'],
  ["sidecars/opencode-router", "sidecars/openworkplus-opencode-router"],
  ["sidecars/openwork-server", "sidecars/openworkplus-server"],
  ["sidecars/openwork-orchestrator", "sidecars/openworkplus-orchestrator"],
  ["openworkplus-opencode-router.exe", "openworkplus-opencode-router.exe"],
  ["openworkplus-server.exe", "openworkplus-server.exe"],
  ["openworkplus-orchestrator.exe", "openworkplus-orchestrator.exe"],
  ["openworkplus-opencode-router-", "openworkplus-opencode-router-"],
  ["openworkplus-server-", "openworkplus-server-"],
  ["openworkplus-orchestrator-", "openworkplus-orchestrator-"],
  ["openwork-plus-tauri.key", "openworkplus-tauri.key"],
  ["openwork-plus-tauri.pub", "openworkplus-tauri.pub"],
  ["@openworkplus/workspace", "@openworkplus/workspace"],
].sort((a, b) => b[0].length - a[0].length);

const NPM_PACKAGES = [
  "@openworkplus/workspace",
  "@openworkplus/app",
  "@openworkplus/desktop",
  "@openworkplus/types",
  "@openworkplus/ui",
  "@openworkplus/ui-demo",
  "@openworkplus/story-book",
  "@openworkplus/share",
  "@openworkplus/server-sdk",
  "@openworkplus/task-scheduler",
  "@openworkplus/knowledge-wiki",
  "@openworkplus/sqlite-vec-mcp",
  "@openworkplus/rpa-host",
  "@openworkplus/sandbox-bootstrap",
  "@openworkplus/host-api-adapter",
  "@openworkplus/appserver-stub",
  "@openworkplus/appserver-contract",
  "@openworkplus/test-db-mcp",
  "@openworkplus/gui-operate-mcp",
  "@openworkplus/metering-store",
  "openworkplus-orchestrator",
  "openworkplus-server",
  "openworkplus-server-v2",
  "openworkplus-opencode-router",
];

const NAME_MAP = Object.fromEntries([
  ["@openwork-plus/workspace", "@openworkplus/workspace"],
  ["@openwork-plus/app", "@openworkplus/app"],
  ["@openwork-plus/desktop", "@openworkplus/desktop"],
  ["@openwork-plus/types", "@openworkplus/types"],
  ["@openwork-plus/ui", "@openworkplus/ui"],
  ["@openwork-plus/ui-demo", "@openworkplus/ui-demo"],
  ["@openwork-plus/story-book", "@openworkplus/story-book"],
  ["@openwork-plus/share", "@openworkplus/share"],
  ["@openwork-plus/server-sdk", "@openworkplus/server-sdk"],
  ["@openwork-plus/task-scheduler", "@openworkplus/task-scheduler"],
  ["@openwork-plus/knowledge-wiki", "@openworkplus/knowledge-wiki"],
  ["@openwork-plus/sqlite-vec-mcp", "@openworkplus/sqlite-vec-mcp"],
  ["@openwork-plus/rpa-host", "@openworkplus/rpa-host"],
  ["@openwork-plus/sandbox-bootstrap", "@openworkplus/sandbox-bootstrap"],
  ["@openwork-plus/host-api-adapter", "@openworkplus/host-api-adapter"],
  ["@openwork-plus/appserver-stub", "@openworkplus/appserver-stub"],
  ["@openwork-plus/appserver-contract", "@openworkplus/appserver-contract"],
  ["@openwork-plus/test-db-mcp", "@openworkplus/test-db-mcp"],
  ["@openwork-plus/gui-operate-mcp", "@openworkplus/gui-operate-mcp"],
  ["@openwork-plus/metering-store", "@openworkplus/metering-store"],
  ["@openwork/workspace", "@openworkplus/workspace"],
  ["@openwork/app", "@openworkplus/app"],
  ["@openwork/desktop", "@openworkplus/desktop"],
  ["@openwork/types", "@openworkplus/types"],
  ["@openwork/ui", "@openworkplus/ui"],
  ["@openwork/ui-demo", "@openworkplus/ui-demo"],
  ["@openwork/story-book", "@openworkplus/story-book"],
  ["@openwork/share", "@openworkplus/share"],
  ["@openwork/server-sdk", "@openworkplus/server-sdk"],
  ["openworkplus-orchestrator", "openworkplus-orchestrator"],
  ["openworkplus-server-v2", "openworkplus-server-v2"],
  ["openworkplus-server", "openworkplus-server"],
  ["openworkplus-opencode-router", "openworkplus-opencode-router"],
  ["openwork-orchestrator", "openworkplus-orchestrator"],
  ["openwork-server", "openworkplus-server"],
  ["openwork-server-v2", "openworkplus-server-v2"],
  ["opencode-router", "openworkplus-opencode-router"],
]);

for (const id of [
  "openworkplus-orchestrator-darwin-arm64",
  "openworkplus-orchestrator-darwin-x64",
  "openworkplus-orchestrator-linux-arm64",
  "openworkplus-orchestrator-linux-x64",
  "openworkplus-orchestrator-windows-x64",
]) {
  NAME_MAP[id.replace("openworkplus", "openworkplus-orchestrator")] = id;
  NAME_MAP[id.replace("openworkplus-orchestrator", "openwork-orchestrator")] = id;
}

function remapPackageName(name) {
  return NAME_MAP[name] ?? name;
}

function applyReplacements(content) {
  const placeholders = new Map();
  PROTECTED.forEach((phrase, index) => {
    const token = `__OWP_PROTECT_${index}__`;
    placeholders.set(token, phrase);
    content = content.split(phrase).join(token);
  });
  for (const [from, to] of REPLACEMENTS) {
    content = content.split(from).join(to);
  }
  for (const [token, phrase] of placeholders) {
    content = content.split(token).join(phrase);
  }
  return content;
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
    for (const [dep, version] of Object.entries({ ...block })) {
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

async function patchTextFiles() {
  const TEXT_EXT = new Set([".json", ".ts", ".tsx", ".mjs", ".js", ".yml", ".yaml", ".md", ".sh", ".rs", ".toml", ".wxs", ".cmd", ".plist"]);
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
      if (entry.name === "pnpm-lock.yaml") continue;
      if (!TEXT_EXT.has(path.extname(entry.name))) continue;
      if (full.endsWith(`${path.sep}rename-to-openworkplus.mjs`)) continue;

      const before = await fs.readFile(full, "utf8");
      const after = applyReplacements(before);
      if (after !== before) {
        await fs.writeFile(full, after, "utf8");
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
console.log("Done.");
