#!/usr/bin/env node
/**
 * @openworkplus/test-db-mcp — 测试结果历史 MCP server（stdio）。
 * 与 test-runner JSON 存储格式互通。
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TestDb, defaultDbPath } from "./store.mjs";

function parseArgs(argv) {
  let db = defaultDbPath();
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--db" && argv[i + 1]) {
      db = defaultDbPath(argv[++i]);
    }
  }
  return db;
}

const dbFile = parseArgs(process.argv);
const db = new TestDb(dbFile);

const server = new Server(
  { name: "test-db", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "record_run",
      description: "记录一次测试运行结果（与 test-runner JSON 格式兼容）",
      inputSchema: {
        type: "object",
        properties: {
          framework: { type: "string" },
          path: { type: "string" },
          passed: { type: "number" },
          failed: { type: "number" },
          skipped: { type: "number" },
          cases: { type: "array" },
          coverage: { type: "object" },
        },
      },
    },
    {
      name: "list_failures",
      description: "列出时间窗口内的失败用例（默认 24h）",
      inputSchema: {
        type: "object",
        properties: {
          since_hours: { type: "number", description: "默认 24" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: "get_trend",
      description: "按天聚合通过/失败趋势（默认 7 天）",
      inputSchema: {
        type: "object",
        properties: { days: { type: "number" } },
      },
    },
    {
      name: "list_runs",
      description: "列出最近测试运行记录",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  /** @type {any} */
  let result;
  switch (name) {
    case "record_run":
      result = await db.recordRun(args ?? {});
      break;
    case "list_failures":
      result = await db.listFailures({
        sinceHours: args?.since_hours ?? 24,
        limit: args?.limit ?? 50,
      });
      break;
    case "get_trend":
      result = await db.getTrend(args?.days ?? 7);
      break;
    case "list_runs":
      result = await db.listRuns(args?.limit ?? 20);
      break;
    default:
      throw new Error(`未知工具: ${name}`);
  }
  return {
    content: [{ type: "text", text: JSON.stringify({ db: dbFile, result }, null, 2) }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
