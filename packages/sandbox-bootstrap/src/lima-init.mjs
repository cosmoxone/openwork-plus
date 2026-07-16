import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logSandbox } from "./logger.mjs";

const execFileAsync = promisify(execFile);
const LIMA_INSTANCE = "openwork-sandbox";

/**
 * @returns {Promise<{
 *   available: boolean,
 *   instance?: string,
 *   running?: boolean,
 *   nodeAvailable?: boolean,
 * }>}
 */
export async function checkLimaStatus() {
  if (process.platform !== "darwin") {
    return { available: false };
  }
  try {
    await execFileAsync("limactl", ["--version"], { timeout: 5000, encoding: "utf8" });
  } catch {
    return { available: false };
  }

  let running = false;
  try {
    const { stdout } = await execFileAsync("limactl", ["list", "--format", "{{.Name}}\t{{.Status}}"], {
      timeout: 10_000,
      encoding: "utf8",
    });
    for (const line of stdout.split("\n")) {
      const [name, status] = line.trim().split(/\s+/);
      if (name === LIMA_INSTANCE && status?.toLowerCase() === "running") {
        running = true;
        break;
      }
    }
  } catch (error) {
    logSandbox(String(error), { label: "lima-list" });
  }

  let nodeAvailable = false;
  if (running) {
    try {
      const { stdout } = await execFileAsync(
        "limactl",
        ["shell", LIMA_INSTANCE, "--", "node", "--version"],
        { timeout: 15_000, encoding: "utf8" },
      );
      nodeAvailable = stdout.trim().startsWith("v");
    } catch {
      nodeAvailable = false;
    }
  }

  return {
    available: true,
    instance: LIMA_INSTANCE,
    running,
    nodeAvailable,
  };
}

/** @param {(progress: { phase: string, message: string, progress?: number }) => void} [onProgress] */
export async function ensureLimaInstance(onProgress) {
  const status = await checkLimaStatus();
  if (!status.available) {
    return { ok: false, reason: "limactl not found" };
  }

  onProgress?.({ phase: "checking", message: "Checking Lima instance...", progress: 20 });

  try {
    const { stdout } = await execFileAsync("limactl", ["list", "--format", "{{.Name}}"], {
      timeout: 10_000,
      encoding: "utf8",
    });
    const names = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!names.includes(LIMA_INSTANCE)) {
      onProgress?.({ phase: "creating", message: "Lima instance not found — use native mode", progress: 50 });
      return { ok: false, reason: "instance missing", mode: "native" };
    }
  } catch (error) {
    return { ok: false, reason: String(error) };
  }

  if (!status.running) {
    onProgress?.({ phase: "starting", message: `Starting ${LIMA_INSTANCE}...`, progress: 60 });
    try {
      await execFileAsync("limactl", ["start", LIMA_INSTANCE], { timeout: 300_000, encoding: "utf8" });
    } catch (error) {
      logSandbox(String(error), { label: "lima-start" });
      return { ok: false, reason: String(error) };
    }
  }

  onProgress?.({ phase: "ready", message: "Lima ready", progress: 100 });
  return { ok: true, instance: LIMA_INSTANCE };
}
