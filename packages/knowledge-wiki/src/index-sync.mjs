import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { KnowledgeDb } from "../../sqlite-vec-mcp/src/db.mjs";
import { knowledgePaths } from "./paths.mjs";
import { knowledgeDbPath } from "./db-path.mjs";
import { listWikiPages, readWikiPageContent } from "./pages.mjs";

/** @param {string} workspaceRoot */
export function openKnowledgeDb(workspaceRoot) {
  return new KnowledgeDb(knowledgeDbPath(workspaceRoot));
}

/** @param {string} workspaceRoot @param {string} relPath */
export async function indexWikiPage(workspaceRoot, relPath) {
  const content = await readWikiPageContent(workspaceRoot, relPath);
  if (!content) return null;
  const db = openKnowledgeDb(workspaceRoot);
  const title = String(content.meta.title ?? path.basename(relPath));
  const docPath = `wiki/${relPath}.md`;
  return db.indexDocument({
    path: docPath,
    title,
    content: content.body,
  });
}

/** @param {string} workspaceRoot */
export async function rebuildKnowledgeIndex(workspaceRoot) {
  const db = openKnowledgeDb(workspaceRoot);
  await db.clearAll();
  const pages = await listWikiPages(workspaceRoot);
  /** @type {any[]} */
  const indexed = [];
  for (const page of pages) {
    const row = await indexWikiPage(workspaceRoot, page.relPath);
    if (row) indexed.push(row);
  }

  const paths = knowledgePaths(workspaceRoot);
  if (existsSync(paths.rawArchive)) {
    const { readdir, stat } = await import("node:fs/promises");
    const archives = await walkArchive(paths.rawArchive);
    for (const file of archives) {
      if (!/\.(md|markdown|txt|html|htm)$/i.test(file)) continue;
      const raw = await readFile(file, "utf8");
      const rel = path.relative(workspaceRoot, file).replace(/\\/g, "/");
      const row = await db.indexDocument({
        path: `raw/${rel}`,
        title: path.basename(file),
        content: raw.slice(0, 8000),
      });
      indexed.push(row);
    }
  }

  return { ok: true, indexed: indexed.length, db: knowledgeDbPath(workspaceRoot) };
}

/** @param {string} dir */
async function walkArchive(dir) {
  /** @type {string[]} */
  const out = [];
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkArchive(abs)));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

/** @param {string} workspaceRoot */
export async function clearKnowledgeIndex(workspaceRoot) {
  const dbPath = knowledgeDbPath(workspaceRoot);
  if (existsSync(dbPath)) {
    const db = openKnowledgeDb(workspaceRoot);
    await db.clearAll();
    await rm(dbPath, { force: true });
  }
  return { ok: true, db: dbPath };
}

/** @param {string} workspaceRoot @param {string} relPath */
export async function indexIngestedSummary(workspaceRoot, summaryRel) {
  const rel = summaryRel.replace(/^wiki\//, "").replace(/\.md$/i, "");
  const row = await indexWikiPage(workspaceRoot, rel);
  return row;
}
