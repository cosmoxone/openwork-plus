#!/usr/bin/env node
/** bundle preinstall：初始化 .openwork/knowledge/ 骨架 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initKnowledgeLayout } from "../../../../packages/knowledge-wiki/src/index.mjs";

const workspaceRoot =
  process.env.OW_WORKSPACE_ROOT || process.cwd();

await initKnowledgeLayout(workspaceRoot);
console.log(`knowledge-mgmt: initialized ${path.join(workspaceRoot, ".openwork", "knowledge")}`);
