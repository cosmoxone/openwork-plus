# @openworkplus/test-db-mcp

测试结果历史 MCP server（stdio）。默认 JSON 存储，与 `test-runner --record` 同文件格式。

## 工具

- `record_run` — 记录一次测试运行
- `list_failures` — 时间窗口内失败用例
- `get_trend` — 按天通过/失败趋势
- `list_runs` — 最近运行列表

## 运行

```bash
node bin/test-db-mcp.mjs --db ./.openwork/test-results.json
```

## 验证

```bash
npm test
```
