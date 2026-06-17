#!/usr/bin/env node
/** bundle 卸载后清理 workspace 向量索引（保留 wiki 文件） */
import { clearKnowledgeIndex } from "../../../../packages/knowledge-wiki/src/index.mjs";

const workspaceRoot = process.env.OW_WORKSPACE_ROOT || process.cwd();
await clearKnowledgeIndex(workspaceRoot);
console.log(`knowledge-mgmt: cleared vector index for ${workspaceRoot}`);
