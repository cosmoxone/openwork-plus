import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { knowledgePaths } from "./paths.mjs";

const templateDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");

const DEFAULT_AGENTS = `# Knowledge Wiki · AGENTS.md

本文件定义 \`.openwork/knowledge/\` 的 LLM Wiki 维护规约。

## 目录

- \`raw/\` — 不可变源（inbox 待处理、archive 已归档）；LLM **只读**
- \`wiki/\` — LLM 维护的结构化 Markdown
  - \`INDEX.md\` — L1 入口导航
  - \`summaries/\` — 每源一篇摘要
  - \`concepts/\`、\`entities/\`、\`scenarios/\`、\`syntheses/\`、\`qa/\` — 分层知识页

## 页面 frontmatter

\`\`\`yaml
---
title: 页面标题
type: summary | concept | entity | synthesis | qa
source_files:
  - raw/archive/.../file.md
updated_at: ISO-8601
---
\`\`\`

## 工作流

1. **Corpus Scan** — 生成本机 manifest（\`state.json#scanManifest\`）
2. **Ingest** — 读 raw → 更新 summaries + INDEX + wikilink
3. **Query** — L1 INDEX → L2 相关页 → L3 raw/向量（可选）
4. **Lint** — 断链、孤儿页、source_files 过期

## 命名

- 文件名：kebab-case，与 \`title\` 对应
- 交叉引用：\`[[summaries/foo]]\` 或相对路径
`;

const DEFAULT_INDEX = `# 知识库索引

> 由 OpenWork knowledge-wiki 自动生成。ingest 新文档后此页会更新。

## 摘要页

_暂无摘要。使用 **扫描本机文档** 或 **ingest** 投料后会出现条目。_

## 待处理

- 查看 \`raw/inbox/\` 中的待处理文件
`;

/** @param {string} workspaceRoot @param {{ force?: boolean }} [options] */
export async function initKnowledgeLayout(workspaceRoot, options = {}) {
  const paths = knowledgePaths(workspaceRoot);
  const dirs = [
    paths.root,
    paths.raw,
    paths.rawInbox,
    paths.rawArchive,
    paths.wiki,
    paths.wikiSummaries,
    path.join(paths.wiki, "concepts"),
    path.join(paths.wiki, "entities"),
    path.join(paths.wiki, "scenarios"),
    path.join(paths.wiki, "syntheses"),
    path.join(paths.wiki, "qa"),
    paths.logDir,
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  const agentsTemplate = existsSync(path.join(templateDir, "AGENTS.md"))
    ? await readFile(path.join(templateDir, "AGENTS.md"), "utf8")
    : DEFAULT_AGENTS;

  if (options.force || !existsSync(paths.agents)) {
    await writeFile(paths.agents, agentsTemplate, "utf8");
  }
  if (options.force || !existsSync(paths.wikiIndex)) {
    await writeFile(paths.wikiIndex, DEFAULT_INDEX, "utf8");
  }

  return {
    ok: true,
    root: paths.root,
    created: dirs,
  };
}
