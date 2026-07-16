import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { knowledgePaths } from "./paths.mjs";
import { listWikiPages } from "./pages.mjs";
import { TYPE_TO_DIR, WIKI_PAGE_TYPES } from "./wiki-page.mjs";

const SECTION_LABELS = {
  summaries: "摘要页",
  concepts: "概念",
  entities: "实体",
  syntheses: "综合",
  qa: "问答沉淀",
};

/** @param {string} workspaceRoot */
export async function refreshIndex(workspaceRoot) {
  const paths = knowledgePaths(workspaceRoot);
  const pages = await listWikiPages(workspaceRoot);

  const lines = [
    "# 知识库索引",
    "",
    "> 由 OpenWork knowledge-wiki 维护。",
    "",
  ];

  for (const dir of Object.values(TYPE_TO_DIR)) {
    const sectionPages = pages.filter((p) => p.relPath.startsWith(`${dir}/`) || p.type === dirToType(dir));
    lines.push(`## ${SECTION_LABELS[dir] ?? dir}`, "");
    if (sectionPages.length === 0) {
      lines.push(`_暂无${SECTION_LABELS[dir] ?? dir}。_`, "");
      continue;
    }
    for (const page of sectionPages) {
      lines.push(`- [[${page.relPath}]] — ${page.title}`);
    }
    lines.push("");
  }

  lines.push("## 待处理", "", "- 查看 `raw/inbox/` 中的待 ingest 文件", "");

  await writeFile(paths.wikiIndex, `${lines.join("\n")}\n`, "utf8");
  return true;
}

/** @param {string} dir */
function dirToType(dir) {
  for (const type of WIKI_PAGE_TYPES) {
    if (TYPE_TO_DIR[type] === dir) return type;
  }
  return "summary";
}

/** @param {string} workspaceRoot */
export async function readIndex(workspaceRoot) {
  const { wikiIndex } = knowledgePaths(workspaceRoot);
  if (!existsSync(wikiIndex)) return "";
  return readFile(wikiIndex, "utf8");
}

/** @param {string} workspaceRoot */
export async function listWikiTree(workspaceRoot) {
  return listWikiPages(workspaceRoot);
}
