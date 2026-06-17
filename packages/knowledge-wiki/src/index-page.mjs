import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { knowledgePaths } from "./paths.mjs";

/** @param {string} workspaceRoot */
export async function refreshIndex(workspaceRoot) {
  const paths = knowledgePaths(workspaceRoot);
  if (!existsSync(paths.wikiSummaries)) {
    return false;
  }

  const files = (await readdir(paths.wikiSummaries))
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const lines = [
    "# 知识库索引",
    "",
    "> 由 OpenWork knowledge-wiki 维护。",
    "",
    "## 摘要页",
    "",
  ];

  if (files.length === 0) {
    lines.push("_暂无摘要。_");
  } else {
    for (const file of files) {
      const abs = path.join(paths.wikiSummaries, file);
      const raw = await readFile(abs, "utf8");
      const titleMatch = raw.match(/^title:\s*(.+)$/m);
      const title = titleMatch?.[1]?.trim() ?? file.replace(/\.md$/, "");
      lines.push(`- [[summaries/${file.replace(/\.md$/, "")}]] — ${title}`);
    }
  }

  lines.push("", "## 待处理", "", "- 查看 `raw/inbox/` 中的待 ingest 文件", "");

  await writeFile(paths.wikiIndex, `${lines.join("\n")}\n`, "utf8");
  return true;
}

/** @param {string} workspaceRoot */
export async function readIndex(workspaceRoot) {
  const { wikiIndex } = knowledgePaths(workspaceRoot);
  if (!existsSync(wikiIndex)) return "";
  return readFile(wikiIndex, "utf8");
}
