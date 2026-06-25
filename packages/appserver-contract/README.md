# @openworkplus/appserver-contract

统一 **App-Server JSON-RPC 2.0 契约**的共享 TypeScript 类型、方法名常量与错误码。

三仓（OpenWork App-Server / ClawX box-agent / 远程 worker）共用的契约 **SSOT（代码侧）**。权威规范文档：

> `hermclaw-docs/docs/06-analysis-design/interfaces/tri-app-server-jsonrpc-contract.md`

## 内容

- JSON-RPC 2.0 信封类型（`JsonRpcRequest` / `Response` / `Error` / `Notification`）
- `ErrorCode`：标准码 + 契约自定义码（`Unauthorized` / `PermissionDenied` / `ApprovalRequired` / `CapabilityUnavailable` / `RuntimeError`）
- `Methods`：按域分组的方法名常量（health / capabilities / system / container / session / turn / fs / exec / mcp / metering / approval / event）
- 握手类型（`InitializeParams` / `InitializeResult` / `ServerCapabilities`）
- 业务 payload（`SystemStatus` / `ContainerSummary` / `ExecCommandApprovalParams` / `UsageEventPayload`）
- 构造器（`makeError` / `makeResult` / `makeNotification`）

## 用途

- OpenWork App-Server 与 ClawX box-agent 实现各自的方法域时，从本包导入方法名与错误码，避免字符串漂移。
- box-agent（Go）侧无法直接消费 TS 类型，但应以本文件为字段对照表保持一致；未来可生成跨语言 schema。
