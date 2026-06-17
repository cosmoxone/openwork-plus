# knowledge-mgmt 手工测试（Sprint 2 / 场景 C）

## 前置

- 仓库：`openwork-platform`，分支 `feat/unified-platform`
- 已执行 `pnpm install`（根目录）
- 已安装 MCP 依赖：`cd packages/sqlite-vec-mcp && npm install`

## 1. 安装 bundle

```powershell
$env:OPENWORK_MONOREPO_ROOT = "E:\proj\openwork-platform"
$ws = "E:\tmp\ow-km-demo"
New-Item -ItemType Directory -Force -Path $ws | Out-Null
node --input-type=module -e "
import { runBundleCommand } from './apps/orchestrator/src/bundle/index.mjs';
await runBundleCommand(['install', 'knowledge-mgmt', '--workspace', process.argv[1]], {
  monorepoRoot: process.env.OPENWORK_MONOREPO_ROOT,
});
" $ws
```

期望：

- `opencode.json` 含 `sqlite-vec-rag`、`filesystem` MCP
- `.opencode/skills/semantic-search/SKILL.md` 存在
- `.openwork/bundle-ui.json` 含 `routes: ["/docs"]`

## 2. MCP 语义检索

```powershell
cd packages/sqlite-vec-mcp
node -e "
import { KnowledgeDb } from './src/db.mjs';
const db = new KnowledgeDb('$ws/.openwork/knowledge.json');
await db.indexDocument({ path: 'notes/demo.md', content: 'HermClaw fusion and OpenWork bundles.' });
console.log(await db.semanticSearch({ query: 'OpenWork bundles', top_k: 3 }));
"
```

期望：`results[0].path === 'notes/demo.md'`

## 3. UI（桌面或 `pnpm dev:ui`）

1. 打开工作区并确保 `knowledge-mgmt` 已安装（或 MCP 名 `sqlite-vec-rag` 出现在配置中）
2. 侧栏应出现 **文档**，路由 `/docs`
3. 新建文档、Lexical 编辑、保存（localStorage）
4. 会话内输入 `/semantic-search` + 问题，Agent 应调用 MCP 检索

## 4. 冒烟脚本

```powershell
node apps/orchestrator/test/sprint2-smoke.mjs
node packages/sqlite-vec-mcp/test/smoke.mjs
```

## 卸载

```powershell
node --input-type=module -e "
import { runBundleCommand } from './apps/orchestrator/src/bundle/index.mjs';
await runBundleCommand(['uninstall', 'knowledge-mgmt', '--workspace', process.argv[1]]);
" $ws
```
