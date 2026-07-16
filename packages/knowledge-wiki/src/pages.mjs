import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { initKnowledgeLayout } from "./init.mjs";
import { knowledgePaths } from "./paths.mjs";
import { slugify } from "./slug.mjs";
import {
  TYPE_TO_DIR,
  WIKI_PAGE_TYPES,
  parseFrontmatter,
  serializeFrontmatter,
  extractWikilinks,
} from "./wiki-page.mjs";
import { refreshIndex } from "./index-page.mjs";

/** @param {string} dir */
async function walkWikiMd(dir) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(dir)) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkWikiMd(abs)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "INDEX.md") {
      out.push(abs);
    }
  }
  return out;
}

/** @param {string} workspaceRoot @param {string} link */
export function resolveWikiLink(workspaceRoot, link) {
  const paths = knowledgePaths(workspaceRoot);
  const normalized = link.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\.md$/i, "");
  const candidates = [
    path.join(paths.wiki, `${normalized}.md`),
    path.join(paths.wiki, normalized),
  ];
  for (const type of WIKI_PAGE_TYPES) {
    const dir = TYPE_TO_DIR[type];
    const base = path.basename(normalized);
    candidates.push(path.join(paths.wiki, dir, `${base}.md`));
    if (normalized.startsWith(`${dir}/`)) {
      candidates.push(path.join(paths.wiki, `${normalized}.md`));
    }
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** @param {string} workspaceRoot */
export async function listWikiPages(workspaceRoot) {
  const paths = knowledgePaths(workspaceRoot);
  const files = await walkWikiMd(paths.wiki);
  /** @type {Array<{ absPath: string, relPath: string, type: string, title: string, slug: string, sourceFiles: string[], wikilinks: string[], updatedAt: string }>} */
  const pages = [];

  for (const abs of files) {
    const relFromWiki = path.relative(paths.wiki, abs).replace(/\\/g, "/");
    const raw = await readFile(abs, "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const type = String(meta.type ?? inferTypeFromPath(relFromWiki));
    const title = String(meta.title ?? path.basename(abs, ".md"));
    const sourceFiles = Array.isArray(meta.source_files)
      ? meta.source_files.map(String)
      : meta.source_files
        ? [String(meta.source_files)]
        : [];
    pages.push({
      absPath: abs,
      relPath: relFromWiki.replace(/\.md$/i, ""),
      type,
      title,
      slug: path.basename(abs, ".md"),
      sourceFiles,
      wikilinks: extractWikilinks(body),
      updatedAt: String(meta.updated_at ?? ""),
    });
  }

  return pages.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/** @param {string} relPath */
function inferTypeFromPath(relPath) {
  const top = relPath.split("/")[0];
  for (const [type, dir] of Object.entries(TYPE_TO_DIR)) {
    if (top === dir) return type;
  }
  return "summary";
}

/**
 * @param {string} workspaceRoot
 * @param {{ type?: string, title: string, body: string, sourceFiles?: string[] }} input
 */
export async function createWikiPage(workspaceRoot, input) {
  await initKnowledgeLayout(workspaceRoot);
  const paths = knowledgePaths(workspaceRoot);
  const type = WIKI_PAGE_TYPES.includes(/** @type {any} */ (input.type))
    ? input.type
    : "qa";
  const dirName = TYPE_TO_DIR[type];
  const slug = slugify(input.title);
  const abs = path.join(paths.wiki, dirName, `${slug}.md`);
  const now = new Date().toISOString();

  await mkdir(path.dirname(abs), { recursive: true });

  const body = input.body.trim().startsWith("#")
    ? input.body.trim()
    : `# ${input.title}\n\n${input.body.trim()}`;

  /** @type {Record<string, unknown>} */
  const meta = {
    title: input.title,
    type,
    updated_at: now,
  };
  if (input.sourceFiles?.length) {
    meta.source_files = input.sourceFiles;
  }

  await writeFile(abs, serializeFrontmatter(meta, body), "utf8");
  await refreshIndex(workspaceRoot);

  return {
    ok: true,
    type,
    title: input.title,
    slug,
    relPath: `${dirName}/${slug}`,
    absPath: abs,
  };
}

/** @param {string} workspaceRoot @param {{ title: string, answer: string, query?: string }} input */
export async function saveQueryAsWikiPage(workspaceRoot, input) {
  const body = input.query
    ? `## 问题\n\n${input.query}\n\n## 回答\n\n${input.answer}`
    : input.answer;
  return createWikiPage(workspaceRoot, {
    type: "qa",
    title: input.title,
    body,
    sourceFiles: input.query ? [`query:${slugify(input.query).slice(0, 48)}`] : [],
  });
}

/** @param {string} workspaceRoot @param {string} relPath */
export async function readWikiPageContent(workspaceRoot, relPath) {
  const paths = knowledgePaths(workspaceRoot);
  const abs = path.join(paths.wiki, `${relPath.replace(/\\/g, "/")}.md`);
  if (!existsSync(abs)) return null;
  const raw = await readFile(abs, "utf8");
  const { meta, body } = parseFrontmatter(raw);
  return { meta, body, raw };
}
