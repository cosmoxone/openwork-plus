#!/usr/bin/env node
/**
 * One-time setup for Tauri updater signing (OpenWork Plus).
 *
 * 1. Generates a minisign keypair under .secrets/ (gitignored)
 * 2. Writes the public key into apps/desktop/src-tauri/tauri.conf.json
 * 3. Prints GitHub Actions secret commands (private key must be added once)
 *
 * Usage:
 *   node scripts/setup-tauri-updater-signing.mjs
 *   node scripts/setup-tauri-updater-signing.mjs --force
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
const secretsDir = path.join(root, ".secrets");
const privateKeyPath = path.join(secretsDir, "openwork-plus-tauri.key");
const publicKeyPath = `${privateKeyPath}.pub`;
const tauriConfPath = path.join(root, "apps", "desktop", "src-tauri", "tauri.conf.json");

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${result.status ?? 1})`);
  }
}

if (existsSync(privateKeyPath) && !force) {
  console.error(
    `[setup:tauri-signing] key already exists at ${privateKeyPath}\n` +
      "Re-run with --force to regenerate (invalidates existing installs' updater trust).",
  );
  process.exit(1);
}

mkdirSync(secretsDir, { recursive: true });

console.log("[setup:tauri-signing] generating minisign keypair...");
run(
  "pnpm",
  [
    "--filter",
    "@openwork-plus/desktop",
    "exec",
    "tauri",
    "signer",
    "generate",
    "-w",
    privateKeyPath,
    "--ci",
    ...(force ? ["--force"] : []),
  ],
  { env: { ...process.env, CI: "true" } },
);

if (!existsSync(publicKeyPath)) {
  throw new Error(`expected public key at ${publicKeyPath}`);
}

const pubkey = readFileSync(publicKeyPath, "utf8").trim();
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf8"));
tauriConf.plugins = tauriConf.plugins ?? {};
tauriConf.plugins.updater = tauriConf.plugins.updater ?? {};
tauriConf.plugins.updater.pubkey = pubkey;
writeFileSync(tauriConfPath, `${JSON.stringify(tauriConf, null, 2)}\n`, "utf8");

const privateKey = readFileSync(privateKeyPath, "utf8");

console.log("\n[setup:tauri-signing] updated tauri.conf.json pubkey");
console.log("\n=== Next: add GitHub repository secrets (one-time, manual) ===");
console.log("Repo: cosmoxone/openwork-plus\n");
console.log("1) TAURI_SIGNING_PRIVATE_KEY");
console.log("   Paste the entire private key file contents (including header/footer).");
console.log("2) TAURI_SIGNING_PRIVATE_KEY_PASSWORD (optional, leave empty if none)\n");
console.log("CLI example (PowerShell, run from a trusted machine):");
console.log(`  gh secret set TAURI_SIGNING_PRIVATE_KEY --repo cosmoxone/openwork-plus < "${privateKeyPath}"`);
console.log("\nAfter secrets are set, Build Windows Desktop will:");
console.log("- build zh-CN MSI");
console.log("- create signed updater artifacts when TAURI_SIGNING_PRIVATE_KEY is present");
console.log("\nPublic key preview (first line):");
console.log(`${pubkey.split("\n")[0]}...`);
