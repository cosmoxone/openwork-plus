# knowledge-mgmt 手工测试（Sprint 2 / 场景 C）

## 前置

- 仓库：`openwork-platform`，分支 `feat/unified-platform`
- 已执行 `pnpm install`（根目录）
- 已安装 MCP 依赖：`cd packages/sqlite-vec-mcp && npm install`
- 开发机设置：`$env:OPENWORK_MONOREPO_ROOT = "E:\proj\openwork-platform"`

## 1. 安装 bundle（monorepo 本地目录）

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
- `.openwork/knowledge/` 骨架（preinstall）

## 2. Hub 远程安装（阶段 C / K4）

### 2a. 本地 dev Hub

```powershell
cd E:\proj\openwork-platform
pnpm run bundle-hub:dev
# catalog: http://127.0.0.1:9123/catalog.json
```

桌面：**Settings › 行业包** → Catalog URL 填上述地址 → 安装 **个人知识库（LLM Wiki）**。

### 2b. 自动化 smoke

```powershell
node apps/orchestrator/test/knowledge-mgmt-hub-smoke.mjs
```

期望：`PASS: knowledge-mgmt hub install + postuninstall clear-index hook`

### 2c. 生产打包产物

```powershell
pnpm run bundle-hub:build
# → dist/bundle-hub/knowledge-mgmt-<version>.zip
```

发布流程见 `docs/14-bundle-hub-deployment.md` §10。

## 3. MCP 语义检索

```powershell
cd packages/sqlite-vec-mcp
node -e "
import { KnowledgeDb } from './src/db.mjs';
const db = new KnowledgeDb('$ws/knowledge.db');
await db.indexDocument({ path: 'notes/demo.md', content: 'HermClaw fusion and OpenWork bundles.' });
console.log(await db.semanticSearch({ query: 'OpenWork bundles', top_k: 3 }));
"
```

期望：`results[0].path === 'notes/demo.md'`

## 4. UI（桌面或 `pnpm dev:ui`）

1. 打开工作区并确保 `knowledge-mgmt` 已安装（或 MCP 名 `sqlite-vec-rag` 出现在配置中）
2. 侧栏应出现 **文档**，路由 `/docs`
3. Tab：**扫描**（含 watch 监视）、**Wiki**、**检索**、**健康**（Lint + 导出快照）、**本地笔记**
4. 会话内输入 `/semantic-search` + 问题，Agent 应调用 MCP 检索

## 5. K3/K4 CLI

```powershell
node packages/knowledge-wiki/bin/knowledge-wiki.mjs watch-config --workspace $ws
node packages/knowledge-wiki/bin/knowledge-wiki.mjs watch-once --workspace $ws
node packages/knowledge-wiki/bin/knowledge-wiki.mjs export-snapshot --workspace $ws --output E:\tmp\wiki-snap.zip
```

## 6. 冒烟脚本

```powershell
node apps/orchestrator/test/sprint2-smoke.mjs
node packages/knowledge-wiki/test/smoke.mjs
node packages/sqlite-vec-mcp/test/smoke.mjs
node apps/orchestrator/test/knowledge-mgmt-hub-smoke.mjs
```

## 卸载

```powershell
node --input-type=module -e "
import { runBundleCommand } from './apps/orchestrator/src/bundle/index.mjs';
await runBundleCommand(['uninstall', 'knowledge-mgmt', '--workspace', process.argv[1]], {
  monorepoRoot: process.env.OPENWORK_MONOREPO_ROOT,
});
" $ws
```

Hub 安装后卸载会触发 `postuninstall` → `knowledge:clear-index`（dev 需 monorepo CLI）。
