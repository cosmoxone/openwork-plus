import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { knowledgePaths } from "./paths.mjs";
import { knowledgeDbPath } from "./db-path.mjs";
import { listWikiPages } from "./pages.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** @param {string} sourceDir @param {string} outputZip */
async function compressDir(sourceDir, outputZip) {
  const root = path.resolve(sourceDir);
  const out = path.resolve(outputZip);
  await mkdir(path.dirname(out), { recursive: true });
  if (existsSync(out)) await rm(out, { force: true });

  if (process.platform === "win32") {
    await execFileAsync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -Path '${root.replace(/'/g, "''")}\\*' -DestinationPath '${out.replace(/'/g, "''")}' -Force`,
      ],
      { timeout: 180_000 },
    );
    return out;
  }

  await execFileAsync("zip", ["-r", out, "."], { cwd: root, timeout: 180_000 });
  return out;
}

/**
 * 导出 wiki 快照 zip（含 .openwork/knowledge + knowledge.db + manifest）。
 * @param {string} workspaceRoot
 * @param {string} outputZip
 */
export async function exportWikiSnapshot(workspaceRoot, outputZip) {
  const paths = knowledgePaths(workspaceRoot);
  if (!existsSync(paths.root)) {
    throw new Error("知识库尚未初始化");
  }

  const { mkdtemp } = await import("node:fs/promises");
  const os = await import("node:os");
  const stage = await mkdtemp(path.join(os.tmpdir(), "ow-wiki-snapshot-"));

  try {
    const knowledgeDest = path.join(stage, ".openwork", "knowledge");
    await mkdir(path.dirname(knowledgeDest), { recursive: true });
    await cp(paths.root, knowledgeDest, { recursive: true });

    const db = knowledgeDbPath(workspaceRoot);
    if (existsSync(db)) {
      await cp(db, path.join(stage, "knowledge.db"));
    }

    const pages = await listWikiPages(workspaceRoot);
    const manifest = {
      exportedAt: new Date().toISOString(),
      workspaceRoot: path.resolve(workspaceRoot),
      pageCount: pages.length,
      pages: pages.map((p) => ({ relPath: p.relPath, type: p.type, title: p.title })),
    };
    await writeFile(path.join(stage, "SNAPSHOT.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const out = await compressDir(stage, outputZip);
    return { ok: true, outputZip: out, pageCount: pages.length, manifest };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

/** @param {string} zipPath @param {string} destWorkspaceRoot */
export async function importWikiSnapshot(zipPath, destWorkspaceRoot) {
  const zipModule = pathToFileURL(path.join(repoRoot, "apps/orchestrator/src/bundle/zip.mjs")).href;
  const { unzipToDir } = await import(zipModule);
  const { mkdtemp } = await import("node:fs/promises");
  const os = await import("node:os");

  const temp = await mkdtemp(path.join(os.tmpdir(), "ow-wiki-import-"));
  await unzipToDir(zipPath, temp);

  const snapshotMeta = path.join(temp, "SNAPSHOT.json");
  const knowledgeSrc = path.join(temp, ".openwork", "knowledge");
  if (!existsSync(knowledgeSrc)) {
    await rm(temp, { recursive: true, force: true });
    throw new Error("无效快照：缺少 .openwork/knowledge");
  }

  const paths = knowledgePaths(destWorkspaceRoot);
  await mkdir(path.dirname(paths.root), { recursive: true });
  if (existsSync(paths.root)) {
    await rm(paths.root, { recursive: true, force: true });
  }
  await cp(knowledgeSrc, paths.root, { recursive: true });

  const dbSrc = path.join(temp, "knowledge.db");
  if (existsSync(dbSrc)) {
    await cp(dbSrc, knowledgeDbPath(destWorkspaceRoot));
  }

  let meta = {};
  if (existsSync(snapshotMeta)) {
    meta = JSON.parse(await readFile(snapshotMeta, "utf8"));
  }

  await rm(temp, { recursive: true, force: true });
  return { ok: true, imported: true, meta };
}
