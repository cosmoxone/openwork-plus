import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { initKnowledgeLayout } from "./init.mjs";
import { isScannableFile, isUnderKnowledgeStore, shouldIgnoreDir } from "./ignore.mjs";
import { readState, writeState } from "./state.mjs";

/** @param {string} filePath */
async function sha256File(filePath) {
  const buf = await readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

/** @param {string} dir @param {(abs: string) => Promise<void>} visit */
async function walkDir(dir, visit) {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldIgnoreDir(entry.name)) continue;
      await walkDir(abs, visit);
      continue;
    }
    if (entry.isFile()) {
      await visit(abs);
    }
  }
}

/**
 * @param {string} workspaceRoot
 * @param {string[]} roots
 * @param {{ merge?: boolean }} [options]
 */
export async function scanCorpus(workspaceRoot, roots, options = {}) {
  await initKnowledgeLayout(workspaceRoot);
  const resolvedRoots = roots.map((r) => path.resolve(r)).filter((r) => existsSync(r));
  if (resolvedRoots.length === 0) {
    throw new Error("scan roots 为空或路径不存在");
  }

  /** @type {import('./state.mjs').ScanEntry[]} */
  const manifest = [];
  const seen = new Set();

  for (const root of resolvedRoots) {
    await walkDir(root, async (abs) => {
      if (isUnderKnowledgeStore(abs, workspaceRoot)) return;
      if (!isScannableFile(abs)) return;
      const normalized = path.resolve(abs);
      if (seen.has(normalized)) return;
      seen.add(normalized);

      const st = await stat(normalized);
      const sha256 = await sha256File(normalized);
      manifest.push({
        path: normalized,
        relativePath: path.relative(root, normalized) || path.basename(normalized),
        size: st.size,
        mtimeMs: st.mtimeMs,
        sha256,
        ext: path.extname(normalized).toLowerCase(),
        status: "pending",
      });
    });
  }

  manifest.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const prev = await readState(workspaceRoot);
  const prevByPath = new Map(prev.scanManifest.map((e) => [e.path, e]));

  for (const entry of manifest) {
    const old = prevByPath.get(entry.path);
    if (old?.status === "ingested" && old.sha256 === entry.sha256) {
      entry.status = "ingested";
    }
  }

  const state = options.merge
    ? {
        ...prev,
        scanRoots: [...new Set([...prev.scanRoots, ...resolvedRoots])],
        scanManifest: manifest,
      }
    : {
        ...prev,
        scanRoots: resolvedRoots,
        scanManifest: manifest,
      };

  await writeState(workspaceRoot, state);

  return {
    ok: true,
    roots: resolvedRoots,
    total: manifest.length,
    pending: manifest.filter((e) => e.status === "pending").length,
    ingested: manifest.filter((e) => e.status === "ingested").length,
    manifest,
  };
}
