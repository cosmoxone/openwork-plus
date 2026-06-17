#!/usr/bin/env node
/** bundle preinstall：初始化 .openwork/knowledge/ 骨架（Hub zip 离线可用） */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.env.OW_WORKSPACE_ROOT || process.cwd();
const root = path.join(path.resolve(workspaceRoot), ".openwork", "knowledge");

const dirs = [
  root,
  path.join(root, "raw", "inbox"),
  path.join(root, "raw", "archive"),
  path.join(root, "wiki", "summaries"),
  path.join(root, "wiki", "concepts"),
  path.join(root, "wiki", "entities"),
  path.join(root, "wiki", "scenarios"),
  path.join(root, "wiki", "syntheses"),
  path.join(root, "wiki", "qa"),
  path.join(root, "log"),
];

for (const dir of dirs) {
  await mkdir(dir, { recursive: true });
}

const agents = path.join(root, "AGENTS.md");
if (!existsSync(agents)) {
  await writeFile(
    agents,
    "# Knowledge Wiki · AGENTS.md\n\nSee OpenWork docs/16-knowledge-mgmt-llm-wiki-design.md\n",
    "utf8",
  );
}

const index = path.join(root, "wiki", "INDEX.md");
if (!existsSync(index)) {
  await writeFile(
    index,
    "# 知识库索引\n\n_安装 knowledge-mgmt 后，使用 /corpus-scan 或 /docs UI 开始梳理。_\n",
    "utf8",
  );
}

console.log(`knowledge-mgmt: initialized ${root}`);
