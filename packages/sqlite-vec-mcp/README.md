# @openwork-plus/sqlite-vec-mcp

知识库 RAG MCP server（stdio）。Sprint 2 MVP 使用 **JSON 文件 + 余弦相似度** 实现语义检索，避免 Windows 上原生 `sqlite-vec` 编译问题；接口与融合计划一致。

## 工具

| 工具 | 说明 |
|------|------|
| `index_document` | 索引文档（分块 + 向量化） |
| `semantic_search` | 跨文档语义检索 |
| `list_documents` | 列出已索引文档 |

## 运行

```bash
node packages/sqlite-vec-mcp/bin/sqlite-vec-mcp.mjs --db ./knowledge.json
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `OPENWORK_KNOWLEDGE_DB` | 默认索引文件路径 |
| `OPENAI_API_KEY` | 可选；无则使用确定性本地向量（离线冒烟） |
| `OPENWORK_EMBED_MODEL` | 默认 `text-embedding-3-small` |

## 测试

```bash
cd packages/sqlite-vec-mcp && npm test
```
