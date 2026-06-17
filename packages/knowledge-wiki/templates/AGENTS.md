# Knowledge Wiki · AGENTS.md

本文件定义 `.openwork/knowledge/` 的 LLM Wiki 维护规约（Schema）。

## 目录结构

| 路径 | 说明 |
|------|------|
| `raw/inbox/` | 用户投放、待 ingest |
| `raw/archive/` | 已归档不可变源 |
| `wiki/INDEX.md` | L1 导航入口 |
| `wiki/summaries/` | 每源一篇摘要 |
| `wiki/concepts/` | 概念页 |
| `wiki/entities/` | 实体页 |
| `state.json` | 扫描 manifest 与 ingest 日志 |

## Agent 职责

- **ingest**：读 raw，写/更新 wiki 页，刷新 INDEX，记录 `source_files`
- **query**：先 INDEX，再相关页，必要时读 raw
- **lint**：检查断链、孤儿页、过期 source_files

## 命令

- `/corpus-scan` — 本机文档盘点（manifest）
- `/ingest-sources` — 投料 ingest
