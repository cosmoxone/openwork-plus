#!/usr/bin/env node
/**
 * 生成本地跨机测试发布包：桌面 MSI + Hub deploy-pack + 说明。
 *
 * 用法：
 *   node scripts/package-local-test-release.mjs
 *   node scripts/package-local-test-release.mjs --set 0.11.213
 *   node scripts/package-local-test-release.mjs --skip-bump --skip-p0
 *   node scripts/package-local-test-release.mjs --skip-desktop
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.OPENWORK_MONOREPO_ROOT ?? path.join(here, "..");
const args = process.argv.slice(2);

const has = (flag) => args.includes(flag);
const readArg = (name) => {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const direct = args.find((a) => a.startsWith(`${name}=`));
  return direct ? direct.split("=").slice(1).join("=") : null;
};

const skipBump = has("--skip-bump");
const skipP0 = has("--skip-p0") || process.env.SKIP_P0 === "1";
const skipDesktop = has("--skip-desktop");
const setVersion = readArg("--set");

function run(cmd, cmdArgs, opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, OPENWORK_MONOREPO_ROOT: root },
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`failed: ${cmd} ${cmdArgs.join(" ")} (exit ${result.status ?? 1})`);
  }
}

function runCapture(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, OPENWORK_MONOREPO_ROOT: root },
  });
  if (result.status !== 0) {
    throw new Error(`failed: ${cmd} ${cmdArgs.join(" ")}`);
  }
  return (result.stdout ?? "").trim();
}

async function readVersion() {
  const pkg = JSON.parse(await readFile(path.join(root, "apps", "app", "package.json"), "utf8"));
  return pkg.version;
}

async function sha256File(filePath) {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

async function collectFiles(dir) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const name of await readdir(dir)) {
    const full = path.join(dir, name);
    const st = await stat(full);
    if (st.isDirectory()) out.push(...(await collectFiles(full)));
    else out.push(full);
  }
  return out;
}

async function copyTree(src, dest) {
  await mkdir(dest, { recursive: true });
  await cp(src, dest, { recursive: true, force: true });
}

async function writeTestingMd(outDir, version) {
  const text = `# OpenWork v${version} — 目标机快速验收

## 安装桌面

1. 安装 \`desktop/OpenWorkPlus_${version}_x64_en-US.msi\`（或同目录其它 .msi）。
2. 首次启动 OpenWork，选择或创建工作区。

## 内置行业包（无需 Hub）

Settings › 行业包 → 安装 **test-automation**、**computer-use**（内置 zip，可离线）。

## knowledge-mgmt（需 Hub）

1. 将 \`hub-deploy-pack/\` 放到内网 HTTP 或上传 CDN（见 \`UPLOAD.md\`）。
2. Settings › Bundles Catalog URL → \`https://YOUR/hub/catalog.json\`
3. 从 Catalog 安装 **knowledge-mgmt** → 打开 \`#/docs\`。

## 手工清单

完整步骤见仓库 \`docs/20-manual-test-deploy-checklist.md\`（P2 场景 A、P3 场景 C、P4 RPA）。

## 版本

- App: ${version}
- 构建包目录: dist/local-test-release/v${version}/
`;
  await writeFile(path.join(outDir, "TESTING.md"), text, "utf8");
}

async function main() {
  console.log(`[package:local-test] root=${root}`);

  if (!skipP0) {
    console.log("\n=== P0 pre-manual-test ===");
    run(process.execPath, [path.join(root, "scripts", "pre-manual-test.mjs")]);
  }

  if (!skipBump) {
    console.log("\n=== bump version ===");
    if (setVersion) {
      run("pnpm", ["bump:set", "--", setVersion]);
    } else {
      run("pnpm", ["bump:patch"]);
    }
  } else if (setVersion) {
    throw new Error("--set requires bump (omit --skip-bump)");
  }

  const version = await readVersion();
  console.log(`\n=== release:review (strict) v${version} ===`);
  run("pnpm", ["release:review", "--strict"]);

  console.log("\n=== hub deploy-pack ===");
  run("pnpm", ["run", "bundle-hub:build"]);
  run("pnpm", ["run", "bundle-hub:deploy-pack"]);

  if (!skipDesktop) {
    console.log("\n=== desktop tauri build (may take 10–30 min) ===");
    run("pnpm", ["build"]);
  }

  const outRoot = path.join(root, "dist", "local-test-release", `v${version}`);
  const desktopOut = path.join(outRoot, "desktop");
  const hubOut = path.join(outRoot, "hub-deploy-pack");
  await mkdir(outRoot, { recursive: true });

  const hubSrc = path.join(root, "dist", "bundle-hub", "deploy-pack");
  if (!existsSync(hubSrc)) throw new Error(`missing ${hubSrc}`);
  await copyTree(hubSrc, hubOut);

  /** @type {Array<{path: string, bytes: number, sha256: string}>} */
  const manifestFiles = [];

  if (!skipDesktop) {
    const bundleDir = path.join(root, "apps", "desktop", "src-tauri", "target", "release", "bundle");
    if (!existsSync(bundleDir)) {
      throw new Error(`missing tauri bundle dir: ${bundleDir}`);
    }
    await mkdir(desktopOut, { recursive: true });
    const files = await collectFiles(bundleDir);
    const installers = files.filter((f) => /\.(msi|exe)$/i.test(f));
    if (!installers.length) {
      throw new Error(`no .msi/.exe under ${bundleDir}`);
    }
    for (const src of installers) {
      const rel = path.relative(bundleDir, src);
      const dest = path.join(desktopOut, rel);
      await mkdir(path.dirname(dest), { recursive: true });
      await cp(src, dest, { force: true });
    }
    for (const f of await collectFiles(desktopOut)) {
      const st = await stat(f);
      manifestFiles.push({
        path: path.relative(outRoot, f).replace(/\\/g, "/"),
        bytes: st.size,
        sha256: await sha256File(f),
      });
    }
  }

  for (const f of await collectFiles(hubOut)) {
    const st = await stat(f);
    manifestFiles.push({
      path: path.relative(outRoot, f).replace(/\\/g, "/"),
      bytes: st.size,
      sha256: await sha256File(f),
    });
  }

  const manifest = {
    version,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    files: manifestFiles,
  };
  await writeFile(path.join(outRoot, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await writeTestingMd(outRoot, version);

  console.log(`\n[package:local-test] DONE → ${outRoot}`);
  console.log(`  version: ${version}`);
  console.log(`  files: ${manifestFiles.length}`);
  if (!skipDesktop) {
    const msi = manifestFiles.filter((f) => f.path.endsWith(".msi"));
    for (const m of msi) console.log(`  msi: ${m.path} (${m.bytes} bytes)`);
  }
}

main().catch((err) => {
  console.error(`\n[package:local-test] FAIL: ${err.message}`);
  process.exitCode = 1;
});
