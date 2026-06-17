# /corpus-scan

扫描本机文档目录，生成 `.openwork/knowledge/state.json` 中的 **scanManifest**。

## 用法

```
/corpus-scan [目录路径...]
```

无参数时扫描当前 workspace 根目录。

## 行为

1. 初始化 knowledge 目录骨架（若不存在）
2. 遍历 `.md` `.txt` `.pdf` `.docx` `.html` 等（跳过 node_modules/.git）
3. 写入 manifest（path、hash、size、status）
4. 在 UI **扫描** Tab 或 `state.json` 查看进度

## 下一步

对 pending 条目运行 `/ingest-sources` 生成 wiki 摘要页。
