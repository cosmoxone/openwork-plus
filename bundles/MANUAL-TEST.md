# Industry Bundle 手工验收

面向 **Settings › 行业包（Bundles）** 与 bundle 安装后侧栏插件。

## 前置

1. 构建内置包：`node scripts/build-builtin-bundles.mjs`
2. 桌面 dev：`pnpm --filter openwork-desktop tauri dev`（或 monorepo 等效 dev 命令）
3. 本地工作区已创建并选中

## 验收步骤

| # | 操作 | 期望 |
|---|------|------|
| 1 | 打开 **Settings › 行业包** | 列表含 `computer-use`、`test-automation`（内置 catalog） |
| 2 | 安装 **computer-use** | 成功；MCP 出现 `gui-operate`；`.openwork/bundle-ui.json` 含该 id |
| 3 | 侧栏 | 出现 **RPA / UI 自动化**（`/plugins/rpa`） |
| 4 | 卸载 computer-use | MCP 移除；侧栏 RPA 消失（刷新后） |
| 5 | **从 ZIP 安装** | 选 `apps/desktop/src-tauri/resources/bundles/computer-use-0.1.0.zip` 成功 |
| 6 | **检查更新** | 先 `pnpm run bundle-hub:dev`；Catalog URL 设 `http://127.0.0.1:9123/catalog.json`；安装 0.1.0 后应显示更新，点更新变为 0.2.0 |

## CLI 冒烟（CI）

```powershell
cd E:\proj\openwork-platform
node scripts/build-builtin-bundles.mjs
node apps/orchestrator/test/bundle-catalog-smoke.mjs
node apps/orchestrator/test/bundle-desktop-cli-smoke.mjs
pnpm test:convergence
```

## 相关

- 产品计划：`docs/13-industry-bundle-productization.md`
- 验收表：`docs/convergence-acceptance-status.md`（P-B1~P-B7）
