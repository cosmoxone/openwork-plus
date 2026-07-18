import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type IsolatedElectronEnv = {
  rootDir: string;
  userDataDir: string;
  env: NodeJS.ProcessEnv;
};

function writeDevBootstrap(userDataDir: string) {
  const bootstrapPath = path.join(
    userDataDir,
    "openwork-dev-data",
    "home",
    ".config",
    "openwork",
    "desktop-bootstrap.json",
  );
  mkdirSync(path.dirname(bootstrapPath), { recursive: true });
  writeFileSync(
    bootstrapPath,
    `${JSON.stringify({ requireSignin: false, baseUrl: "https://app.openworklabs.com" }, null, 2)}\n`,
    "utf8",
  );
  return bootstrapPath;
}

/** Isolated Electron userData + HOME for deterministic Playwright runs (A3-02). */
export function createIsolatedElectronEnv(prefix = "openwork-e2e-"): IsolatedElectronEnv {
  const rootDir = path.join(os.tmpdir(), `${prefix}${process.pid}-${Date.now()}`);
  const userDataDir = path.join(rootDir, "electron-userdata");
  const homeDir = path.join(rootDir, "home");
  const appDataDir = path.join(rootDir, "appdata");
  const localAppDataDir = path.join(rootDir, "local-appdata");
  const xdgConfigHome = path.join(rootDir, "xdg-config");
  const xdgDataHome = path.join(rootDir, "xdg-data");
  const xdgCacheHome = path.join(rootDir, "xdg-cache");
  const xdgStateHome = path.join(rootDir, "xdg-state");

  for (const dir of [
    userDataDir,
    homeDir,
    appDataDir,
    localAppDataDir,
    xdgConfigHome,
    xdgDataHome,
    xdgCacheHome,
    xdgStateHome,
  ]) {
    mkdirSync(dir, { recursive: true });
  }

  const bootstrapPath = writeDevBootstrap(userDataDir);

  const env: NodeJS.ProcessEnv = {
    OPENWORK_ELECTRON_USERDATA: userDataDir,
    OPENWORK_DESKTOP_DISABLE_WORKSPACE_RECOVERY: "1",
    OPENWORK_DESKTOP_BOOTSTRAP_PATH: bootstrapPath,
    OPENWORK_DEV_MODE: "1",
    OPENWORK_ELECTRON_USE_MOCK_KEYCHAIN: "1",
    VITE_DISABLE_OPENWORK_MODELS: "1",
    HOME: homeDir,
    APPDATA: appDataDir,
    LOCALAPPDATA: localAppDataDir,
    XDG_CONFIG_HOME: xdgConfigHome,
    XDG_DATA_HOME: xdgDataHome,
    XDG_CACHE_HOME: xdgCacheHome,
    XDG_STATE_HOME: xdgStateHome,
  };

  return { rootDir, userDataDir, env };
}

export function cleanupIsolatedElectronEnv(rootDir: string | undefined) {
  if (!rootDir) return;
  rmSync(rootDir, { recursive: true, force: true });
}

export function resolveElectronLaunchEnv(): NodeJS.ProcessEnv {
  if (process.env.OPENWORK_E2E_ISOLATED === "1") {
    return createIsolatedElectronEnv().env;
  }
  return {};
}
