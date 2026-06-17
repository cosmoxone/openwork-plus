import { readFile, writeFile, mkdir, copyFile, appendFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { initKnowledgeLayout } from "./init.mjs";
import { knowledgePaths } from "./paths.mjs";
import { fileId, slugify } from "./slug.mjs";
import { readState, writeState } from "./state.mjs";
import { refreshIndex } from "./index-page.mjs";
import { extractWikilinks } from "./wiki-page.mjs";
import { createWikiPage, resolveWikiLink } from "./pages.mjs";
import { indexIngestedSummary } from "./index-sync.mjs";

const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".html", ".htm"]);

/** @param {string} filePath */
async function readTextExcerpt(filePath, maxChars = 2000) {
  const ext = path.extname(filePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) {
    return `_（${ext || "二进制"} 文件，K0 仅记录元数据；完整摘要请由 Agent ingest 生成）_`;
  }
  const raw = await readFile(filePath, "utf8");
  const trimmed = raw.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}\n\n…（截断）`;
}

/**
 * @param {string} workspaceRoot
 * @param {string} sourcePath
 * @param {{ title?: string }} [options]
 */
export async function ingestSourceFile(workspaceRoot, sourcePath, options = {}) {
  await initKnowledgeLayout(workspaceRoot);
  const abs = path.resolve(sourcePath);
  if (!existsSync(abs)) {
    throw new Error(`源文件不存在: ${abs}`);
  }

  const paths = knowledgePaths(workspaceRoot);
  const id = fileId(abs);
  const archiveDir = path.join(paths.rawArchive, id);
  await mkdir(archiveDir, { recursive: true });

  const archivedName = path.basename(abs);
  const archivedPath = path.join(archiveDir, archivedName);
  await copyFile(abs, archivedPath);

  const title = options.title?.trim() || path.basename(abs, path.extname(abs));
  const slug = slugify(title);
  const summaryRel = path.join("summaries", `${slug}.md`).replace(/\\/g, "/");
  const summaryAbs = path.join(paths.wikiSummaries, `${slug}.md`);

  const excerpt = await readTextExcerpt(abs);
  const now = new Date().toISOString();
  const archiveRel = path.relative(paths.root, archivedPath).replace(/\\/g, "/");

  const body = `---
title: ${title}
type: summary
source_files:
  - ${archiveRel}
updated_at: ${now}
---

# ${title}

**源文件**: \`${archiveRel}\`

## 摘录

${excerpt}

## 后续

- 在会话中使用 \`/ingest-sources\` 或 wiki-curator skill 让 Agent 精炼此摘要
- 关联概念可写入 \`wiki/concepts/\`
`;

  await mkdir(paths.wikiSummaries, { recursive: true });
  await writeFile(summaryAbs, body, "utf8");

  await ensureConceptStubs(workspaceRoot, extractWikilinks(body));
  await refreshIndex(workspaceRoot);
  await indexIngestedSummary(workspaceRoot, summaryRel);

  const state = await readState(workspaceRoot);
  const manifest = state.scanManifest.map((entry) =>
    entry.path === abs ? { ...entry, status: "ingested" } : entry,
  );
  const hasEntry = manifest.some((e) => e.path === abs);
  if (!hasEntry) {
    const st = await stat(abs);
    manifest.push({
      path: abs,
      relativePath: path.basename(abs),
      size: st.size,
      mtimeMs: st.mtimeMs,
      sha256: id,
      ext: path.extname(abs).toLowerCase(),
      status: "ingested",
    });
  }

  state.scanManifest = manifest;
  state.ingestLog = [
    ...(state.ingestLog ?? []),
    { at: now, sourcePath: abs, summaryPath: summaryRel },
  ];
  await writeState(workspaceRoot, state);

  const logLine = `- ${now} ingest \`${abs}\` → \`${summaryRel}\`\n`;
  await appendFile(path.join(paths.logDir, `${now.slice(0, 10)}.md`), logLine, "utf8");

  return {
    ok: true,
    sourcePath: abs,
    archivePath: archivedPath,
    summaryPath: summaryAbs,
    summaryRel,
  };
}

/** @param {string} workspaceRoot @param {string[]} links */
async function ensureConceptStubs(workspaceRoot, links) {
  for (const link of links) {
    if (!link.startsWith("concepts/")) continue;
    if (resolveWikiLink(workspaceRoot, link)) continue;
    const title = link.split("/").pop()?.replace(/-/g, " ") ?? link;
    await createWikiPage(workspaceRoot, {
      type: "concept",
      title,
      body: `_由 ingest 自动创建的概念占位页，请用 wiki-curator 补充内容。_\n\n关联：[[${link}]]`,
    });
  }
}
