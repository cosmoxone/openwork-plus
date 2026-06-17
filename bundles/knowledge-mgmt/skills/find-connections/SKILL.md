---
name: find-connections
description: 发现文档之间的主题关联与引用关系
---

# 关联发现

帮助用户发现知识库中的隐性关联：

1. 用 `list_documents` 列出已索引文档；必要时用 `filesystem` 扫描工作区 `docs/`、`.openwork/` 下的 Markdown。
2. 对目标文档执行 `semantic_search`，查询其核心概念（从标题与首段提取 2-3 个关键词）。
3. 汇总**强关联**（高相似度片段）与**弱关联**（共享实体/术语）文档，说明关联理由。
4. 建议用户可建立的双向链接或标签（如 `#architecture`、`#runbook`）。

输出格式：关联图（Markdown 列表）+ 推荐阅读顺序。
