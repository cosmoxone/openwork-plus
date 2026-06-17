// sqlite-vec-mcp 存储与检索冒烟
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { KnowledgeDb } from "../src/db.mjs";

const dir = await mkdtemp(path.join(os.tmpdir(), "know-"));
const file = path.join(dir, "knowledge.json");
try {
  const db = new KnowledgeDb(file);
  await db.indexDocument({
    path: "notes/alpha.md",
    title: "Alpha",
    content: "OpenWork knowledge management uses semantic search across documents.\n\nDeployment notes for staging.",
  });
  await db.indexDocument({
    path: "notes/beta.md",
    title: "Beta",
    content: "Recipe for chocolate cake and baking temperature settings.",
  });

  const list = await db.listDocuments();
  assert.equal(list.length, 2);

  const hits = await db.semanticSearch({ query: "semantic search documents", top_k: 3 });
  assert.ok(hits.results.length >= 1);
  assert.equal(hits.results[0].path, "notes/alpha.md");

  const hits2 = await db.semanticSearch({ query: "chocolate cake baking", top_k: 2 });
  assert.equal(hits2.results[0].path, "notes/beta.md");

  console.log("PASS: sqlite-vec-mcp store + search");
} finally {
  await rm(dir, { recursive: true, force: true });
}
