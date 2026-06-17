import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { isPathAllowed } from "./path-guard.mjs";
import { logSandbox } from "./logger.mjs";

/**
 * @param {{ command: string, cwd?: string, workspaceRoot?: string, timeoutMs?: number }} opts
 * @returns {Promise<{ ok: boolean, status: number, stdout: string, stderr: string }>}
 */
export async function runNativeCommand(opts) {
  const cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
  const guard = isPathAllowed(cwd, opts.workspaceRoot);
  if (!guard.allowed) {
    throw new Error(guard.reason ?? "path not allowed");
  }
  if (opts.workspaceRoot && !fs.existsSync(path.resolve(opts.workspaceRoot))) {
    throw new Error(`workspace does not exist: ${opts.workspaceRoot}`);
  }

  const timeoutMs = opts.timeoutMs ?? 60_000;
  logSandbox(`exec: ${opts.command} (cwd=${cwd})`, { label: "native" });

  return new Promise((resolve, reject) => {
    const child = spawn(opts.command, {
      shell: true,
      cwd,
      env: process.env,
      windowsHide: true,
    });
    /** @type {Buffer[]} */
    const out = [];
    /** @type {Buffer[]} */
    const err = [];
    child.stdout?.on("data", (c) => out.push(c));
    child.stderr?.on("data", (c) => err.push(c));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        status: code ?? 1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
  });
}
