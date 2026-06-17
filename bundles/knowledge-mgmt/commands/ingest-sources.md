# /ingest-sources

将源文件 ingest 到 LLM Wiki：归档到 `raw/archive/`，生成 `wiki/summaries/` 并更新 INDEX。

## 用法

```
/ingest-sources <文件或目录路径>
```

## 行为

1. 单文件：复制到 archive，创建 summary 页（含摘录）
2. 目录：对其中可扫描文件逐个 ingest（K0 建议小批次）
3. 更新 `state.json` ingestLog 与 manifest status

## Agent 提示

ingest 后请用 wiki-curator skill **精炼**自动摘要，补充概念链接与要点。
