import { spawn } from "node:child_process";

/**
 * 沙箱内执行 shell 命令：Windows 走 WSL，其它平台走 bash -lc。
 * @param {string} command
 * @param {{ cwd?: string, distro?: string, timeoutMs?: number }} [opts]
 */
export async function execSandboxCommand(command, opts = {}) {
  if (process.platform === "win32") {
    const { execInWSL } = await import("../../sandbox-bootstrap/src/wsl-exec.mjs");
    return execInWSL(command, opts);
  }
  return execLocalBash(command, opts);
}

/**
 * @param {string} command
 * @param {{ cwd?: string, timeoutMs?: number }} [opts]
 */
function execLocalBash(command, opts = {}) {
  let bashCommand = String(command ?? "").trim();
  if (!bashCommand) {
    return Promise.reject(new Error("command required"));
  }
  if (opts.cwd) {
    const safeCwd = String(opts.cwd).replace(/'/g, `'\\''`);
    bashCommand = `cd '${safeCwd}' && ${bashCommand}`;
  }
  const timeoutMs = opts.timeoutMs ?? 60_000;

  return new Promise((resolve, reject) => {
    const child = spawn("bash", ["-lc", bashCommand], { stdio: ["ignore", "pipe", "pipe"] });
    /** @type {Buffer[]} */
    const out = [];
    /** @type {Buffer[]} */
    const err = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`bash command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (c) => out.push(c));
    child.stderr?.on("data", (c) => err.push(c));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const status = code ?? 1;
      resolve({
        ok: status === 0,
        status,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        distro: "local-bash",
      });
    });
  });
}
