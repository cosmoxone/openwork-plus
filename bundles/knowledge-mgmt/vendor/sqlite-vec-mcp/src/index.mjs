#!/usr/bin/env node
/**
 * @openwork/sqlite-vec-mcp — 知识库 RAG MCP server（stdio）。
 * MVP：JSON 文件存储 + 本地/OpenAI embedding；后续可换 sqlite-vec 后端。
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { KnowledgeDb, defaultDbPath } from "./db.mjs";

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
const db = new KnowledgeDb(dbFile);

const server = new Server(
  { name: "sqlite-vec-rag", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "index_document",
      description: "索引一篇文档（分块 + 向量化），同 path 会覆盖更新",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "文档路径标识，如 notes/meeting.md" },
          content: { type: "string", description: "文档正文（Markdown 或纯文本）" },
          title: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "semantic_search",
      description: "跨文档语义检索，返回最相关片段",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          top_k: { type: "number", description: "默认 5，最大 20" },
        },
        required: ["query"],
      },
    },
    {
      name: "list_documents",
      description: "列出已索引文档及元数据",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "rebuild_index",
      description: "清空并重建索引（传入 documents 数组：{path, title, content}）",
      inputSchema: {
        type: "object",
        properties: {
          documents: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                title: { type: "string" },
                content: { type: "string" },
              },
              required: ["path", "content"],
            },
          },
        },
        required: ["documents"],
      },
    },
    {
      name: "clear_index",
      description: "清空向量索引",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  /** @type {any} */
  let result;
  switch (name) {
    case "index_document":
      result = await db.indexDocument(args ?? {});
      break;
    case "semantic_search":
      result = await db.semanticSearch(args ?? {});
      break;
    case "list_documents":
      result = await db.listDocuments();
      break;
    case "rebuild_index":
      await db.clearAll();
      for (const doc of args?.documents ?? []) {
        await db.indexDocument(doc);
      }
      result = { rebuilt: (args?.documents ?? []).length };
      break;
    case "clear_index":
      result = await db.clearAll();
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
