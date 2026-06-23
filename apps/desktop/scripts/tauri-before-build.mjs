import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");

const pnpmCmd = process.platform === "win32" ? "corepack.cmd" : "pnpm";
const pnpmArgs = process.platform === "win32" ? ["pnpm"] : [];

const runPnpm = (args) => {
  const result = spawnSync(pnpmCmd, [...pnpmArgs, ...args], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const runNode = (scriptRel) => {
  const result = spawnSync(process.execPath, [path.join(root, scriptRel)], {
    cwd: root,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

runPnpm(["--filter", "@openwork-plus/desktop", "run", "prepare:sidecar"]);
runNode("scripts/build-builtin-bundles.mjs");
runPnpm(["--filter", "@openwork-plus/app", "build"]);
