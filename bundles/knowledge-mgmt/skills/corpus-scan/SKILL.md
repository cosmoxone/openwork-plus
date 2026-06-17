---
name: corpus-scan
description: 扫描本机授权目录，生成 knowledge manifest（state.json#scanManifest），为批量 ingest 排队。
---

# Corpus Scan

## 何时使用

- 用户要求「梳理本机文档」「建立知识库」「扫描文件夹」
- 首次启用 knowledge-mgmt bundle 后的整体盘点

## 步骤

1. 确认工作区已安装 knowledge-mgmt，`.openwork/knowledge/` 存在
2. 询问或推断扫描根目录（默认：当前 workspace + 用户授权文件夹）
3. 运行 CLI（或由 MCP 等价操作）：
   ```bash
   node packages/knowledge-wiki/bin/knowledge-wiki.mjs scan --workspace "$WORKSPACE" --roots "/path/to/docs"
   ```
4. 读取 `state.json` 的 `scanManifest`，向用户汇报：
   - 总文件数、pending / ingested
   - 按扩展名分布
5. 询问是否对 pending 条目执行 `/ingest-sources`（K0 可逐批 ingest）

## 约束

- 不修改 `raw/archive` 已有快照
- 跳过 `node_modules`、`.git`、`dist` 等目录
- 不上传 raw 内容到云端
