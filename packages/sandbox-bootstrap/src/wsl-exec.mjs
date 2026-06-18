import { spawn } from "node:child_process";
import { checkWSLStatus } from "./wsl-init.mjs";
import { logSandbox } from "./logger.mjs";

/** @param {string} distro */
function validateDistroName(distro) {
  if (!/^[a-zA-Z0-9\-_.]+$/.test(distro)) {
    throw new Error(`Invalid WSL distro name: ${distro}`);
  }
  return distro;
}

/**
 * 在 WSL2 发行版内执行 shell 命令（P3-1 exec 桥接）。
 * @param {string} command bash -lc 执行的命令
 * @param {{ distro?: string, cwd?: string, timeoutMs?: number, env?: Record<string, string> }} [opts]
 * @returns {Promise<{ ok: boolean, status: number, stdout: string, stderr: string, distro: string }>}
 */
export async function execInWSL(command, opts = {}) {
  if (process.platform !== "win32") {
    throw new Error("WSL exec is only available on Windows");
  }

  const status = await checkWSLStatus();
  if (!status.available || !status.distro) {
    throw new Error("WSL2 not available");
  }

  const distro = validateDistroName(opts.distro ?? status.distro);
  let bashCommand = String(command ?? "").trim();
  if (!bashCommand) {
    throw new Error("command required");
  }

  if (opts.cwd) {
    const safeCwd = String(opts.cwd).replace(/'/g, `'\\''`);
    bashCommand = `cd '${safeCwd}' && ${bashCommand}`;
  }

  const envPrefix =
    opts.env && Object.keys(opts.env).length > 0
      ? `${Object.entries(opts.env)
          .map(([k, v]) => `export ${k}='${String(v).replace(/'/g, `'\\''`)}'`)
          .join("; ")}; `
      : "";

  const timeoutMs = opts.timeoutMs ?? 60_000;
  logSandbox(`wsl exec [${distro}]: ${bashCommand}`, { label: "wsl-exec" });

  return new Promise((resolve, reject) => {
    const child = spawn(
      "wsl",
      ["-d", distro, "-e", "bash", "-lc", `${envPrefix}${bashCommand}`],
      { windowsHide: true },
    );
    /** @type {Buffer[]} */
    const out = [];
    /** @type {Buffer[]} */
    const err = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`WSL command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on("data", (c) => out.push(c));
    child.stderr?.on("data", (c) => err.push(c));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const statusCode = code ?? 1;
      resolve({
        ok: statusCode === 0,
        status: statusCode,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        distro,
      });
    });
  });
}
