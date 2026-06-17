---
name: semantic-search
description: 跨文档语义检索并综合回答
---

# 语义检索

当用户需要「在整个知识库中找某类信息」时：

1. 调用 `sqlite-vec-rag` MCP 的 `semantic_search`，`query` 使用用户自然语言问题，`top_k` 默认 5。
2. 阅读返回的 `excerpt` 与 `path`，必要时用 `filesystem` 拉取完整段落。
3. 综合多段结果回答用户，**注明来源路径**与相似度 `score`。
4. 若结果不足，建议用户先 `index_document` 索引缺失文档，或在 UI「文档」页保存后再检索。

斜杠命令 `/semantic-search` 与本技能等价；优先 MCP 检索，避免仅凭会话记忆臆测。
