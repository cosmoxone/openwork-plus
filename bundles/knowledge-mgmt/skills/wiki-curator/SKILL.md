---
name: wiki-curator
description: LLM Wiki 策展：ingest 源文件、更新 summaries/INDEX、维护 wikilink 与 frontmatter。
---

# Wiki Curator

## 何时使用

- ingest 单文件或批次
- 更新 INDEX.md 导航
- 将问答沉淀为 `wiki/qa/` 或 `wiki/syntheses/`

## Ingest 流程

1. 确认源路径可读；文本类（md/txt/html）优先
2. 调用 ingest：
   ```bash
   node packages/knowledge-wiki/bin/knowledge-wiki.mjs ingest --workspace "$WORKSPACE" --file "/path/to/doc.md"
   ```
3. 打开生成的 `wiki/summaries/*.md`，用 LLM **精炼** K0 自动摘要：
   - 补全 frontmatter
   - 提取 3–5 条要点
   - 添加 `[[concepts/...]]` 链接（如适用）
4. 更新 `wiki/INDEX.md` 确保导航正确

## 原则

- `raw/` 只读；写入仅发生在 `wiki/`
- 每页必须含 `source_files` 指向 archive
- 大改后更新 `updated_at`
