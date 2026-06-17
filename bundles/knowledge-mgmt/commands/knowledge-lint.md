# /knowledge-lint

检查 LLM Wiki 健康度：断链、孤儿页、重复标题、过期 `source_files`。

## 用法

```
/knowledge-lint
/knowledge-lint --fix
```

## 行为

1. 扫描 `wiki/` 下所有页面 frontmatter 与 `[[wikilink]]`
2. 写入 `lint-report.json`
3. `--fix` 时移除断链、清理无效 source_files

## UI

知识库 **健康** Tab 提供相同能力。
