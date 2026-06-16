# test-runner

跨平台测试执行 CLI，输出统一 JSON，供 AI 与 `@openwork/test-db-mcp` 消费。

## 命令

```bash
test-runner run --framework jest|pytest|junit --path ./tests [--record <db>]
test-runner coverage --framework jest|pytest --path .
test-runner list-failures --since 24h [--db <path>]
test-runner compare --base main --current HEAD
```

`--record` 写入与 test-db-mcp 共用的 JSON 库（默认 `%APPDATA%/openwork/test-results.json` 或 `~/.openwork/test-results.json`）。

## 构建

```bash
cd packages/test-runner
go build -o test-runner ./cmd/test-runner
```

Sprint 1 bundle 将各平台二进制放入 `bundles/test-automation/bin/`，由 `ow bundle install` 复制到 `~/.openwork/bin/`。
