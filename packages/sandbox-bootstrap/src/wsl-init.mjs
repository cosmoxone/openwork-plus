import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logSandbox } from "./logger.mjs";

const execFileAsync = promisify(execFile);

/** @param {Buffer|string} buffer */
function decodeWslOutput(buffer) {
  if (typeof buffer === "string") {
    return buffer.replace(/\0/g, "").replace(/\r\n/g, "\n").trim();
  }
  try {
    const decoded = buffer
      .toString("utf16le")
      .replace(/\0/g, "")
      .replace(/\r\n/g, "\n")
      .trim();
    if (decoded && /^[\x20-\x7E\n\-_.]+$/.test(decoded)) return decoded;
  } catch {
    /* fall through */
  }
  return buffer.toString("utf-8").replace(/\0/g, "").replace(/\r\n/g, "\n").trim();
}

/** @param {string} distro */
function validateDistroName(distro) {
  if (!/^[a-zA-Z0-9\-_.]+$/.test(distro)) {
    throw new Error(`Invalid WSL distro name: ${distro}`);
  }
  return distro;
}

/** @param {string} distro */
async function testDistro(distro) {
  try {
    await execFileAsync("wsl", ["-d", distro, "-e", "echo", "ok"], {
      timeout: 15_000,
      encoding: "utf8",
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<{
 *   available: boolean,
 *   distro?: string,
 *   nodeAvailable?: boolean,
 *   nodeVersion?: string,
 *   pythonAvailable?: boolean,
 * }>}
 */
export async function checkWSLStatus() {
  if (process.platform !== "win32") {
    return { available: false };
  }
  try {
    try {
      await execFileAsync("wsl", ["--status"], { timeout: 5000 });
    } catch {
      logSandbox("WSL --status unavailable, continuing", { label: "wsl" });
    }

    const { stdout } = await execFileAsync("wsl", ["--list", "--quiet"], {
      encoding: "buffer",
      timeout: 10_000,
    });
    const decoded = decodeWslOutput(/** @type {Buffer} */ (stdout));
    const distros = decoded
      .split(/\r?\n/)
      .map((d) => d.trim())
      .filter((d) => d && /^[a-zA-Z0-9\-_.]+$/.test(d));

    if (distros.length === 0) {
      return { available: false };
    }

    const ubuntu = distros.find((d) => d.toLowerCase().includes("ubuntu"));
    const selectedDistro = validateDistroName(ubuntu ?? distros[0]);
    if (!(await testDistro(selectedDistro))) {
      return { available: false };
    }

    let nodeAvailable = false;
    let nodeVersion = "";
    try {
      const { stdout: nodeOut } = await execFileAsync(
        "wsl",
        ["-d", selectedDistro, "-e", "node", "--version"],
        { timeout: 10_000, encoding: "utf8" },
      );
      const output = nodeOut.trim();
      if (output.startsWith("v")) {
        nodeAvailable = true;
        nodeVersion = output;
      }
    } catch {
      nodeAvailable = false;
    }

    let pythonAvailable = false;
    try {
      const { stdout: pyOut } = await execFileAsync(
        "wsl",
        ["-d", selectedDistro, "-e", "python3", "--version"],
        { timeout: 10_000, encoding: "utf8" },
      );
      pythonAvailable = Boolean(pyOut.trim());
    } catch {
      pythonAvailable = false;
    }

    return {
      available: true,
      distro: selectedDistro,
      nodeAvailable,
      nodeVersion,
      pythonAvailable,
    };
  } catch (error) {
    logSandbox(String(error), { label: "wsl-error" });
    return { available: false };
  }
}

/** @param {string} distro */
export async function installNodeInWSL(distro) {
  validateDistroName(distro);
  const script =
    "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs";
  try {
    await execFileAsync("wsl", ["-d", distro, "-e", "bash", "-c", script], {
      timeout: 300_000,
      encoding: "utf8",
    });
    return true;
  } catch (error) {
    logSandbox(String(error), { label: "wsl-node-install" });
    return false;
  }
}
